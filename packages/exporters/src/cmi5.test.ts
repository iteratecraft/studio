import type { Course } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import { stubInput } from "../test/stub.js";
import { buildPackage, CMI5_XML, cmi5Exporter } from "./index.js";

const decode = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

function cmi5Xml(course: Course, packageVersion = 1): string {
  const described = cmi5Exporter().describe({
    course,
    packageVersion,
    launchPage: "index.html",
    files: ["index.html"],
  });
  if (!described.ok) throw new Error(JSON.stringify(described.problems));
  expect(described.value.map((file) => file.path)).toEqual([CMI5_XML]);
  return decode(described.value[0]?.data);
}

const auOf = (xml: string) => /<au [^>]*>/.exec(xml)?.[0];

describe("cmi5.xml", () => {
  test("[standards:E-19] [standards:E-20] [standards:E-21] the course and one AU that launches the player, with ids, titles and descriptions", () => {
    const xml = cmi5Xml(fullCourse());
    const base = "https://example.com/courses/workshop-safety";
    expect(xml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="${base}">
    <title><langstring lang="en-GB">Workshop safety</langstring></title>
    <description><langstring lang="en-GB">What to check before you start a machine.</langstring></description>
  </course>
  <au id="${base}/au" moveOn="Passed" masteryScore="0.8" launchMethod="AnyWindow">
    <title><langstring lang="en-GB">Workshop safety</langstring></title>
    <description><langstring lang="en-GB">What to check before you start a machine.</langstring></description>
    <url>index.html</url>
  </au>
</courseStructure>
`);
  });

  test("[standards:E-22] move-on is the author's choice, else Passed when a quiz decides the result and Completed otherwise", () => {
    const course = fullCourse();
    const publish = { ...course.publish, standard: "cmi5" as const };
    expect(
      auOf(cmi5Xml({ ...course, publish: { ...publish, moveOn: "CompletedOrPassed" } })),
    ).toContain('moveOn="CompletedOrPassed"');
    const { tracking: _, passingScore: __, ...byCompletion } = publish;
    const au = auOf(cmi5Xml({ ...course, publish: byCompletion }));
    expect(au).toContain('moveOn="Completed"');
    // No passing score, no mastery score.
    expect(au).not.toContain("masteryScore");
  });

  test("[standards:E-16] ids come from the author's IRI or the project id and stay the same on every republish", () => {
    const course = fullCourse();
    expect(cmi5Xml(course, 2)).toBe(cmi5Xml(course, 1));
    const generated: Course = { ...course, publish: { standard: "cmi5" } };
    expect(cmi5Xml(generated)).toContain(`<au id="urn:uuid:${course.id}/au"`);
    expect(cmi5Xml({ ...generated, title: "Renamed" })).toContain(
      `<au id="urn:uuid:${course.id}/au"`,
    );
  });

  test("escapes text and ids", () => {
    const course: Course = { ...fullCourse(), title: 'Tools & "safety" <basics>' };
    expect(cmi5Xml(course)).toContain(
      '<title><langstring lang="en-GB">Tools &#38; &#34;safety&#34; &#60;basics&#62;</langstring></title>',
    );
  });
});

describe("cmi5 package", () => {
  test("[standards:E-19] builds with cmi5.xml at the root and the course data names the standard", async () => {
    const result = await buildPackage(stubInput({ exporter: cmi5Exporter() }));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.value.files).toContain(CMI5_XML);
    expect(result.value.files).not.toContain("imsmanifest.xml");
    expect(result.value.warnings).toEqual([]);
  });

  test("check names a structure without an AU, a bad move-on or mastery score, or a missing page", () => {
    const { check } = cmi5Exporter();
    const ns = 'xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"';
    const text =
      "<title><langstring>t</langstring></title><description><langstring>d</langstring></description>";
    const files = (au: string) =>
      new Map([
        [
          CMI5_XML,
          new TextEncoder().encode(
            `<courseStructure ${ns}><course id="c">${text}</course>${au}</courseStructure>`,
          ),
        ],
        ["index.html", new Uint8Array([1])],
      ]);
    expect(check(new Map())).toEqual([{ file: CMI5_XML, message: "is missing" }]);
    expect(check(files(`<au id="a">${text}<url>index.html</url></au>`))).toEqual([]);
    expect(check(files(""))).toEqual([expect.objectContaining({ message: "has no <au>" })]);
    expect(
      check(
        files(`<au id="a" moveOn="Sometimes" masteryScore="80">${text}<url>gone.html</url></au>`),
      ).map((problem) => problem.message),
    ).toEqual([
      "has an unknown moveOn 'Sometimes'",
      "has a masteryScore that is not a decimal from 0 to 1",
      "launches 'gone.html', which is not in the package",
    ]);
    expect(check(files(`<au>${text}<url>index.html</url></au>`))[0]?.message).toBe(
      "an AU has no id",
    );
    expect(
      check(new Map([[CMI5_XML, new TextEncoder().encode("<courseStructure/>")]]))[0]?.message,
    ).toContain("namespace");
    expect(check(new Map([[CMI5_XML, new TextEncoder().encode("<course")]]))[0]?.message).toContain(
      "not well-formed",
    );
  });
});
