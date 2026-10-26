// The one place where editor code turns HTML into course rich text (BLK-03: normalise once at the
// editor boundary). Only the format's elements and attributes stay (@course-suite/format
// RICH_TEXT_ELEMENTS), the browser's own tags become their meaning (b to strong, i to em, strike to
// s, div to p), style and class attributes go, and text outside a paragraph, heading or list is put
// in a paragraph. RichTextField cleans what it is given before it shows it, as course files come
// from anywhere, and its callers clean what it gives out (typed or pasted) before they keep it.
import {
  isSafeLink,
  RICH_TEXT_ATTRIBUTES,
  RICH_TEXT_DROPPED,
  RICH_TEXT_ELEMENTS,
} from "@course-suite/format";

const RENAMED: Readonly<Record<string, string>> = {
  b: "strong",
  i: "em",
  strike: "s",
  div: "p",
};
/** Elements that stand on their own at the top level; anything else goes into a paragraph. */
const BLOCKS = new Set([
  "p",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
]);

/** Course rich text from the HTML a rich-text field holds; "" when it holds no text. */
export function cleanRichText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const content = template.content;
  clean(content);
  // Runs of text and inline elements at the top level each become one paragraph.
  let run: HTMLParagraphElement | undefined;
  for (const node of [...content.childNodes]) {
    if (node instanceof Element && BLOCKS.has(node.localName)) {
      run = undefined;
      continue;
    }
    if (!run) {
      run = document.createElement("p");
      node.before(run);
    }
    run.append(node);
  }
  // Paragraphs and headings with no text go, and so does a line break at the end of one.
  for (const block of [...content.querySelectorAll("p, h2, h3, h4, h5, h6, li")]) {
    while (block.lastChild instanceof HTMLBRElement) block.lastChild.remove();
    if (block.textContent?.trim() === "" && block.localName !== "li") block.remove();
  }
  for (const list of [...content.querySelectorAll("ul, ol")]) {
    if (list.textContent?.trim() === "") list.remove();
  }
  return template.innerHTML.trim();
}

function clean(parent: ParentNode): void {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (!(node instanceof Element) || RICH_TEXT_DROPPED.has(node.localName)) {
      node.remove();
      continue;
    }
    clean(node);
    // An element of SVG or MathML is never course rich text, even with an HTML name.
    const html = node.namespaceURI === "http://www.w3.org/1999/xhtml";
    const name = RENAMED[node.localName] ?? node.localName;
    const href = node.getAttribute("href");
    const unsafeLink = name === "a" && (href === null || !isSafeLink(href));
    // A span carries nothing once its style is gone.
    if (!html || name === "span" || unsafeLink || !RICH_TEXT_ELEMENTS.has(name)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    const kept = name === node.localName ? node : document.createElement(name);
    if (kept !== node) {
      kept.append(...node.childNodes);
      node.replaceWith(kept);
    }
    for (const { name: attribute, value } of [...node.attributes]) {
      if (RICH_TEXT_ATTRIBUTES.has(attribute) || (attribute === "href" && name === "a")) {
        kept.setAttribute(attribute, attribute === "href" ? value.trim() : value);
      }
    }
    for (const { name: attribute } of [...kept.attributes]) {
      if (!RICH_TEXT_ATTRIBUTES.has(attribute) && !(attribute === "href" && name === "a")) {
        kept.removeAttribute(attribute);
      }
    }
  }
}
