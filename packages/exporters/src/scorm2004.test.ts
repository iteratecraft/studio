import { describe, expect, test } from "vitest";
import { stubCourse } from "../test/stub.js";
import {
  type DescribeInput,
  type PackageFile,
  SCORM2004_METADATA,
  SCORM2004_SCHEMAS,
  scorm2004Exporter,
} from "./index.js";

const MANIFEST = "imsmanifest.xml";
const content = ["course/data.js", "index.html", "media/cover-small.jpg", "player/boot.js"];
const input = (overrides: Partial<DescribeInput> = {}): DescribeInput => ({
  course: stubCourse(),
  packageVersion: 3,
  launchPage: "index.html",
  files: content,
  ...overrides,
});

function describeFiles(overrides: Partial<DescribeInput> = {}, typicalLearningTime = "PT20M") {
  const result = scorm2004Exporter({ typicalLearningTime }).describe(input(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
}

const text = (files: PackageFile[], path: string) =>
  new TextDecoder().decode(files.find((f) => f.path === path)?.data);
const manifestOf = (files: PackageFile[]) => text(files, MANIFEST);

/** The whole package as the builder hands it to `check`. */
function packageFiles(manifest?: string): Map<string, Uint8Array> {
  const files = new Map(describeFiles().map((f) => [f.path, f.data] as const));
  for (const path of content) files.set(path, new Uint8Array([1]));
  if (manifest !== undefined) files.set(MANIFEST, new TextEncoder().encode(manifest));
  return files;
}

describe("SCORM 2004 4th edition manifest", () => {
  test("[standards:E-8] [standards:E-9] has metadata.xml and the 4th-edition schema set beside it and lists every content file", () => {
    const files = describeFiles();
    expect(files.map((f) => f.path)).toEqual([MANIFEST, SCORM2004_METADATA, ...SCORM2004_SCHEMAS]);
    const manifest = manifestOf(files);
    expect([...manifest.matchAll(/<file href="([^"]+)"\/>/g)].map((m) => m[1])).toEqual(content);
    expect(manifest).toContain("<schema>ADL SCORM</schema>");
    expect(manifest).toContain("<schemaversion>2004 4th Edition</schemaversion>");
    expect(manifest).toContain("<adlcp:location>metadata.xml</adlcp:location>");
    expect(manifest).toContain('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"');
  });

  test("[standards:E-10] has one organization, one visible item and one SCO launching the player", () => {
    const manifest = manifestOf(describeFiles());
    expect(manifest.match(/<organization /g)).toHaveLength(1);
    expect(manifest.match(/<item /g)).toHaveLength(1);
    expect(manifest).toContain('<item identifier="item" identifierref="sco" isvisible="true">');
    expect(manifest).toContain(
      '<resource identifier="sco" type="webcontent" adlcp:scormType="sco" href="index.html">',
    );
  });

  test("[standards:E-11] [standards:E-12] writes the default sequencing on the organization, objectives not global", () => {
    const manifest = manifestOf(describeFiles());
    expect(manifest).toContain(
      '<organization identifier="org" adlseq:objectivesGlobalToSystem="false">',
    );
    expect(manifest).toMatch(
      /<\/item>\s*<imsss:sequencing>\s*<imsss:controlMode choice="true" flow="true"\/>\s*<imsss:deliveryControls tracked="true" completionSetByContent="false" objectiveSetByContent="false"\/>\s*<\/imsss:sequencing>\s*<\/organization>/,
    );
  });

  test("[standards:E-14] writes the passing score as the primary objective's measure only when the author set one", () => {
    expect(manifestOf(describeFiles())).toMatch(
      /<imsss:primaryObjective satisfiedByMeasure="false">\s*<imsss:minNormalizedMeasure>0.8<\/imsss:minNormalizedMeasure>/,
    );
    const course = stubCourse();
    delete course.publish?.passingScore;
    const manifest = manifestOf(describeFiles({ course }));
    expect(manifest).not.toContain("primaryObjective");
    expect(manifest.match(/<imsss:sequencing>/g)).toHaveLength(1);
  });

  test("[standards:E-6] ends its identifier with the package version and keeps it across republishes", () => {
    expect(manifestOf(describeFiles())).toContain(
      '<manifest identifier="workshop_safety_3" version="3"',
    );
    expect(manifestOf(describeFiles({ packageVersion: 4 }))).toContain(
      '<manifest identifier="workshop_safety_4" version="4"',
    );
    const course = stubCourse();
    delete course.publish?.manifestIdentifier;
    expect(manifestOf(describeFiles({ course }))).toContain(
      `<manifest identifier="course-${course.id}_3"`,
    );
  });

  test("[standards:E-4] [standards:E-9] metadata.xml is LOM: title, language, description, keywords, version, status, learning time, rights", () => {
    const lom = text(describeFiles(), SCORM2004_METADATA);
    expect(lom).toContain('<lom xmlns="http://ltsc.ieee.org/xsd/LOM">');
    expect(lom).toContain(
      '<title><string language="en-GB">Workshop safety &#38; you</string></title>',
    );
    expect(lom).toContain("<language>en-GB</language>");
    expect(lom).toContain(
      '<description><string language="en-GB">What to check before you start.</string></description>',
    );
    expect(lom).toContain('<keyword><string language="en-GB">workshop</string></keyword>');
    expect(lom).toContain('<version><string language="x-none">3</string></version>');
    expect(lom).toContain("<status><source>LOMv1.0</source><value>final</value></status>");
    expect(lom).toContain("<duration>PT20M</duration>");
    expect(lom).toContain("<copyrightAndOtherRestrictions>");
  });

  test("rejects a typical learning time that is not an ISO 8601 duration", () => {
    const result = scorm2004Exporter({ typicalLearningTime: "20 minutes" }).describe(input());
    expect(result.ok).toBe(false);
  });

  test("[standards:E-7] rejects the 2nd and 3rd editions, which it does not write yet", () => {
    const course = stubCourse();
    course.publish = { standard: "scorm2004", scorm2004Edition: "2nd" };
    const result = scorm2004Exporter().describe(input({ course }));
    expect(result).toEqual({
      ok: false,
      problems: [
        {
          file: "course",
          path: "/publish/scorm2004Edition",
          message: "SCORM 2004 2nd edition packages are not supported yet; publish the 4th edition",
        },
      ],
    });
    course.publish.scorm2004Edition = "4th";
    expect(scorm2004Exporter().describe(input({ course })).ok).toBe(true);
  });
});

describe("SCORM 2004 package check", () => {
  test("passes the package the exporter describes", () => {
    expect(scorm2004Exporter().check(packageFiles())).toEqual([]);
  });

  test("names a listed file that is missing, a file that is not listed and missing metadata (STD-02 validation)", () => {
    const files = packageFiles();
    files.delete("media/cover-small.jpg");
    files.delete(SCORM2004_METADATA);
    files.delete("imsss_v1p0util.xsd");
    files.set("player/extra.js", new Uint8Array());
    expect(scorm2004Exporter().check(files)).toEqual([
      { file: "imsss_v1p0util.xsd", message: "is a SCORM 2004 schema file but is missing" },
      { file: SCORM2004_METADATA, message: "is missing" },
      {
        file: MANIFEST,
        path: "manifest/resources/resource/file[3]/@href",
        line: expect.any(Number),
        message: "lists 'media/cover-small.jpg', which is not in the package",
      },
      {
        file: MANIFEST,
        path: "manifest/resources/resource",
        line: expect.any(Number),
        message: "does not list 'player/extra.js', which is in the package",
      },
    ]);
  });

  test("names a manifest that is not well-formed, and metadata that is not LOM", () => {
    const files = packageFiles("<manifest>");
    expect(scorm2004Exporter().check(files)).toEqual([
      { file: MANIFEST, message: expect.stringContaining("is not well-formed") },
    ]);
    const lom = packageFiles();
    lom.set(SCORM2004_METADATA, new TextEncoder().encode("<lom/>"));
    expect(scorm2004Exporter().check(lom)).toEqual([
      {
        file: SCORM2004_METADATA,
        message: "must be a <lom> in the http://ltsc.ieee.org/xsd/LOM namespace",
      },
    ]);
  });

  test("names the element at fault in an invalid manifest", () => {
    const manifest = manifestOf(describeFiles())
      .replace("<schemaversion>2004 4th Edition<", "<schemaversion>CAM 1.3<")
      .replace("<imsss:minNormalizedMeasure>0.8<", "<imsss:minNormalizedMeasure>80<")
      .replace('adlcp:scormType="sco"', 'adlcp:scormType="asset"')
      .replace('identifierref="sco"', 'identifierref="other"');
    expect(
      scorm2004Exporter()
        .check(packageFiles(manifest))
        .map((p) => [p.path, p.message]),
    ).toEqual([
      ["manifest/metadata/schemaversion", "must be 2004 4th Edition"],
      [
        "manifest/organizations/organization/item/@identifierref",
        "must reference the SCO resource",
      ],
      ["manifest/resources/resource/@scormType", "must be marked adlcp:scormType 'sco'"],
      [
        "manifest/organizations/organization/item/sequencing/objectives/primaryObjective/minNormalizedMeasure",
        "must be a number from -1 to 1",
      ],
    ]);
  });
});
