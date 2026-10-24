// DOM helpers for the player: element creation and rich text from the course document.
import type { Labels } from "@course-suite/labels";

type Child = Node | string | undefined | false;
type Props = Record<string, string | number | boolean | undefined>;

/** An element with attributes (true is an empty attribute; false and undefined are left out). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === true) element.setAttribute(name, "");
    else if (value !== undefined && value !== false) element.setAttribute(name, String(value));
  }
  element.append(
    ...children.filter((child): child is Node | string => child !== undefined && child !== false),
  );
  return element;
}

let nextId = 0;
/** A document-unique id for aria references. */
export const uid = (prefix: string) => `${prefix}-${++nextId}`;

// Rich text is HTML written in the editor (ADR-0002 RichText). The editor previews courses with this
// player, so a co-author's text must never run script: only these elements and attributes survive.
const KEEP = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "cite",
  "code",
  "del",
  "em",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
]);
// Dropped with everything inside them; any other element is replaced by its cleaned content.
const DROP = new Set([
  "embed",
  "iframe",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "template",
  "textarea",
  "title",
]);
const SAFE_URL = /^(https?:|mailto:)/i;

/** Course rich text as nodes, with every element and attribute outside the allow-list removed. */
export function richText(html: string, labels: Labels): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  clean(template.content, labels);
  return template.content;
}

function clean(parent: ParentNode, labels: Labels): void {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (!(node instanceof Element) || DROP.has(node.localName)) {
      node.remove();
      continue;
    }
    clean(node, labels);
    if (!KEEP.has(node.localName) || node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const { name, value } of [...node.attributes]) {
      const keep =
        name === "lang" || name === "dir" || (name === "href" && SAFE_URL.test(value.trim()));
      if (!keep) node.removeAttribute(name);
    }
    if (node.localName === "a" && node.hasAttribute("href")) {
      // Inside an LMS frame a link must not replace the course, so it opens a new tab and says so.
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      node.append(h("span", { class: "visually-hidden" }, ` (${labels["sr.newTab"]})`));
    }
  }
}
