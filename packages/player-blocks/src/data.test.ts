import type { Course } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  CHUNK_TIMEOUT_MS,
  courseDataScript,
  DATA_CHUNK,
  DATA_TIMEOUT_MS,
  decodeCourseData,
  indexPage,
  REGISTRY_GLOBAL,
} from "./data.js";

const course: Course = {
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Ünïcode – 日本語 🌱 </script> \u2028",
  entries: [{ id: "lesson0001", kind: "lesson", title: "One", blocks: [] }],
  media: [],
};

/** Runs a data file the way the browser would, against a registry. */
function run(script: string): unknown {
  let registered: unknown;
  new Function(REGISTRY_GLOBAL, script)({
    register: (name: string, value: unknown) => {
      expect(name).toBe(DATA_CHUNK);
      registered = value;
    },
  });
  return registered;
}

test("[rise:R20] the course data has 10 seconds to load; other chunks have the ADR-0003 30 seconds", () => {
  expect(DATA_TIMEOUT_MS).toBe(10_000);
  expect(CHUNK_TIMEOUT_MS).toBe(30_000);
});

describe("the course data file", () => {
  test("[rise:R20] registers the course as base64 UTF-8 JSON and decodes to the same data", () => {
    const script = courseDataScript({
      course,
      labels: { language: "en", labels: { "lesson.next": "Onward" } },
    });
    expect(script).toMatch(/^blocksPlayer\.register\("course-data","[A-Za-z0-9+/=]+"\);\n$/);
    expect(decodeCourseData(run(script))).toEqual({
      course,
      labels: { language: "en", labels: { "lesson.next": "Onward" } },
    });
  });

  test("encodes a course larger than one encoding chunk", () => {
    const big = { ...course, description: "é".repeat(100_000) };
    expect(decodeCourseData(run(courseDataScript({ course: big })))).toEqual({ course: big });
  });

  test.each([
    ["not a string", 42],
    ["not base64", "%%%"],
    ["not UTF-8", btoa("\xff\xfe")],
    ["not JSON", btoa("{")],
    ["no course", btoa("{}")],
    [
      "entries not a list",
      btoa(JSON.stringify({ course: { ...course, title: "Plain", entries: {} } })),
    ],
    [
      "a lesson without blocks",
      btoa(
        JSON.stringify({
          course: { ...course, title: "Plain", entries: [{ id: "a", kind: "lesson", title: "" }] },
        }),
      ),
    ],
    [
      "labels that are not a label set",
      btoa(JSON.stringify({ course: { ...course, title: "Plain" }, labels: "en" })),
    ],
    [
      "an unknown entry kind",
      btoa(
        JSON.stringify({
          course: { ...course, title: "Plain", entries: [{ id: "a", kind: "x", title: "" }] },
        }),
      ),
    ],
  ])("is rejected when it is %s", (_name, value) => {
    expect(decodeCourseData(value)).toBeUndefined();
  });
});

test("the index page loads the style sheet and the player as a classic script", () => {
  const page = indexPage("en-GB");
  expect(page).toContain('<html lang="en-GB">');
  expect(page).toContain('<div id="app"></div>');
  expect(page).toContain('<script src="player.js"></script>');
  expect(page).not.toMatch(/type="module"/);
  expect(indexPage('"><script>')).toContain('<html lang="script">');
});
