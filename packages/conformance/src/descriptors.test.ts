import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseScormManifest } from "./scorm-manifest.js";
import { parseCmi5Xml, parseTincanXml } from "./xapi-descriptors.js";

const fixture = (path: string) =>
  readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8");

const manifest = (body: string, version = "1.2") => `<?xml version="1.0"?>
<manifest identifier="m" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schemaversion>${version}</schemaversion></metadata>
${body}
</manifest>`;

describe("parseScormManifest", () => {
  test("reads a SCORM 1.2 manifest and picks the launch href (S-2)", () => {
    const result = parseScormManifest(fixture("scorm12-sco/imsmanifest.xml"));
    expect(result).toEqual({
      ok: true,
      value: {
        version: "scorm12",
        schemaVersion: "1.2",
        identifier: "test.scorm12.sco",
        defaultOrganization: "org-1",
        organizations: [
          {
            identifier: "org-1",
            title: "Test SCO",
            items: [
              {
                identifier: "item-1",
                title: "Lesson 1",
                identifierref: "res-1",
                isvisible: true,
                masteryScore: 80,
                children: [],
              },
            ],
          },
        ],
        resources: [
          {
            identifier: "res-1",
            type: "webcontent",
            scormType: "sco",
            href: "index.html",
            files: ["index.html"],
            dependencies: [],
          },
        ],
        launch: { item: "item-1", resource: "res-1", href: "index.html" },
      },
    });
  });

  test("reads a SCORM 2004 manifest and appends item parameters to the launch href", () => {
    const result = parseScormManifest(fixture("scorm2004-sco/imsmanifest.xml"));
    expect(result.ok && result.value.version).toBe("scorm2004");
    expect(result.ok && result.value.launch.href).toBe("index.html?mode=test");
  });

  test("uses the default organization, nested items and xml:base", () => {
    const result = parseScormManifest(
      manifest(`
  <organizations default="b">
    <organization identifier="a"><item identifier="a1" identifierref="r1"/></organization>
    <organization identifier="b"><item identifier="b1"><item identifier="b2" identifierref="r2"
      parameters="&amp;page=2"/></item></organization>
  </organizations>
  <resources xml:base="content/">
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="one.html"/>
    <resource identifier="r2" type="webcontent" adlcp:scormtype="sco" xml:base="two/"
      href="start.html?x=1"/>
  </resources>`),
    );
    expect(result.ok && result.value.launch).toEqual({
      item: "b2",
      resource: "r2",
      href: "content/two/start.html?x=1&page=2",
    });
  });

  test("reports each problem with the element path and line", () => {
    const result = parseScormManifest(
      manifest(`
  <organizations default="missing">
    <organization identifier="o"><item identifier="i" identifierref="nope"/></organization>
  </organizations>
  <resources>
    <resource identifier="r" type="webcontent" adlcp:scormtype="lesson"/>
    <resource identifier="r" type="webcontent" adlcp:scormtype="sco"/>
  </resources>`),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      {
        file: "imsmanifest.xml",
        path: "manifest/resources/resource[1]/@scormType",
        line: 10,
        message: "needs adlcp:scormType 'sco' or 'asset'",
      },
      {
        file: "imsmanifest.xml",
        path: "manifest/resources/resource[2]/@identifier",
        line: 11,
        message: "repeats identifier 'r'",
      },
      {
        file: "imsmanifest.xml",
        path: "manifest/resources/resource[2]/@href",
        line: 11,
        message: "is a SCO without href",
      },
      {
        file: "imsmanifest.xml",
        path: "manifest/organizations/organization/item/@identifierref",
        line: 7,
        message: "references missing resource 'nope'",
      },
      {
        file: "imsmanifest.xml",
        path: "manifest/organizations/@default",
        line: 6,
        message: "names missing organization 'missing'",
      },
    ]);
  });

  test("rejects an unknown schema version and malformed XML", () => {
    const unknown = parseScormManifest(manifest("<organizations/><resources/>", "9.9"));
    expect(unknown.ok || unknown.problems[0]).toMatchObject({
      path: "manifest/metadata/schemaversion",
      message: "has unknown schemaversion '9.9'",
    });
    const broken = parseScormManifest("<manifest><organizations></manifest>");
    expect(broken.ok || broken.problems[0]).toMatchObject({
      file: "imsmanifest.xml",
      message: expect.stringContaining("is not well-formed XML"),
    });
  });
});

describe("parseTincanXml", () => {
  test("reads activities and the launch activity", () => {
    const result = parseTincanXml(`<?xml version="1.0"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="https://example.org/course/q1" type="http://adlnet.gov/expapi/activities/cmi.interaction"/>
    <activity id="https://example.org/course" type="http://adlnet.gov/expapi/activities/course">
      <name>Test course</name>
      <launch lang="en-US">index.html</launch>
    </activity>
  </activities>
</tincan>`);
    expect(result.ok && result.value.launch).toEqual({
      activityId: "https://example.org/course",
      href: "index.html",
    });
    expect(result.ok && result.value.activities[1]?.name).toBe("Test course");
  });

  test("reports an activity without id and a package without launch", () => {
    const result = parseTincanXml("<tincan><activities><activity/></activities></tincan>");
    expect(result.ok || result.problems).toEqual([
      {
        file: "tincan.xml",
        path: "tincan/activities/activity/@id",
        line: 1,
        message: "is missing id",
      },
      {
        file: "tincan.xml",
        path: "tincan/activities",
        line: 1,
        message: "has no activity with <launch>",
      },
    ]);
  });
});

describe("parseCmi5Xml", () => {
  const ns = 'xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"';
  const title = '<title><langstring lang="en-US">T</langstring></title>';
  const description = '<description><langstring lang="en-US">D</langstring></description>';

  test("reads the course, blocks and AUs with their defaults", () => {
    const result = parseCmi5Xml(`<courseStructure ${ns}>
  <course id="https://example.org/c">${title}${description}</course>
  <block id="https://example.org/b">${title}${description}
    <au id="https://example.org/au1" moveOn="CompletedAndPassed" masteryScore="0.8">
      ${title}${description}<url>au1/index.html</url>
    </au>
  </block>
  <au id="https://example.org/au2">${title}${description}<url>https://cdn.example.org/au2</url></au>
</courseStructure>`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.launch).toEqual({
      auId: "https://example.org/au1",
      href: "au1/index.html",
    });
    expect(result.value.children[0]).toMatchObject({
      kind: "block",
      children: [{ kind: "au", moveOn: "CompletedAndPassed", masteryScore: 0.8 }],
    });
    expect(result.value.children[1]).toMatchObject({
      kind: "au",
      moveOn: "NotApplicable",
      launchMethod: "AnyWindow",
    });
  });

  test("reports bad AU attributes and missing parts with paths", () => {
    const result = parseCmi5Xml(`<courseStructure ${ns}>
  <course id="c">${title}${description}</course>
  <au id="a" moveOn="Sometimes" masteryScore="2" launchMethod="Popup">${title}</au>
</courseStructure>`);
    expect(result.ok || result.problems.map((p) => `${p.path} ${p.message}`)).toEqual([
      "courseStructure/au is missing <url>",
      "courseStructure/au/@moveOn has unknown moveOn 'Sometimes'",
      "courseStructure/au/@launchMethod has unknown launchMethod 'Popup'",
      "courseStructure/au/@masteryScore must be a decimal from 0 to 1",
      "courseStructure/au is missing <description>",
    ]);
  });
});
