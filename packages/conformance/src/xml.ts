// Small helpers over @xmldom/xmldom that keep a precise path and line for every problem.
import { DOMParser, type Element, ParseError } from "@xmldom/xmldom";
import type { Problem, Result } from "./result.js";

const ELEMENT_NODE = 1;

export function parseXml(file: string, text: string): Result<Element> {
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(message);
    },
  });
  try {
    const root = parser.parseFromString(text, "text/xml").documentElement;
    if (root) return { ok: true, value: root };
    return { ok: false, problems: [{ file, message: "has no root element" }] };
  } catch (error) {
    const line = error instanceof ParseError ? error.locator?.lineNumber : undefined;
    const message = `is not well-formed XML: ${error instanceof Error ? error.message : error}`;
    return { ok: false, problems: [{ file, message, ...(typeof line === "number" && { line }) }] };
  }
}

/** Element children by local name, ignoring namespace prefixes. */
export function children(parent: Element, localName: string): Element[] {
  const found: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === ELEMENT_NODE && (node as Element).localName === localName) {
      found.push(node as Element);
    }
  }
  return found;
}

export const child = (parent: Element, localName: string): Element | undefined =>
  children(parent, localName)[0];

export const text = (element: Element | undefined): string | undefined =>
  element?.textContent?.trim() || undefined;

/** Attribute value by local name in any namespace, or undefined when absent or blank. */
export function attr(element: Element, localName: string): string | undefined {
  for (const a of Array.from(element.attributes)) {
    if ((a.localName ?? a.name).toLowerCase() === localName.toLowerCase()) {
      return a.value.trim() || undefined;
    }
  }
  return undefined;
}

/** `manifest/organizations/organization[2]/item[1]`; an index appears only when siblings share a name. */
export function pathOf(element: Element): string {
  const parts: string[] = [];
  for (let el: Element | null = element; el; el = el.parentNode as Element | null) {
    if (el.nodeType !== ELEMENT_NODE) break;
    const parent = el.parentNode as Element | null;
    const name = el.localName ?? el.nodeName;
    const same = parent?.nodeType === ELEMENT_NODE ? children(parent, name) : [el];
    parts.unshift(same.length > 1 ? `${name}[${same.indexOf(el) + 1}]` : name);
  }
  return parts.join("/");
}

/** Builds problems for one XML file, each carrying the element's path and line. */
export function problemsFor(file: string) {
  const problems: Problem[] = [];
  const add = (element: Element, message: string, attribute?: string) => {
    const path = pathOf(element) + (attribute ? `/@${attribute}` : "");
    const line = element.lineNumber;
    problems.push({ file, path, message, ...(line !== undefined && { line }) });
  };
  return { problems, add };
}
