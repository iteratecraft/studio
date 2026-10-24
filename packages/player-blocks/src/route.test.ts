import type { Course } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import { lessonNumber, pageHash, pagesOf, parseRoute } from "./route.js";

const course: Course = {
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Routes",
  entries: [
    { id: "section001", kind: "section", title: "Start" },
    { id: "lesson0001", kind: "lesson", title: "One", blocks: [] },
    {
      id: "quiz000001",
      kind: "quiz",
      title: "Quiz",
      questions: [],
      settings: { countAsLesson: false },
    },
    { id: "lesson0002", kind: "lesson", title: "Two", blocks: [] },
    { id: "quiz000002", kind: "quiz", title: "Final", questions: [] },
  ],
  media: [],
};
const pages = pagesOf(course);

describe("lesson addresses", () => {
  test("the cover has the root address", () => {
    for (const hash of ["", "#", "#/"]) expect(parseRoute(hash, pages)).toEqual({ kind: "cover" });
  });

  test("every lesson and quiz has an address built from its id; sections have none", () => {
    expect(pages.map((page) => page.id)).toEqual([
      "lesson0001",
      "quiz000001",
      "lesson0002",
      "quiz000002",
    ]);
    expect(pageHash("lesson0002")).toBe("#/lessons/lesson0002");
    expect(parseRoute("#/lessons/lesson0002", pages)).toMatchObject({
      kind: "page",
      index: 2,
      page: { title: "Two" },
    });
    expect(parseRoute("#/lessons/section001", pages)).toEqual({ kind: "unknown" });
  });

  test.each([
    "#/lessons/gone000001",
    "#/lessons/",
    "#/lessons/lesson0001/x",
    "#/other",
    "#/lessons/%E0%A4%A",
  ])("an address that names no page is unknown: %s", (hash) =>
    expect(parseRoute(hash, pages)).toEqual({ kind: "unknown" }),
  );
});

test("the lesson count leaves out quizzes the author excluded from it", () => {
  expect(pages.map((page) => lessonNumber(pages, page))).toEqual([
    { current: 1, total: 3 },
    undefined,
    { current: 2, total: 3 },
    { current: 3, total: 3 },
  ]);
});
