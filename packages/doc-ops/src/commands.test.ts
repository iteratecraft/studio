import type { Block, Course, LessonEntry, QuizEntry } from "@course-suite/format";
import { serializeCourse, validateCourse } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import type { ApplyResult, Command } from "./commands.js";
import { applyCommands } from "./commands.js";
import { indexDocument } from "./walk.js";

const lesson = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
const quiz = (course: Course) => course.entries.find((e) => e.kind === "quiz") as QuizEntry;
const ok = (result: ApplyResult) => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(validateCourse(result.document)).toEqual([]);
  return result;
};
const rejected = (course: Course, commands: Command[]) => {
  const before = serializeCourse(course);
  const result = applyCommands(course, commands);
  if (result.ok) throw new Error("expected the commands to be rejected");
  expect(serializeCourse(course)).toBe(before);
  return result.errors;
};
const textBlock = (id: string): Block => ({
  id,
  category: "text",
  variant: "paragraph",
  items: [{ id: `${id.slice(0, 8)}i1`, kind: "content", text: "<p>New</p>" }],
});

describe("insert", () => {
  test("adds a block at the end of a lesson by default, or at an index", () => {
    const course = fullCourse();
    const end = ok(
      applyCommands(course, [
        { type: "insertBlock", parent: "lesson0001", value: textBlock("newblock01") },
      ]),
    );
    expect(lesson(end.document, "lesson0001").blocks.at(-1)?.id).toBe("newblock01");
    expect(end.created).toEqual(["newblock01"]);
    expect(end.ids).toEqual(["lesson0001", "newblock01", "newblocki1"]);
    const first = ok(
      applyCommands(course, [
        { type: "insertBlock", parent: "lesson0001", index: 0, value: textBlock("newblock01") },
      ]),
    );
    expect(lesson(first.document, "lesson0001").blocks[0]?.id).toBe("newblock01");
    expect(course.entries.length).toBe(fullCourse().entries.length);
  });

  test("creates a missing list", () => {
    const result = ok(
      applyCommands(fullCourse(), [
        {
          type: "insertItem",
          parent: "block00005",
          value: { id: "newitem001", kind: "content", text: "<p>Hi</p>" },
        },
      ]),
    );
    expect(lesson(result.document, "lesson0001").blocks[4]?.items).toHaveLength(1);
  });

  test("rejects a parent of the wrong kind, an unknown parent, an index past the end and a taken id", () => {
    const course = fullCourse();
    const value = textBlock("newblock01");
    expect(rejected(course, [{ type: "insertBlock", parent: "quiz000001", value }])).toEqual([
      { code: "not-allowed", command: 0, path: "/parent", message: "must refer to a lesson" },
    ]);
    expect(rejected(course, [{ type: "insertBlock", parent: "nowhere001", value }])[0]?.code).toBe(
      "not-found",
    );
    expect(
      rejected(course, [{ type: "insertBlock", parent: "lesson0002", index: 1, value }])[0],
    ).toMatchObject({ code: "not-allowed", path: "/index" });
    const taken = rejected(course, [
      { type: "insertBlock", parent: "lesson0002", value: textBlock("block00001") },
    ]);
    expect(taken[0]).toMatchObject({
      code: "invalid-document",
      message: expect.stringMatching(/duplicates/),
    });
  });

  test("checks the value against the format schema, with the path inside the command", () => {
    const errors = rejected(fullCourse(), [
      {
        type: "insertBlock",
        parent: "lesson0001",
        value: { ...textBlock("newblock01"), settings: { accentColor: "red" } },
      },
    ]);
    expect(errors).toEqual([
      {
        code: "invalid-command",
        command: 0,
        path: "/value/settings/accentColor",
        message: "must match ^#[0-9a-f]{6}$",
      },
    ]);
  });
});

describe("update", () => {
  test("UI-BLOCKS-EDITOR-R25: switching a block's variant keeps its content", () => {
    const course = fullCourse();
    const result = ok(
      applyCommands(course, [
        { type: "updateBlock", id: "block00001", set: { variant: "paragraph" } },
      ]),
    );
    const before = lesson(course, "lesson0001").blocks[0];
    const after = lesson(result.document, "lesson0001").blocks[0];
    expect(after).toEqual({ ...before, variant: "paragraph" });
    expect(Object.keys(after ?? {})).toEqual(Object.keys(before ?? {}));
  });

  test("sets and removes course settings, including the label set", () => {
    const result = ok(
      applyCommands(fullCourse(), [
        {
          type: "updateCourse",
          set: { title: "Lathe safety", labelSet: { language: "fr" } },
          unset: ["navigation", "glossaryRef"],
        },
      ]),
    );
    expect(result.document).toMatchObject({ title: "Lathe safety", labelSet: { language: "fr" } });
    expect(result.document.navigation).toBeUndefined();
    expect(result.ids).toEqual([fullCourse().id]);
  });

  test("edits a knowledge check's question in place", () => {
    const result = ok(
      applyCommands(fullCourse(), [
        { type: "updateQuestion", id: "question01", set: { prompt: "<p>When?</p>" } },
      ]),
    );
    expect(lesson(result.document, "lesson0001").blocks[3]?.question?.prompt).toBe("<p>When?</p>");
  });

  test("rejects locked fields, required fields, a field both set and unset, and bad values", () => {
    const course = fullCourse();
    const code = (command: Command) => rejected(course, [command])[0];
    expect(
      code({ type: "updateBlock", id: "block00001", set: { category: "quote" } } as never),
    ).toMatchObject({
      code: "invalid-command",
      path: "/set/category",
    });
    expect(code({ type: "updateCourse", set: { kind: "microlearning" } } as never)?.code).toBe(
      "invalid-command",
    );
    expect(code({ type: "updateBlock", id: "block00001", unset: ["variant"] } as never)?.code).toBe(
      "invalid-command",
    );
    expect(
      code({
        type: "updateBlock",
        id: "block00001",
        set: { settings: { connectToNext: true } },
        unset: ["settings"],
      }),
    ).toMatchObject({ code: "not-allowed", path: "/set/settings" });
    // A field item kinds define differently is checked against the item's own kind.
    expect(code({ type: "updateItem", id: "category01", set: { title: "" } })).toMatchObject({
      code: "invalid-document",
      path: "/entries/1/blocks/2/items/0/title",
    });
    expect(code({ type: "updateBlock", id: "lesson0001", set: { variant: "x" } })?.code).toBe(
      "not-found",
    );
  });

  test("a value it already has is no change", () => {
    const course = fullCourse();
    const result = ok(
      applyCommands(course, [
        {
          type: "updateBlock",
          id: "block00002",
          set: { variant: "scenario" },
          unset: ["createdAt"],
        },
      ]),
    );
    expect(result.ops).toEqual([]);
    expect(result.document).toBe(course);
  });
});

describe("move", () => {
  test("moves a block within its lesson and into another lesson", () => {
    const course = fullCourse();
    const within = ok(applyCommands(course, [{ type: "moveBlock", id: "block00001", index: 2 }]));
    expect(
      lesson(within.document, "lesson0001")
        .blocks.map((b) => b.id)
        .slice(0, 3),
    ).toEqual(["block00002", "block00003", "block00001"]);
    const across = ok(
      applyCommands(course, [
        { type: "moveBlock", id: "block00001", parent: "lesson0002", index: 0 },
      ]),
    );
    expect(lesson(across.document, "lesson0002").blocks.map((b) => b.id)).toEqual(["block00001"]);
    expect(across.ids).toEqual(["block00001", "lesson0001", "lesson0002"]);
  });

  test("reorders the outline and the answers of a question", () => {
    const course = fullCourse();
    const outline = ok(applyCommands(course, [{ type: "moveEntry", id: "section001", index: 2 }]));
    expect(outline.document.entries.map((e) => e.id)[2]).toBe("section001");
    const answers = ok(applyCommands(course, [{ type: "moveAnswer", id: "answer0001", index: 1 }]));
    const check = lesson(answers.document, "lesson0001").blocks[3]?.question;
    expect(check?.kind === "single-choice" && check.answers.map((a) => a.id)).toEqual([
      "answer0002",
      "answer0001",
    ]);
  });

  test("rejects an index past the end and a question that is not in a quiz list", () => {
    const course = fullCourse();
    expect(rejected(course, [{ type: "moveBlock", id: "block00001", index: 7 }])[0]).toMatchObject({
      code: "not-allowed",
      path: "/index",
      message: "must be at most 6",
    });
    expect(
      rejected(course, [{ type: "moveQuestion", id: "question01", index: 0 }])[0],
    ).toMatchObject({
      code: "not-allowed",
      path: "/id",
    });
    // Moving the skip-ahead target before its quiz breaks the quiz's reference.
    expect(rejected(course, [{ type: "moveEntry", id: "lesson0002", index: 0 }])[0]).toMatchObject({
      code: "invalid-document",
      path: "/entries/3/settings/skipAhead/entry",
    });
  });
});

describe("duplicate", () => {
  test("UI-BLOCKS-EDITOR-R10: a duplicated lesson lands directly below it, with new ids", () => {
    const course = fullCourse();
    const result = ok(applyCommands(course, [{ type: "duplicateEntry", id: "lesson0001" }]));
    const copy = result.document.entries[2] as LessonEntry;
    const [created] = result.created;
    expect(copy.id).toBe(created);
    const original = indexDocument(lesson(course, "lesson0001") as never);
    const ids = [...indexDocument({ entries: [copy] })].map(([id]) => id);
    expect(ids).toHaveLength(
      [...indexDocument({ entries: [lesson(course, "lesson0001")] })].length,
    );
    for (const id of ids) expect(original.has(id) || indexDocument(course).has(id)).toBe(false);
    const strip = (value: unknown) => JSON.stringify(value).replace(/"[a-z][a-z0-9]{9}"/g, '"id"');
    expect(strip(copy)).toBe(strip(lesson(course, "lesson0001")));
  });

  test("UI-BLOCKS-EDITOR-R24: a duplicated block lands below it; a sorting card keeps its copied category", () => {
    const course = fullCourse();
    const result = ok(applyCommands(course, [{ type: "duplicateBlock", id: "block00003" }]));
    const copy = lesson(result.document, "lesson0001").blocks[3];
    expect(copy?.id).toBe(result.created[0]);
    const [category, card] = copy?.items ?? [];
    expect(category?.id).not.toBe("category01");
    expect(card?.kind === "sorting" && card.category).toBe(category?.id);
  });

  test("UI-BLOCKS-EDITOR-R24: a block copied to another lesson is appended at its bottom", () => {
    const course = fullCourse();
    const once = ok(
      applyCommands(course, [{ type: "duplicateBlock", id: "block00001", parent: "lesson0002" }]),
    );
    const twice = ok(
      applyCommands(once.document, [
        { type: "duplicateBlock", id: "block00002", parent: "lesson0002" },
      ]),
    );
    expect(lesson(twice.document, "lesson0002").blocks.map((b) => b.id)).toEqual([
      ...once.created,
      ...twice.created,
    ]);
  });
});

describe("delete", () => {
  test("deleting a quiz removes buttons to it and moves course tracking to the completion rule", () => {
    const course = fullCourse();
    const result = ok(applyCommands(course, [{ type: "deleteEntry", id: "quiz000001" }]));
    expect(result.document.entries.map((e) => e.id)).toEqual([
      "section001",
      "lesson0001",
      "lesson0002",
    ]);
    const graphic = lesson(result.document, "lesson0001").blocks[1];
    expect(graphic?.items?.map((i) => i.id)).not.toContain("button0001");
    expect(graphic?.items).toHaveLength(
      (lesson(course, "lesson0001").blocks[1]?.items?.length ?? 0) - 1,
    );
    expect(result.document.publish?.tracking).toEqual({ kind: "completion" });
    expect(result.ids).toEqual(
      expect.arrayContaining(["quiz000001", "question02", "button0001", "block00002", course.id]),
    );
  });

  test("deleting a lesson removes its blocks and turns off a quiz's skip-ahead to it", () => {
    const course = fullCourse();
    const result = ok(applyCommands(course, [{ type: "deleteEntry", id: "lesson0002" }]));
    expect(quiz(result.document).settings?.skipAhead).toBeUndefined();
    expect(quiz(result.document).settings?.timer).toEqual(quiz(course).settings?.timer);
    const first = ok(applyCommands(course, [{ type: "deleteEntry", id: "lesson0001" }]));
    expect(indexDocument(first.document).has("block00001")).toBe(false);
    expect(first.ids).toEqual(expect.arrayContaining(["lesson0001", "block00007", "answer0005"]));
  });

  test("rejects a delete that would break the document", () => {
    const course = fullCourse();
    // Two answers is the minimum, and a referenced media file must stay in the index.
    expect(rejected(course, [{ type: "deleteAnswer", id: "answer0001" }])[0]?.code).toBe(
      "invalid-document",
    );
    expect(rejected(course, [{ type: "deleteMedia", id: "media00001" }])[0]).toMatchObject({
      code: "invalid-document",
      message: "is not in the media index",
    });
    expect(rejected(course, [{ type: "deleteQuestion", id: "question01" }])[0]?.code).toBe(
      "not-allowed",
    );
  });
});

describe("lists of commands", () => {
  test("apply as one unit: a later bad command writes nothing", () => {
    const errors = rejected(fullCourse(), [
      { type: "updateCourse", set: { title: "Changed" } },
      { type: "deleteBlock", id: "nowhere001" },
    ]);
    expect(errors).toEqual([
      { code: "not-found", command: 1, path: "/id", message: "does not refer to a block" },
    ]);
  });

  test("are validated as a whole, so a single-choice question can change its correct answer", () => {
    const course = fullCourse();
    const swap: Command[] = [
      { type: "updateAnswer", id: "answer0001", set: { correct: false } },
      { type: "updateAnswer", id: "answer0002", set: { correct: true } },
    ];
    expect(rejected(course, [swap[0] as Command])[0]?.code).toBe("invalid-document");
    const result = ok(applyCommands(course, swap));
    expect(result.ids).toEqual(["answer0001", "answer0002"]);
  });

  test("later commands can address objects inserted earlier in the list", () => {
    const result = ok(
      applyCommands(fullCourse(), [
        {
          type: "insertEntry",
          value: { id: "newquiz001", kind: "quiz", title: "Quiz", questions: [] },
        },
        {
          type: "insertQuestion",
          parent: "newquiz001",
          value: { id: "newques001", kind: "fill-in", prompt: "<p>?</p>", acceptedAnswers: ["a"] },
        },
        { type: "updateQuestion", id: "newques001", set: { acceptedAnswers: ["a", "b"] } },
      ]),
    );
    expect(result.created).toEqual(["newquiz001", "newques001"]);
  });

  test("an unknown command or a command that is not an object is rejected", () => {
    const course = fullCourse();
    expect(rejected(course, [{ type: "renameCourse" } as never])[0]).toMatchObject({
      code: "invalid-command",
      path: "/type",
    });
    expect(rejected(course, [null as never])[0]?.code).toBe("invalid-command");
    expect(
      rejected(course, [{ type: "deleteBlock", id: "block00001", extra: 1 } as never])[0],
    ).toMatchObject({
      code: "invalid-command",
      path: "/extra",
    });
  });
});
