// DOM helpers for the player: element creation and rich text from the course document.
import {
  isLessonLink,
  isSafeLink,
  RICH_TEXT_ATTRIBUTES,
  RICH_TEXT_DROPPED,
  RICH_TEXT_ELEMENTS,
} from "@course-suite/format";
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
// player, so a co-author's text must never run script: only the format's elements and attributes
// survive (@course-suite/format RICH_TEXT_ELEMENTS).
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
    if (!(node instanceof Element) || RICH_TEXT_DROPPED.has(node.localName)) {
      node.remove();
      continue;
    }
    clean(node, labels);
    if (
      !RICH_TEXT_ELEMENTS.has(node.localName) ||
      node.namespaceURI !== "http://www.w3.org/1999/xhtml"
    ) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const { name, value } of [...node.attributes]) {
      const keep = RICH_TEXT_ATTRIBUTES.has(name) || (name === "href" && isSafeLink(value));
      if (!keep) node.removeAttribute(name);
    }
    const href = node.localName === "a" ? node.getAttribute("href") : null;
    if (href !== null && !isLessonLink(href)) {
      // Inside an LMS frame a link must not replace the course, so it opens a new tab and says so.
      // A link to a lesson or a block of this course opens it in place.
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      node.append(h("span", { class: "visually-hidden" }, ` (${labels["sr.newTab"]})`));
    }
  }
}
