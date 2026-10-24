import { openCourse, serializeCourse } from "@course-suite/format";
import { describe, expect, it } from "vitest";
import { loadBlocksCorpus, TEST_COURSES_DIR } from "./corpus.js";

// The reference courses of corpus v1 (M1-28), with the spec rules each one exists to exercise.
const REQUIRED: Record<string, string> = {
  "text-only": "[rise:R5]",
  "gated-continue": "[rise:R13] UI-BLOCKS-R43 UI-BLOCKS-R44",
  "quiz-pass-fail": "[rise:R7] [rise:R8] [rise:R10]",
  "multi-quiz": "[rise:R8] [rise:R11]",
  "long-resume": "[rise:R3] standards.md §4.2",
  "restricted-navigation": "[rise:R14] UI-BLOCKS-R41",
};

const corpus = loadBlocksCorpus();
if (!corpus) {
  process.stderr.write(
    `No test-courses checkout at ${TEST_COURSES_DIR}: skipping the Blocks corpus tests. ` +
      "Clone iteratecraft/test-courses there to run them.\n",
  );
}

describe.skipIf(!corpus)("Blocks conformance corpus", () => {
  const courses = corpus ?? [];

  it.each(Object.entries(REQUIRED))("has the %s course %s", (name) => {
    expect(courses.map((course) => course.name)).toContain(name);
  });

  for (const course of courses) {
    it(`${course.name} opens, validates and has its media ${REQUIRED[course.name] ?? ""}`, () => {
      const result = openCourse(course.text);
      expect(result).toMatchObject({ status: "ok" });
      if (result.status !== "ok") return;
      // A document still at the current schema is stored the way the apps save it.
      if (!result.migratedFrom) expect(serializeCourse(result.document)).toBe(course.text);
      expect(course.mediaFiles).toEqual(result.document.media.map((entry) => entry.key).sort());
    });
  }
});
