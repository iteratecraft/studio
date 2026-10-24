import { describe, expect, test } from "vitest";
import { stubCourse } from "../test/stub.js";
import {
  type DescribeInput,
  type PackageFile,
  SCORM12_MANIFEST,
  SCORM12_SCHEMAS,
  scorm12Exporter,
} from "./index.js";

const content = ["course/data.js", "index.html", "media/cover-small.jpg", "player/boot.js"];
const input = (overrides: Partial<DescribeInput> = {}): DescribeInput => ({
  course: stubCourse(),
  packageVersion: 3,
  launchPage: "index.html",
  files: content,
  ...overrides,
});

function describeFiles(overrides: Partial<DescribeInput> = {}, typicalLearningTime = "PT20M") {
  const result = scorm12Exporter({ typicalLearningTime }).describe(input(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
}

const manifestOf = (files: PackageFile[]) =>
  new TextDecoder().decode(files.find((f) => f.path === SCORM12_MANIFEST)?.data);

/** The whole package as the builder hands it to `check`. */
function packageFiles(manifest?: string): Map<string, Uint8Array> {
  const files = new Map(describeFiles().map((f) => [f.path, f.data] as const));
  for (const path of content) files.set(path, new Uint8Array([1]));
  if (manifest !== undefined) files.set(SCORM12_MANIFEST, new TextEncoder().encode(manifest));
  return files;
}

describe("SCORM 1.2 manifest", () => {
  test("has the ADL schema files beside it and lists every content file (standards.md E-1, E-3)", () => {
    const files = describeFiles();
    expect(files.map((f) => f.path)).toEqual([SCORM12_MANIFEST, ...SCORM12_SCHEMAS]);
    const manifest = manifestOf(files);
    expect([...manifest.matchAll(/<file href="([^"]+)"\/>/g)].map((m) => m[1])).toEqual(content);
    expect(manifest).not.toContain('.xsd"/>');
  });

  test("has one organization, one visible item and one SCO launching the player (standards.md E-2)", () => {
    const manifest = manifestOf(describeFiles());
    expect(manifest.match(/<organization /g)).toHaveLength(1);
    expect(manifest.match(/<item /g)).toHaveLength(1);
    expect(manifest).toContain('<item identifier="item" identifierref="sco" isvisible="true">');
    expect(manifest).toContain(
      '<resource identifier="sco" type="webcontent" adlcp:scormtype="sco" href="index.html">',
    );
    expect(manifest).toContain("<schema>ADL SCORM</schema>");
    expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
  });

  test("ends its identifier with the package version and keeps it across republishes (standards.md E-6, rise.md §4)", () => {
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

  test("writes inline LOM: title, language, description, keywords, version, status, learning time, rights (standards.md E-4)", () => {
    const manifest = manifestOf(describeFiles());
    expect(manifest).toContain(
      '<imsmd:title><imsmd:langstring xml:lang="en-GB">Workshop safety &#38; you</imsmd:langstring></imsmd:title>',
    );
    expect(manifest).toContain("<imsmd:language>en-GB</imsmd:language>");
    expect(manifest).toContain(
      ">What to check before you start.</imsmd:langstring></imsmd:description>",
    );
    expect(manifest).toContain(">workshop</imsmd:langstring></imsmd:keyword>");
    expect(manifest).toContain(
      '<imsmd:version><imsmd:langstring xml:lang="x-none">3</imsmd:langstring>',
    );
    expect(manifest).toContain('<imsmd:langstring xml:lang="x-none">Final</imsmd:langstring>');
    expect(manifest).toContain("<imsmd:datetime>PT20M</imsmd:datetime>");
    expect(manifest).toContain("<imsmd:copyrightandotherrestrictions>");
  });

  test("writes adlcp:masteryscore only when the author set a passing score (standards.md E-5)", () => {
    expect(manifestOf(describeFiles())).toContain("<adlcp:masteryscore>80</adlcp:masteryscore>");
    const course = stubCourse();
    delete course.publish?.passingScore;
    expect(manifestOf(describeFiles({ course }))).not.toContain("masteryscore");
  });

  test("rejects a typical learning time that is not an ISO 8601 duration", () => {
    const result = scorm12Exporter({ typicalLearningTime: "20 minutes" }).describe(input());
    expect(result.ok).toBe(false);
  });
});

describe("SCORM 1.2 package check", () => {
  test("passes the package the exporter describes", () => {
    expect(scorm12Exporter().check(packageFiles())).toEqual([]);
  });

  test("names a listed file that is missing and a file that is not listed (STD-02 validation)", () => {
    const files = packageFiles();
    files.delete("media/cover-small.jpg");
    files.set("player/extra.js", new Uint8Array());
    expect(scorm12Exporter().check(files)).toEqual([
      {
        file: SCORM12_MANIFEST,
        path: "manifest/resources/resource/file[3]/@href",
        line: expect.any(Number),
        message: "lists 'media/cover-small.jpg', which is not in the package",
      },
      {
        file: SCORM12_MANIFEST,
        path: "manifest/resources/resource",
        line: expect.any(Number),
        message: "does not list 'player/extra.js', which is in the package",
      },
    ]);
  });

  test("names a manifest that is not well-formed, and a missing schema file", () => {
    const files = packageFiles("<manifest>");
    files.delete("ims_xml.xsd");
    expect(scorm12Exporter().check(files)).toEqual([
      { file: "ims_xml.xsd", message: "is a SCORM 1.2 schema file but is missing" },
      { file: SCORM12_MANIFEST, message: expect.stringContaining("is not well-formed") },
    ]);
  });

  test("names the element at fault in an invalid manifest", () => {
    const manifest = manifestOf(describeFiles())
      .replace("<schemaversion>1.2<", "<schemaversion>1.3<")
      .replace("<adlcp:masteryscore>80<", "<adlcp:masteryscore>180<")
      .replace('identifierref="sco"', 'identifierref="other"');
    expect(
      scorm12Exporter()
        .check(packageFiles(manifest))
        .map((p) => [p.path, p.message]),
    ).toEqual([
      ["manifest/metadata/schemaversion", "must be 1.2"],
      [
        "manifest/organizations/organization/item/@identifierref",
        "must reference the SCO resource",
      ],
      ["manifest/organizations/organization/item/masteryscore", "must be a number from 0 to 100"],
    ]);
  });
});
