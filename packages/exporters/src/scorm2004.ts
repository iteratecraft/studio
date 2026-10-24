// SCORM 2004 4th edition exporter (STD-05, M1-22; standards.md §3.2 E-7..E-12, E-14, §4.3, §4.5):
// imsmanifest.xml in IMS Content Packaging 1.1.4 with the ADL and IMS Simple Sequencing extensions,
// LOM metadata in metadata.xml referenced from the manifest, and the 4th-edition schema files beside
// them at the package root.
import { readFileSync } from "node:fs";
import type { Course } from "@course-suite/format";
import { plainText } from "@course-suite/format";
import type { DescribeInput, Exporter, PackageFile } from "./builder.js";
import { fail, ok, type Problem, type Result } from "./result.js";
import { SCORM12_IDS, SCORM12_MANIFEST, scormIdentifier } from "./scorm12.js";
import { checkSco, esc, ISO_DURATION, only, parseXml, problemsIn } from "./xml.js";

const MANIFEST = SCORM12_MANIFEST;
/** The LOM metadata file the manifest points at (standards.md E-9). */
export const SCORM2004_METADATA = "metadata.xml";
/**
 * The SCORM 2004 4th edition schema set, shipped unchanged (THIRD_PARTY_NOTICES.md): content
 * packaging, ADL content packaging, sequencing and navigation, IMS Simple Sequencing, and the XML
 * namespace schema with the DTDs it names.
 */
export const SCORM2004_SCHEMAS = [
  "XMLSchema.dtd",
  "adlcp_v1p3.xsd",
  "adlnav_v1p3.xsd",
  "adlseq_v1p3.xsd",
  "datatypes.dtd",
  "imscp_v1p1.xsd",
  "imsss_v1p0.xsd",
  "imsss_v1p0auxresource.xsd",
  "imsss_v1p0control.xsd",
  "imsss_v1p0delivery.xsd",
  "imsss_v1p0limit.xsd",
  "imsss_v1p0objective.xsd",
  "imsss_v1p0random.xsd",
  "imsss_v1p0rollup.xsd",
  "imsss_v1p0seqrule.xsd",
  "imsss_v1p0util.xsd",
  "xml.xsd",
] as const;

const NS = {
  imscp: "http://www.imsglobal.org/xsd/imscp_v1p1",
  adlcp: "http://www.adlnet.org/xsd/adlcp_v1p3",
  adlseq: "http://www.adlnet.org/xsd/adlseq_v1p3",
  imsss: "http://www.imsglobal.org/xsd/imsss",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  lom: "http://ltsc.ieee.org/xsd/LOM",
};
const SCHEMA_VERSION = "2004 4th Edition";

export interface Scorm2004Options {
  /** LOM typical learning time as an ISO 8601 duration, such as `PT30M`; omitted when unset. */
  typicalLearningTime?: string;
}

export function scorm2004Exporter(options: Scorm2004Options = {}): Exporter {
  return {
    standard: "scorm2004",
    describe: (input) => describe(input, options),
    check,
  };
}

let schemaFiles: PackageFile[] | undefined;
function schemas(): PackageFile[] {
  schemaFiles ??= SCORM2004_SCHEMAS.map((name) => ({
    path: name,
    data: readFileSync(new URL(`../schemas/scorm2004/${name}`, import.meta.url)),
  }));
  return schemaFiles;
}

function describe(input: DescribeInput, options: Scorm2004Options): Result<PackageFile[]> {
  const { course, packageVersion, launchPage, files } = input;
  const problems: Problem[] = [];
  const edition = course.publish?.scorm2004Edition;
  if (edition !== undefined && edition !== "4th") {
    problems.push({
      file: "course",
      path: "/publish/scorm2004Edition",
      message: `SCORM 2004 ${edition} edition packages are not supported yet; publish the 4th edition`,
    });
  }
  const time = options.typicalLearningTime;
  if (time !== undefined && !ISO_DURATION.test(time)) {
    problems.push({
      file: SCORM2004_METADATA,
      message: `typical learning time '${time}' is not an ISO 8601 duration`,
    });
  }
  if (problems.length > 0) return fail(problems);

  const title = esc(course.title);
  const passing = course.publish?.passingScore;
  const manifest = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<manifest identifier="${esc(scormIdentifier(course, packageVersion))}" version="${packageVersion}"` +
      ` xmlns="${NS.imscp}" xmlns:adlcp="${NS.adlcp}" xmlns:adlseq="${NS.adlseq}" xmlns:imsss="${NS.imsss}" xmlns:xsi="${NS.xsi}"` +
      ` xsi:schemaLocation="${NS.imscp} imscp_v1p1.xsd ${NS.adlcp} adlcp_v1p3.xsd ${NS.adlseq} adlseq_v1p3.xsd ${NS.imsss} imsss_v1p0.xsd">`,
    `  <metadata>`,
    `    <schema>ADL SCORM</schema>`,
    `    <schemaversion>${SCHEMA_VERSION}</schemaversion>`,
    `    <adlcp:location>${SCORM2004_METADATA}</adlcp:location>`,
    `  </metadata>`,
    `  <organizations default="${SCORM12_IDS.organization}">`,
    // Objectives stay local to this course (standards.md E-12).
    `    <organization identifier="${SCORM12_IDS.organization}" adlseq:objectivesGlobalToSystem="false">`,
    `      <title>${title}</title>`,
    `      <item identifier="${SCORM12_IDS.item}" identifierref="${SCORM12_IDS.resource}" isvisible="true">`,
    `        <title>${title}</title>`,
    // The author's passing score as the scaled score that satisfies the objective (standards.md
    // E-14). Not satisfied by measure, so the course's own success status stands (§4.3).
    ...(passing === undefined
      ? []
      : [
          `        <imsss:sequencing>`,
          `          <imsss:objectives>`,
          `            <imsss:primaryObjective satisfiedByMeasure="false">`,
          `              <imsss:minNormalizedMeasure>${passing / 100}</imsss:minNormalizedMeasure>`,
          `            </imsss:primaryObjective>`,
          `          </imsss:objectives>`,
          `        </imsss:sequencing>`,
        ]),
    `      </item>`,
    // Default sequencing (standards.md E-11): free choice and flow, tracked, and the course's own
    // completion and success reports are used.
    `      <imsss:sequencing>`,
    `        <imsss:controlMode choice="true" flow="true"/>`,
    `        <imsss:deliveryControls tracked="true" completionSetByContent="false" objectiveSetByContent="false"/>`,
    `      </imsss:sequencing>`,
    `    </organization>`,
    `  </organizations>`,
    `  <resources>`,
    `    <resource identifier="${SCORM12_IDS.resource}" type="webcontent" adlcp:scormType="sco" href="${esc(launchPage)}">`,
    ...files.map((path) => `      <file href="${esc(path)}"/>`),
    `    </resource>`,
    `  </resources>`,
    `</manifest>`,
    ``,
  ];
  return ok([
    { path: MANIFEST, data: Buffer.from(manifest.join("\n"), "utf8") },
    { path: SCORM2004_METADATA, data: Buffer.from(metadata(course, packageVersion, time), "utf8") },
    ...schemas(),
  ]);
}

/**
 * LOM metadata (standards.md E-4, E-9): title, language, description, keywords, version, status,
 * typical learning time and rights.
 *
 * shortcut: no xsi:schemaLocation, because the LOM schema files are not shipped: their licence is
 * CC BY-SA, outside the licences this repository takes in. Add them once that is cleared.
 */
function metadata(course: Course, packageVersion: number, time: string | undefined): string {
  const lom = course.publish?.lom;
  const description =
    lom?.description ?? (course.description ? plainText(course.description) : undefined);
  const language = lom?.language ?? course.sourceLanguage ?? course.labelSet?.language;
  const string = (text: string) =>
    `<string${language ? ` language="${esc(language)}"` : ""}>${esc(text)}</string>`;
  const vocabulary = (value: string) => `<source>LOMv1.0</source><value>${value}</value>`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<lom xmlns="${NS.lom}">`,
    `  <general>`,
    `    <title>${string(lom?.title ?? course.title)}</title>`,
    ...(language ? [`    <language>${esc(language)}</language>`] : []),
    ...(description ? [`    <description>${string(description)}</description>`] : []),
    ...(lom?.keywords ?? []).map((keyword) => `    <keyword>${string(keyword)}</keyword>`),
    `  </general>`,
    `  <lifeCycle>`,
    `    <version><string language="x-none">${packageVersion}</string></version>`,
    `    <status>${vocabulary("final")}</status>`,
    `  </lifeCycle>`,
    ...(time
      ? [
          `  <educational>`,
          `    <typicalLearningTime><duration>${time}</duration></typicalLearningTime>`,
          `  </educational>`,
        ]
      : []),
    `  <rights>`,
    `    <cost>${vocabulary("no")}</cost>`,
    `    <copyrightAndOtherRestrictions>${vocabulary("yes")}</copyrightAndOtherRestrictions>`,
    `  </rights>`,
    `</lom>`,
    ``,
  ].join("\n");
}

/**
 * Checks a finished package: the manifest is well-formed SCORM 2004 4th edition with one
 * organization, one item and one SCO, its metadata file is LOM, the schema files sit beside it,
 * every listed file exists and every other file is listed (standards.md E-8..E-10, E-14).
 *
 * shortcut: a structural check, not XSD validation, as for SCORM 1.2 (M1-21).
 */
function check(files: ReadonlyMap<string, Uint8Array>): Problem[] {
  const problems: Problem[] = [];
  const add = problemsIn(MANIFEST, problems);
  for (const name of SCORM2004_SCHEMAS) {
    if (!files.has(name))
      problems.push({ file: name, message: "is a SCORM 2004 schema file but is missing" });
  }
  const bytes = files.get(MANIFEST);
  if (!bytes) return [...problems, { file: MANIFEST, message: "is missing" }];
  const root = parseXml(bytes);
  if ("error" in root) {
    add(undefined, root.error);
    return problems;
  }
  if (root.namespaceURI !== NS.imscp || root.localName !== "manifest") {
    add(root, `must be a <manifest> in the ${NS.imscp} namespace`);
    return problems;
  }
  if (!root.getAttribute("identifier")) add(root, "is missing identifier", "identifier");
  const meta = only(root, NS.imscp, "metadata", add);
  const version = only(meta, NS.imscp, "schemaversion", add);
  if (version && version.textContent?.trim() !== SCHEMA_VERSION) {
    add(version, `must be ${SCHEMA_VERSION}`);
  }
  const location = only(meta, NS.adlcp, "location", add);
  if (location && location.textContent?.trim() !== SCORM2004_METADATA) {
    add(location, `must be ${SCORM2004_METADATA}`);
  }
  const lom = files.get(SCORM2004_METADATA);
  if (!lom) problems.push({ file: SCORM2004_METADATA, message: "is missing" });
  else {
    const lomRoot = parseXml(lom);
    const error =
      "error" in lomRoot
        ? lomRoot.error
        : lomRoot.namespaceURI !== NS.lom || lomRoot.localName !== "lom"
          ? `must be a <lom> in the ${NS.lom} namespace`
          : undefined;
    if (error) problems.push({ file: SCORM2004_METADATA, message: error });
  }

  const { item } = checkSco(
    root,
    { imscp: NS.imscp, adlcp: NS.adlcp, scormType: "scormType" },
    files,
    new Set([MANIFEST, SCORM2004_METADATA, ...SCORM2004_SCHEMAS]),
    add,
  );
  const measure = item
    ?.getElementsByTagNameNS(NS.imsss, "primaryObjective")[0]
    ?.getElementsByTagNameNS(NS.imsss, "minNormalizedMeasure")[0];
  const value = Number(measure?.textContent);
  if (measure && !(measure.textContent?.trim() && value >= -1 && value <= 1)) {
    add(measure, "must be a number from -1 to 1");
  }
  return problems;
}
