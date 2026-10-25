// M2-07: at publish the builder estimates the largest learner progress the course can save and
// warns the author when the target standard cannot store it whole (standards.md §4.2).
import type { Block, Course, LessonEntry, QuizEntry } from "@course-suite/format";
import { RESUME_CAPS } from "@course-suite/tracking";
import { describe, expect, test } from "vitest";
import {
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  type Exporter,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "./index.js";

let next = 0;
const id = (prefix: string) => `${prefix}${String(++next).padStart(9, "0")}`;

function check(): Block {
  return {
    id: id("k"),
    category: "knowledge-check",
    variant: "single-choice",
    question: {
      id: id("q"),
      kind: "single-choice",
      prompt: "<p>Which one?</p>",
      answers: [
        { id: id("a"), text: "<p>This one</p>", correct: true },
        { id: id("a"), text: "<p>That one</p>", correct: false },
      ],
    },
  };
}

const lesson = (): LessonEntry => ({
  id: id("l"),
  kind: "lesson",
  title: "Lesson",
  blocks: [
    ...Array.from(
      { length: 6 },
      (): Block => ({
        id: id("t"),
        category: "text",
        variant: "paragraph",
        items: [{ id: id("i"), kind: "content", text: "<p>Read this.</p>" }],
      }),
    ),
    check(),
    { id: id("c"), category: "divider", variant: "continue" },
  ],
});

/** A course with `lessons` lessons and a final quiz with three retries. */
function course(lessons: number): Course {
  const quiz: QuizEntry = {
    id: id("z"),
    kind: "quiz",
    title: "Final quiz",
    settings: { retries: 3 },
    questions: Array.from({ length: 10 }, () => check().question as never),
  };
  return {
    schemaVersion: "1.0",
    id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    kind: "course",
    title: "Long course",
    entries: [...Array.from({ length: lessons }, lesson), quiz],
    media: [],
  };
}

async function warnings(input: Course, exporter: Exporter) {
  const result = await buildPackage({
    course: input,
    player: blocksPlayer(),
    exporter,
    media: () => undefined,
    packageVersion: 1,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  return result.value.warnings;
}

describe("long-resume author warning (M2-07)", () => {
  const long = course(40);

  test("standards.md §4.2: a SCORM 1.2 course that can outgrow 4,096 characters warns, naming what is dropped first", async () => {
    const [warning, ...rest] = await warnings(long, scorm12Exporter());
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({
      code: "resume-parts-dropped",
      file: "course",
      cap: RESUME_CAPS.scorm12,
      dropped: ["finished-visits"],
    });
    expect(warning?.message).toContain("visited pages of finished sections");
    expect(warning && "size" in warning && warning.size).toBeGreaterThan(RESUME_CAPS.scorm12);
  });

  test("standards.md §4.2: a course too large even after dropping says progress stops being saved", async () => {
    const [warning] = await warnings(course(120), scorm12Exporter());
    expect(warning).toMatchObject({
      code: "resume-over-cap",
      cap: RESUME_CAPS.scorm12,
      dropped: ["finished-visits"],
    });
    expect(warning?.message).toContain("stops being saved");
  });

  test("standards.md §4.2: the same course fits SCORM 2004, xAPI and cmi5, and plain web keeps no progress", async () => {
    for (const exporter of [scorm2004Exporter(), xapiExporter(), cmi5Exporter(), webExporter()]) {
      expect(await warnings(long, exporter)).toEqual([]);
    }
  });

  test("a short course gets no warning", async () => {
    expect(await warnings(course(2), scorm12Exporter())).toEqual([]);
  });
});
