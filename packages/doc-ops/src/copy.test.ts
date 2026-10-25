import type { Course, LessonEntry } from "@course-suite/format";
import { validateCourse } from "@course-suite/format";
import { fullCourse, minimalCourse, sampleCourse } from "@course-suite/format/test/courses";
import { expect, test } from "vitest";
import { applyCommands } from "./commands.js";
import { copyCourse, copyEntryTo } from "./copy.js";
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

test("[rise:3B] UI-BLOCKS-EDITOR-R10: a lesson copied to another course lands last, with new ids and its media", () => {
  const source = sampleCourse();
  const target = minimalCourse();
  const copied = copyEntryTo(source, "lessonwhat", target);
  if (!copied) throw new Error("no copy");
  expect(copied.keys).toEqual(["compost-bin.svg"]);
  const result = applyCommands(target, copied.commands);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const lesson = result.document.entries.at(-1) as LessonEntry;
  expect(lesson.title).toBe("What compost is");
  expect(result.document.entries).toHaveLength(1);
  const before = new Set([...ids(source), ...ids(target)]);
  const added = [...ids(result.document)].filter((id) => !ids(target).has(id));
  expect(added.length).toBeGreaterThan(5);
  expect(added.filter((id) => before.has(id))).toEqual([]);
  expect(result.document.media.map((media) => media.key)).toContain("compost-bin.svg");
  // A course that has the file already gets no second index entry for it.
  const again = copyEntryTo(source, "lessonwhat", result.document);
  expect(again?.commands.map((command) => command.type)).toEqual(["insertEntry"]);
  expect(source).toEqual(sampleCourse());
});

test("D-36: a copied lesson drops buttons to other lessons; a lesson with a custom block is not copied", () => {
  const source = fullCourse();
  const lesson = source.entries.find((entry) => entry.kind === "lesson") as LessonEntry;
  expect(JSON.stringify(lesson)).toContain('"entry":"quiz000001"');
  expect(copyEntryTo(source, lesson.id, minimalCourse())).toBeUndefined();
  lesson.blocks = lesson.blocks.filter((block) => block.category !== "custom");
  const copied = copyEntryTo(source, lesson.id, minimalCourse());
  if (!copied) throw new Error("no copy");
  const result = applyCommands(minimalCourse(), copied.commands);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(JSON.stringify(result.document.entries.at(-1))).not.toContain('"kind":"lesson","entry"');
  expect(copyEntryTo(source, "nosuchentr", minimalCourse())).toBeUndefined();
});
