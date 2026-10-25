import type { Course, LessonEntry } from "@course-suite/format";
import { validateCourse } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { expect, test } from "vitest";
import { copyCourse } from "./copy.js";
import { indexDocument } from "./walk.js";

const ids = (course: Course) => new Set([course.id, ...indexDocument(course).keys()]);

test("[rise:3J] a duplicated course shares no ids with its source and stays valid", () => {
  const source = fullCourse();
  const copy = copyCourse(source);
  expect(validateCourse(copy)).toEqual([]);
  expect(source).toEqual(fullCourse());
  const before = ids(source);
  expect([...ids(copy)].filter((id) => before.has(id))).toEqual([]);
  expect(ids(copy).size).toBe(before.size);
});

test("references point at the copies, and references into other containers are kept", () => {
  const source = fullCourse();
  const copy = copyCourse(source);
  const index = indexDocument(copy);
  const renamed = (id: string) => {
    const path = indexDocument(source).get(id)?.path;
    return [...index.values()].find((found) => String(found.path) === String(path))?.value.id;
  };
  expect(copy.publish?.tracking).toEqual({ kind: "quiz", quiz: renamed("quiz000001") });
  const lesson = copy.entries.find((entry) => entry.kind === "lesson") as LessonEntry;
  expect(JSON.stringify(lesson)).toContain(`"entry":"${renamed("quiz000001")}"`);
  expect(JSON.stringify(lesson)).toContain(`"category":"${renamed("category01")}"`);
  expect(JSON.stringify(lesson)).toContain(`"customBlock":"${renamed("custom0001")}"`);
  expect(copy.themeRef).toEqual(source.themeRef);
  expect(copy.labelSet).toEqual(source.labelSet);
  expect(copy.media.map((entry) => entry.key)).toEqual(source.media.map((entry) => entry.key));
});
