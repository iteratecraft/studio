// XML helpers the SCORM exporters share: escaping what they write, and reading back a descriptor to
// check it, with problems that name the element at fault.
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { Problem } from "./result.js";

/** The UTF-8 bytes of `text`, as the exporters store every file they write. */
export const utf8 = (text: string) => new TextEncoder().encode(text);

/** Text and attribute values, escaped for XML. */
export const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** An ISO 8601 duration such as `PT30M`, as LOM typical learning time takes it. */
export const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

/** Reports problems in `file`, each with the element path and line it is about. */
export function problemsIn(file: string, problems: Problem[]) {
  return (element: Element | undefined, message: string, attribute?: string) => {
    const path = element && pathOf(element) + (attribute ? `/@${attribute}` : "");
    const line = element?.lineNumber;
    problems.push({
      file,
      ...(path && { path }),
      ...(line !== undefined && { line }),
      message,
    });
  };
}

/** The root element of a UTF-8 XML file, or the reason it is not well-formed. */
export function parseXml(bytes: Uint8Array): Element | { error: string } {
  try {
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message);
      },
    });
    const root = parser.parseFromString(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      "text/xml",
    ).documentElement;
    if (!root) return { error: "has no root element" };
    return root;
  } catch (error) {
    return {
      error: `is not well-formed UTF-8 XML: ${error instanceof Error ? error.message : error}`,
    };
  }
}

export function elements(parent: Element, namespace: string, localName: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 &&
      (node as Element).namespaceURI === namespace &&
      (node as Element).localName === localName,
  );
}

/** The one child element named `localName`, or undefined after reporting why there is not one. */
export function only(
  parent: Element | undefined,
  namespace: string,
  localName: string,
  add: (element: Element, message: string) => void,
): Element | undefined {
  if (!parent) return undefined;
  const found = elements(parent, namespace, localName);
  if (found.length !== 1) add(found[1] ?? parent, `must contain exactly one <${localName}>`);
  return found[0];
}

/** `manifest/resources/resource/file[3]`; an index appears only when siblings share a name. */
function pathOf(element: Element): string {
  const parts: string[] = [];
  for (let el: Element | null = element; el?.nodeType === 1; el = el.parentNode as Element | null) {
    const parent = el.parentNode as Element | null;
    const same =
      parent?.nodeType === 1 ? elements(parent, el.namespaceURI ?? "", el.localName ?? "") : [el];
    parts.unshift(same.length > 1 ? `${el.localName}[${same.indexOf(el) + 1}]` : `${el.localName}`);
  }
  return parts.join("/");
}

/** The namespaces and attribute name of one SCORM edition's manifest. */
export interface ScormNames {
  imscp: string;
  adlcp: string;
  /** `scormtype` in SCORM 1.2, `scormType` in SCORM 2004. */
  scormType: string;
}

/**
 * Checks the organization, item and SCO resource of a manifest the exporters write: one of each,
 * the item visible and pointing at the resource, the launch page in the package, every listed file
 * in the package and every other file listed, except `descriptor` files (standards.md E-2, E-3,
 * E-10). Returns the item and resource for the edition's own checks.
 */
export function checkSco(
  root: Element,
  names: ScormNames,
  files: ReadonlyMap<string, Uint8Array>,
  descriptor: ReadonlySet<string>,
  add: ReturnType<typeof problemsIn>,
): { item?: Element; resource?: Element } {
  const organization = only(
    only(root, names.imscp, "organizations", add),
    names.imscp,
    "organization",
    add,
  );
  const item = only(organization, names.imscp, "item", add);
  const resource = only(only(root, names.imscp, "resources", add), names.imscp, "resource", add);
  if (
    item &&
    resource &&
    item.getAttribute("identifierref") !== resource.getAttribute("identifier")
  ) {
    add(item, "must reference the SCO resource", "identifierref");
  }
  if (item?.getAttribute("isvisible") === "false") add(item, "must be visible", "isvisible");
  if (!resource) return { ...(item && { item }) };
  if (resource.getAttributeNS(names.adlcp, names.scormType) !== "sco") {
    add(resource, `must be marked adlcp:${names.scormType} 'sco'`, names.scormType);
  }
  if (resource.getAttribute("type") !== "webcontent") add(resource, "must be webcontent", "type");
  const href = resource.getAttribute("href") ?? "";
  if (!files.has(href)) add(resource, `launches '${href}', which is not in the package`, "href");

  const listed = new Set<string>();
  for (const file of elements(resource, names.imscp, "file")) {
    const path = file.getAttribute("href") ?? "";
    if (!files.has(path)) add(file, `lists '${path}', which is not in the package`, "href");
    listed.add(path);
  }
  for (const path of files.keys()) {
    if (!listed.has(path) && !descriptor.has(path)) {
      add(resource, `does not list '${path}', which is in the package`);
    }
  }
  return { ...(item && { item }), resource };
}
