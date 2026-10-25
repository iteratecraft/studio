import { applyCommands } from "@course-suite/doc-ops";
import { sampleCourse } from "@course-suite/format/test/courses";
import { expect, test } from "vitest";
import { movesBetween } from "./outline.js";

test("BLK-02: moveEntry commands turn one outline order into another, as one list", () => {
  const course = sampleCourse();
  const from = course.entries.map((entry) => entry.id);
  const to = [...from.slice(1, 3), from[0] as string, ...from.slice(3)].reverse();
  const result = applyCommands(course, movesBetween(from, to));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.document.entries.map((entry) => entry.id)).toEqual(to);
  expect(movesBetween(from, from)).toEqual([]);
});
