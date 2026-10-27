import { applyCommands } from "@course-suite/doc-ops";
import { type Block, type LessonEntry, validateCourse } from "@course-suite/format";
import { createTranslator } from "@course-suite/ui";
import { expect, test } from "vitest";
import { withVariantSettings, writeTable } from "./static-blocks.js";
import { COURSE_TEMPLATES, courseFrom, LESSON_TEMPLATES, lessonFrom } from "./templates.js";

const t = createTranslator("en");
const ids = (value: unknown) => JSON.stringify(value).match(/"id":"[a-z][a-z0-9]{9}"/g) ?? [];

test("[rise:3J] blocks-editor W3, H15, D-38: every course template makes a valid course of its kind, with placeholder text and new ids", () => {
  for (const template of COURSE_TEMPLATES) {
    const course = courseFrom(template, "My course", t);
    expect(validateCourse(course), template.id).toEqual([]);
    expect(course.kind).toBe(template.kind);
    expect(course.title).toBe("My course");
    expect(new Set(ids(course)).size).toBe(ids(course).length);
    const lessons = course.entries.filter((entry): entry is LessonEntry => entry.kind === "lesson");
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) expect(lesson.blocks.length).toBeGreaterThan(2);
    // A microlearning holds one lesson named after it (rise.md 3A, W2).
    if (template.kind === "microlearning") expect(course.entries).toEqual([lessons[0]]);
    if (template.kind === "microlearning") expect(lessons[0]?.title).toBe("My course");
  }
  const starter = courseFrom(COURSE_TEMPLATES[0] as (typeof COURSE_TEMPLATES)[0], "Starter", t);
  expect(starter.entries.map((entry) => `${entry.kind}: ${entry.title}`)).toEqual([
    "section: Getting started",
    "lesson: Introduction",
    "section: What you will learn",
    "lesson: Explain an idea",
    "lesson: Teach the steps",
    "lesson: Summary",
  ]);
});

test("[rise:3J] blocks-editor W3, C7: a lesson template adds a lesson whose ids are new in the course", () => {
  const course = courseFrom(COURSE_TEMPLATES[0] as (typeof COURSE_TEMPLATES)[0], "Course", t);
  for (const { id } of LESSON_TEMPLATES) {
    const taken = new Set(ids(course).map((pair) => pair.slice(6, 16)));
    const lesson = lessonFrom(id, taken, t);
    const result = applyCommands(course, [{ type: "insertEntry", value: lesson }]);
    expect(result.ok, id).toBe(true);
  }
  const steps = lessonFrom("steps", new Set(), t);
  expect(steps.blocks.map((block: Block) => `${block.category}/${block.variant}`)).toEqual([
    "text/paragraph-with-heading",
    "list/numbered",
    "statement/note",
    "list/checkbox",
  ]);
});

test("BLK-04: a variant setting at its default is left out of the document", () => {
  const block: Block = { id: "blocklist1", category: "list", variant: "numbered" };
  expect(withVariantSettings(block, { start: 3 })).toEqual({
    type: "updateBlock",
    id: "blocklist1",
    set: { variantSettings: { start: 3 } },
  });
  expect(withVariantSettings({ ...block, variantSettings: { start: 3 } }, { start: 1 })).toEqual({
    type: "updateBlock",
    id: "blocklist1",
    unset: ["variantSettings"],
  });
});

test("[rise:3C] blocks-editor 2.5: a table's header row goes in thead, the others in tbody, each cell's rich text as it is", () => {
  expect(
    writeTable({
      header: true,
      rows: [
        ["Name", "A &amp; B"],
        ["<strong>Orion</strong> in <em>winter</em>", '<a href="#/lessons/lessplan01">Plan</a>'],
      ],
    }),
  ).toBe(
    '<table><thead><tr><th>Name</th><th>A &amp; B</th></tr></thead><tbody><tr><td><strong>Orion</strong> in <em>winter</em></td><td><a href="#/lessons/lessplan01">Plan</a></td></tr></tbody></table>',
  );
  expect(writeTable({ header: false, rows: [["one"]] })).toBe(
    "<table><tbody><tr><td>one</td></tr></tbody></table>",
  );
});
