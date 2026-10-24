// SCORM 1.2 exporter (STD-04, standards.md §3.1 E-1..E-6, §4.5): imsmanifest.xml in IMS Content
// Packaging 1.1.2 with the ADL extensions and inline IMS metadata 1.2.1, and the ADL SCORM 1.2 schema
// files beside it at the package root.
import { readFileSync } from "node:fs";
import type { Course } from "@course-suite/format";
import { plainText } from "@course-suite/format";
import { DOMParser, type Element } from "@xmldom/xmldom";
import type { DescribeInput, Exporter, PackageFile } from "./builder.js";
import { fail, ok, type Problem, type Result } from "./result.js";

export const SCORM12_MANIFEST = "imsmanifest.xml";
/** The ADL SCORM 1.2 schema set, shipped unchanged (THIRD_PARTY_NOTICES.md). */
export const SCORM12_SCHEMAS = [
  "adlcp_rootv1p2.xsd",
  "ims_xml.xsd",
  "imscp_rootv1p1p2.xsd",
  "imsmd_rootv1p2p1.xsd",
] as const;

const NS = {
  imscp: "http://www.imsproject.org/xsd/imscp_rootv1p1p2",
  adlcp: "http://www.adlnet.org/xsd/adlcp_rootv1p2",
  imsmd: "http://www.imsglobal.org/xsd/imsmd_rootv1p2p1",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
};
/** Item, organization and resource identifiers: fixed, so an LMS can match the SCO across updates. */
export const SCORM12_IDS = { organization: "org", item: "item", resource: "sco" } as const;

export interface Scorm12Options {
  /** LOM typical learning time as an ISO 8601 duration, such as `PT30M`; omitted when unset. */
  typicalLearningTime?: string;
}

/**
 * The manifest identifier: the author's base identifier (or one derived from the project id, so it
 * stays the same on every republish), then `_` and the package version (rise.md §4 "Published
 * SCORM 1.2 package", standards.md E-6).
 */
export function scorm12Identifier(course: Course, packageVersion: number): string {
  return `${course.publish?.manifestIdentifier ?? `course-${course.id}`}_${packageVersion}`;
}

export function scorm12Exporter(options: Scorm12Options = {}): Exporter {
  return {
    standard: "scorm12",
    describe: (input) => describe(input, options),
    check,
  };
}

let schemaFiles: PackageFile[] | undefined;
function schemas(): PackageFile[] {
  schemaFiles ??= SCORM12_SCHEMAS.map((name) => ({
    path: name,
    data: readFileSync(new URL(`../schemas/scorm12/${name}`, import.meta.url)),
  }));
  return schemaFiles;
}

function describe(input: DescribeInput, options: Scorm12Options): Result<PackageFile[]> {
  const { course, packageVersion, launchPage, files } = input;
  const time = options.typicalLearningTime;
  if (
    time !== undefined &&
    !/^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(time)
  ) {
    return fail([
      {
        file: SCORM12_MANIFEST,
        message: `typical learning time '${time}' is not an ISO 8601 duration`,
      },
    ]);
  }
  const lom = course.publish?.lom;
  const description =
    lom?.description ?? (course.description ? plainText(course.description) : undefined);
  const language = lom?.language ?? course.sourceLanguage ?? course.labelSet?.language;
  const mastery = course.publish?.passingScore;
  const vocabulary = (value: string) =>
    `<imsmd:source><imsmd:langstring xml:lang="x-none">LOMv1.0</imsmd:langstring></imsmd:source>` +
    `<imsmd:value><imsmd:langstring xml:lang="x-none">${value}</imsmd:langstring></imsmd:value>`;
  const langstring = (text: string) =>
    `<imsmd:langstring${language ? ` xml:lang="${esc(language)}"` : ""}>${esc(text)}</imsmd:langstring>`;

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<manifest identifier="${esc(scorm12Identifier(course, packageVersion))}" version="${packageVersion}"` +
      ` xmlns="${NS.imscp}" xmlns:adlcp="${NS.adlcp}" xmlns:imsmd="${NS.imsmd}" xmlns:xsi="${NS.xsi}"` +
      ` xsi:schemaLocation="${NS.imscp} imscp_rootv1p1p2.xsd ${NS.imsmd} imsmd_rootv1p2p1.xsd ${NS.adlcp} adlcp_rootv1p2.xsd">`,
    `  <metadata>`,
    `    <schema>ADL SCORM</schema>`,
    `    <schemaversion>1.2</schemaversion>`,
    `    <imsmd:lom>`,
    `      <imsmd:general>`,
    `        <imsmd:title>${langstring(lom?.title ?? course.title)}</imsmd:title>`,
    ...(language ? [`        <imsmd:language>${esc(language)}</imsmd:language>`] : []),
    ...(description
      ? [`        <imsmd:description>${langstring(description)}</imsmd:description>`]
      : []),
    ...(lom?.keywords ?? []).map(
      (keyword) => `        <imsmd:keyword>${langstring(keyword)}</imsmd:keyword>`,
    ),
    `      </imsmd:general>`,
    `      <imsmd:lifecycle>`,
    `        <imsmd:version><imsmd:langstring xml:lang="x-none">${packageVersion}</imsmd:langstring></imsmd:version>`,
    `        <imsmd:status>${vocabulary("Final")}</imsmd:status>`,
    `      </imsmd:lifecycle>`,
    ...(time
      ? [
          `      <imsmd:educational>`,
          `        <imsmd:typicallearningtime><imsmd:datetime>${time}</imsmd:datetime></imsmd:typicallearningtime>`,
          `      </imsmd:educational>`,
        ]
      : []),
    `      <imsmd:rights>`,
    `        <imsmd:cost>${vocabulary("no")}</imsmd:cost>`,
    `        <imsmd:copyrightandotherrestrictions>${vocabulary("yes")}</imsmd:copyrightandotherrestrictions>`,
    `      </imsmd:rights>`,
    `    </imsmd:lom>`,
    `  </metadata>`,
    `  <organizations default="${SCORM12_IDS.organization}">`,
    `    <organization identifier="${SCORM12_IDS.organization}">`,
    `      <title>${esc(course.title)}</title>`,
    `      <item identifier="${SCORM12_IDS.item}" identifierref="${SCORM12_IDS.resource}" isvisible="true">`,
    `        <title>${esc(course.title)}</title>`,
    ...(mastery === undefined
      ? []
      : [`        <adlcp:masteryscore>${mastery}</adlcp:masteryscore>`]),
    `      </item>`,
    `    </organization>`,
    `  </organizations>`,
    `  <resources>`,
    `    <resource identifier="${SCORM12_IDS.resource}" type="webcontent" adlcp:scormtype="sco" href="${esc(launchPage)}">`,
    ...files.map((path) => `      <file href="${esc(path)}"/>`),
    `    </resource>`,
    `  </resources>`,
    `</manifest>`,
    ``,
  ];
  return ok([
    { path: SCORM12_MANIFEST, data: Buffer.from(lines.join("\n"), "utf8") },
    ...schemas(),
  ]);
}

/**
 * Checks a finished package: the manifest is well-formed SCORM 1.2 with one organization, one item
 * and one SCO; the schema files sit beside it; every listed file exists and every other file is
 * listed (standards.md E-1..E-3).
 *
 * shortcut: a structural check, not XSD validation. libxml2 rejects the 2001 IMS metadata schema
 * (non-deterministic content models), so full schema validation needs another validator (M1-21).
 */
function check(files: ReadonlyMap<string, Uint8Array>): Problem[] {
  const problems: Problem[] = [];
  const add = (element: Element | undefined, message: string, attribute?: string) => {
    const path = element && pathOf(element) + (attribute ? `/@${attribute}` : "");
    const line = element?.lineNumber;
    problems.push({
      file: SCORM12_MANIFEST,
      ...(path && { path }),
      ...(line !== undefined && { line }),
      message,
    });
  };
  for (const name of SCORM12_SCHEMAS) {
    if (!files.has(name))
      problems.push({ file: name, message: "is a SCORM 1.2 schema file but is missing" });
  }
  const bytes = files.get(SCORM12_MANIFEST);
  if (!bytes) return [...problems, { file: SCORM12_MANIFEST, message: "is missing" }];

  let root: Element | null;
  try {
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message);
      },
    });
    root = parser.parseFromString(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      "text/xml",
    ).documentElement;
  } catch (error) {
    add(
      undefined,
      `is not well-formed UTF-8 XML: ${error instanceof Error ? error.message : error}`,
    );
    return problems;
  }
  if (root?.namespaceURI !== NS.imscp || root.localName !== "manifest") {
    add(root ?? undefined, `must be a <manifest> in the ${NS.imscp} namespace`);
    return problems;
  }
  if (!root.getAttribute("identifier")) add(root, "is missing identifier", "identifier");
  const version = only(only(root, NS.imscp, "metadata", add), NS.imscp, "schemaversion", add);
  if (version && version.textContent?.trim() !== "1.2") add(version, "must be 1.2");

  const organization = only(
    only(root, NS.imscp, "organizations", add),
    NS.imscp,
    "organization",
    add,
  );
  const item = only(organization, NS.imscp, "item", add);
  const resource = only(only(root, NS.imscp, "resources", add), NS.imscp, "resource", add);
  if (
    item &&
    resource &&
    item.getAttribute("identifierref") !== resource.getAttribute("identifier")
  ) {
    add(item, "must reference the SCO resource", "identifierref");
  }
  if (item?.getAttribute("isvisible") === "false") add(item, "must be visible", "isvisible");
  const mastery = item && elements(item, NS.adlcp, "masteryscore")[0];
  const score = Number(mastery?.textContent);
  if (mastery && !(mastery.textContent?.trim() && score >= 0 && score <= 100)) {
    add(mastery, "must be a number from 0 to 100");
  }
  if (!resource) return problems;
  if (resource.getAttributeNS(NS.adlcp, "scormtype") !== "sco") {
    add(resource, "must be marked adlcp:scormtype 'sco'", "scormtype");
  }
  if (resource.getAttribute("type") !== "webcontent") add(resource, "must be webcontent", "type");
  const href = resource.getAttribute("href") ?? "";
  if (!files.has(href)) add(resource, `launches '${href}', which is not in the package`, "href");

  const listed = new Set<string>();
  for (const file of elements(resource, NS.imscp, "file")) {
    const path = file.getAttribute("href") ?? "";
    if (!files.has(path)) add(file, `lists '${path}', which is not in the package`, "href");
    listed.add(path);
  }
  const descriptor = new Set<string>([SCORM12_MANIFEST, ...SCORM12_SCHEMAS]);
  for (const path of files.keys()) {
    if (!listed.has(path) && !descriptor.has(path)) {
      add(resource, `does not list '${path}', which is in the package`);
    }
  }
  return problems;
}

function elements(parent: Element, namespace: string, localName: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 &&
      (node as Element).namespaceURI === namespace &&
      (node as Element).localName === localName,
  );
}

/** The one child element named `localName`, or undefined after reporting why there is not one. */
function only(
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

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
