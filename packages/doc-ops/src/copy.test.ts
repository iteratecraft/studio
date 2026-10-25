import type { Course, LessonEntry } from "@course-suite/format";
import { validateCourse } from "@course-suite/format";
import { fullCourse, minimalCourse, sampleCourse } from "@course-suite/format/test/courses";
import { expect, test } from "vitest";
import { applyCommands } from "./commands.js";
import { clipBlocks, copyCourse, copyEntryTo, pasteBlocks } from "./copy.js";
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

const lessonOf = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
/** Another course, with one lesson, which holds one paragraph. */
const target = (): Course => ({
  ...minimalCourse(),
  id: "5d0c7f9e-2b6a-4e38-8f14-3a9c6b2d7e01",
  entries: [
    {
      id: "lessontgt1",
      kind: "lesson",
      title: "Target",
      blocks: [{ id: "blocktgt01", category: "text", variant: "paragraph" }],
    },
  ],
});

test("[rise:3J] UI-BLOCKS-EDITOR-R24, BLK-03: blocks pasted into another course keep their order and their media, with new ids", () => {
  const source = sampleCourse();
  const into = target();
  const lesson = lessonOf(into, "lessontgt1");
  const clip = clipBlocks(source, [
    "blkcheck02",
    "blkheading",
    "blkimage01",
    "blkparagrp",
    "blkcontinu",
  ]);
  // Lesson order, whatever order the ids came in.
  expect(clip.blocks.map((block) => block.id)).toEqual([
    "blkheading",
    "blkparagrp",
    "blkimage01",
    "blkcontinu",
    "blkcheck02",
  ]);
  expect(clip.media.map((media) => media.key)).toEqual(["compost-bin.svg"]);
  const pasted = pasteBlocks(clip, into, lesson.id, 0);
  if (!pasted) throw new Error("no paste");
  expect(pasted.keys).toEqual(["compost-bin.svg"]);
  const result = applyCommands(into, pasted.commands);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const blocks = lessonOf(result.document, lesson.id).blocks;
  expect(blocks.slice(0, 5).map((block) => `${block.category}/${block.variant}`)).toEqual([
    "text/heading",
    "text/paragraph-with-heading",
    "image/centered",
    "divider/continue",
    "knowledge-check/multiple-response",
  ]);
  expect(blocks.slice(5)).toEqual(lesson.blocks);
  expect(result.document.media.map((media) => media.key)).toContain("compost-bin.svg");
  const before = new Set([...ids(source), ...ids(into)]);
  const added = [...ids(result.document)].filter((id) => !ids(into).has(id));
  expect(added.length).toBeGreaterThan(5);
  expect(added.filter((id) => before.has(id))).toEqual([]);
  expect(source).toEqual(sampleCourse());
});

test("UI-BLOCKS-EDITOR-R24: blocks pasted in their own course land where asked, and a button keeps its lesson", () => {
  const course = fullCourse();
  course.customBlocks = [];
  const lesson = course.entries.find((entry) => entry.kind === "lesson") as LessonEntry;
  lesson.blocks = lesson.blocks.filter((block) => block.category !== "custom");
  const clip = clipBlocks(course, ["block00002"]);
  const pasted = pasteBlocks(clip, course, lesson.id, 1);
  if (!pasted) throw new Error("no paste");
  // The media file is in the course already.
  expect(pasted.commands.map((command) => command.type)).toEqual(["insertBlock"]);
  const result = applyCommands(course, pasted.commands);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const copy = lessonOf(result.document, lesson.id).blocks[1];
  expect(copy?.id).not.toBe("block00002");
  expect(JSON.stringify(copy)).toContain('"entry":"quiz000001"');
  // In another course the button to that lesson goes (D-36).
  const elsewhere = pasteBlocks(clip, target(), "lessontgt1");
  expect(elsewhere?.commands.map((command) => command.type)).toContain("insertBlock");
  expect(JSON.stringify(elsewhere?.commands)).not.toContain('"entry":"quiz000001"');
});

test("pasting needs a lesson, and refuses a custom block from another course", () => {
  const source = fullCourse();
  const custom = clipBlocks(source, [
    (source.entries[1] as LessonEntry).blocks.find((block) => block.customBlock)?.id ?? "",
  ]);
  expect(custom.blocks).toHaveLength(1);
  expect(pasteBlocks(custom, target(), "lessontgt1")).toBeUndefined();
  const heading = clipBlocks(sampleCourse(), ["blkheading"]);
  expect(pasteBlocks(heading, target(), "nosuchentr")).toBeUndefined();
  expect(pasteBlocks(heading, target(), "lessontgt1")).toBeDefined();
});
