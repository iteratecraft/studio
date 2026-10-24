import type { Course } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import { stubCourse, stubInput, stubPlayer } from "../test/stub.js";
import { buildPackage, type CourseData, type Exporter, TINCAN_XML, xapiExporter } from "./index.js";

const decode = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

function tincan(course: Course, packageVersion = 1): string {
  const described = xapiExporter().describe({
    course,
    packageVersion,
    launchPage: "index.html",
    files: ["index.html"],
  });
  if (!described.ok) throw new Error(JSON.stringify(described.problems));
  expect(described.value.map((file) => file.path)).toEqual([TINCAN_XML]);
  return decode(described.value[0]?.data);
}

/** Every `<activity id type>` in document order. */
const activities = (xml: string) =>
  [...xml.matchAll(/<activity id="([^"]+)" type="([^"]+)">/g)].map(([, id, type]) => [
    id,
    type?.replace("http://adlnet.gov/expapi/activities/", ""),
  ]);

describe("tincan.xml", () => {
  test("[standards:E-15] the course launches the player; each lesson and quiz is a module, each quiz question an interaction", () => {
    const xml = tincan(fullCourse());
    const base = "https://example.com/courses/workshop-safety";
    expect(activities(xml)).toEqual([
      [base, "course"],
      [`${base}/lesson0001`, "module"],
      [`${base}/quiz000001`, "module"],
      [`${base}/quiz000001/question02`, "cmi.interaction"],
      [`${base}/quiz000001/question03`, "cmi.interaction"],
      [`${base}/quiz000001/question04`, "cmi.interaction"],
      // Every question a draw can pick.
      [`${base}/quiz000001/pooled0002`, "cmi.interaction"],
      [`${base}/quiz000001/pooled0003`, "cmi.interaction"],
      [`${base}/lesson0002`, "module"],
    ]);
    expect(xml).toContain('<tincan xmlns="http://projecttincan.com/tincan.xsd">');
    expect(xml.match(/<launch /g)).toHaveLength(1);
    expect(xml).toContain('<launch lang="en-GB">index.html</launch>');
    expect(xml).toContain('<name lang="en-GB">Workshop safety</name>');
    expect(xml).toContain(
      '<description lang="en-GB">What to check before you start a machine.</description>',
    );
  });

  test("[standards:E-15] [rise:R10] [rise:R11] interactions carry their type, correct responses and choices, named as the player reports answers", () => {
    const xml = tincan(fullCourse());
    expect(xml).toContain(
      "<interactionType>choice</interactionType>\n      <correctResponsePatterns>\n        <correctResponsePattern>Goggles</correctResponsePattern>",
    );
    expect(xml).toContain(
      '<component><id>Gloves-near-the-chuck</id><description lang="en-GB">Gloves near the chuck</description></component>',
    );
    // Each accepted fill-in answer is a pattern of its own.
    expect(xml).toContain(
      "<correctResponsePattern>on</correctResponsePattern>\n        <correctResponsePattern>closed</correctResponsePattern>",
    );
    expect(xml).toContain(
      "<correctResponsePattern>Chuck[.]Holds-the-work[,]Guard[.]Covers-the-chuck</correctResponsePattern>",
    );
    expect(xml).toMatch(
      /<source>[\s\S]*<id>Chuck<\/id>[\s\S]*<\/source>\s*<target>[\s\S]*<id>Holds-the-work<\/id>/,
    );
  });

  test("[standards:E-16] ids come from the author's IRI or the project id and stay the same on every republish", () => {
    const course = fullCourse();
    expect(tincan(course, 2)).toBe(tincan(course, 1));
    const generated: Course = { ...course, publish: { standard: "xapi" } };
    expect(activities(tincan(generated))[1]?.[0]).toBe(`urn:uuid:${course.id}/lesson0001`);
    // A text edit changes no id.
    const renamed: Course = { ...generated, title: "Renamed" };
    expect(activities(tincan(renamed))).toEqual(activities(tincan(generated)));
  });

  test("escapes text and ids", () => {
    const course: Course = { ...fullCourse(), title: 'Tools & "safety" <basics>' };
    expect(tincan(course)).toContain(
      '<name lang="en-GB">Tools &#38; &#34;safety&#34; &#60;basics&#62;</name>',
    );
  });
});

/** Builds the stub course with `exporter`; also returns the course data the player was given. */
async function build(exporter: Exporter) {
  const given: CourseData[] = [];
  const player = stubPlayer();
  const result = await buildPackage(
    stubInput({
      exporter,
      player: {
        ...player,
        courseDataScript: (data) => {
          given.push(data);
          return player.courseDataScript(data);
        },
      },
    }),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return { built: result.value, data: given[0] };
}

describe("xAPI package", () => {
  test("[standards:E-15] builds with tincan.xml at the root and the course data names the standard", async () => {
    const { built, data } = await build(xapiExporter());
    expect(built.files).toContain(TINCAN_XML);
    expect(built.files).not.toContain("imsmanifest.xml");
    expect(built.warnings).toEqual([]);
    expect(data?.standard).toBe("xapi");
    expect(data).not.toHaveProperty("lrs");
  });

  test("[standards:E-17] an LRS the author sets goes into the course data, not the descriptor, with a warning about its credentials", async () => {
    const lrs = { endpoint: "https://lrs.example.org/xapi/", auth: "Basic d3JpdGU6b25seQ==" };
    const exporter = xapiExporter({ lrs });
    const { built, data } = await build(exporter);
    expect(data?.lrs).toEqual(lrs);
    const descriptor = exporter.describe({
      course: stubCourse(),
      packageVersion: 1,
      launchPage: "index.html",
      files: [],
    });
    expect(descriptor.ok && decode(descriptor.value[0]?.data)).not.toMatch(/lrs\.example|Basic/);
    expect(built.warnings).toEqual([
      expect.objectContaining({
        file: "course/data.js",
        message: expect.stringContaining("credentials"),
      }),
    ]);
    const endpointOnly = await build(xapiExporter({ lrs: { endpoint: lrs.endpoint } }));
    expect(endpointOnly.built.warnings).toEqual([]);
  });

  test("[standards:E-17] refuses an LRS endpoint that is not http or https", async () => {
    const result = await buildPackage(
      stubInput({ exporter: xapiExporter({ lrs: { endpoint: "file:///c:/lrs" } }) }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]?.message).toContain("not an http or https address");
  });

  test("check names a descriptor that launches a missing page or has no course activity", () => {
    const { check } = xapiExporter();
    const files = (xml: string) =>
      new Map([
        [TINCAN_XML, new TextEncoder().encode(xml)],
        ["index.html", new Uint8Array([1])],
      ]);
    const ns = 'xmlns="http://projecttincan.com/tincan.xsd"';
    const course = 'type="http://adlnet.gov/expapi/activities/course"';
    expect(check(new Map())).toEqual([{ file: TINCAN_XML, message: "is missing" }]);
    expect(
      check(
        files(
          `<tincan ${ns}><activities><activity id="a" ${course}><launch>index.html</launch></activity></activities></tincan>`,
        ),
      ),
    ).toEqual([]);
    expect(
      check(
        files(
          `<tincan ${ns}><activities><activity id="a" ${course}><launch>gone.html</launch></activity></activities></tincan>`,
        ),
      ),
    ).toEqual([
      expect.objectContaining({ message: "launches 'gone.html', which is not in the package" }),
    ]);
    expect(
      check(files(`<tincan ${ns}><activities><activity id="a" ${course}/></activities></tincan>`)),
    ).toEqual([
      expect.objectContaining({ message: "must have exactly one activity with a <launch>" }),
    ]);
    expect(check(files("<tincan><activities/></tincan>"))[0]?.message).toContain("namespace");
    expect(check(files("<tincan"))[0]?.message).toContain("not well-formed");
  });
});
