import { applyCommands } from "@course-suite/doc-ops";
import type { Course, LessonEntry } from "@course-suite/format";
import { createTranslator, english, type StringKey } from "@course-suite/ui";
import { expect, test } from "vitest";
import { BLOCK_TYPES, GROUP_LABEL, GROUPS, idMaker, typeId } from "./blocks.js";
import { blankCourse } from "./course.js";

const t = createTranslator("en");

test("blocks-editor 3: the library lists every block type of the spec once, in its categories", () => {
  const keys = BLOCK_TYPES.map((type) => `${type.group}/${type.variant}`);
  expect(new Set(keys).size).toBe(keys.length);
  expect([...new Set(BLOCK_TYPES.map((type) => type.group))]).toEqual([...GROUPS]);
  for (const type of BLOCK_TYPES) expect(Object.hasOwn(english, type.label), type.label).toBe(true);
  for (const group of GROUPS)
    expect(Object.hasOwn(english, GROUP_LABEL[group] as StringKey)).toBe(true);
  // 2 AI, 7 text, 5 statement, 6 quote, 3 list, 5 image, 4 gallery, 5 multimedia, 12 interactive,
  // 5 knowledge check, 1 survey, 3 chart, 4 divider, templates, code and custom.
  expect(BLOCK_TYPES).toHaveLength(65);
});

test("[rise:3C] blocks-editor W7, BLK-03: each type the player shows today makes a valid block with sample content", () => {
  const available = BLOCK_TYPES.filter((type) => type.create);
  expect(available.map((type) => `${type.group}/${type.variant}`)).toEqual([
    "text/paragraph",
    "text/paragraph-with-heading",
    "text/paragraph-with-subheading",
    "text/heading",
    "text/subheading",
    "knowledge-check/single-choice",
    "knowledge-check/multiple-response",
    "knowledge-check/fill-in",
    "knowledge-check/matching",
    "divider/continue",
  ]);
  let course: Course = blankCourse("microlearning", "Blocks");
  const lesson = course.entries[0] as LessonEntry;
  for (const type of available) {
    const block = type.create?.(idMaker(course), t);
    if (!block) throw new Error(`${type.variant} made nothing`);
    expect(typeId(block)).toBe(`${type.group}/${type.variant}`);
    const result = applyCommands(course, [
      { type: "insertBlock", parent: lesson.id, value: block },
    ]);
    if (!result.ok) throw new Error(`${type.variant}: ${JSON.stringify(result.errors)}`);
    course = result.document;
  }
  // Every id made is new: ten blocks, and their items, questions, answers and pairs.
  const ids = JSON.stringify(course).match(/"id":"[a-z][a-z0-9]{9}"/g) ?? [];
  expect(new Set(ids).size).toBe(ids.length);
  expect((course.entries[0] as LessonEntry).blocks).toHaveLength(10);
});
