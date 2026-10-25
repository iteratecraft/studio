import { serializeCourse } from "@course-suite/format";
import { fullCourse, minimalCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import type { Command } from "./commands.js";
import type { ChangeEvent } from "./editor.js";
import { createEditor } from "./editor.js";

const rename = (title: string): Command => ({ type: "updateCourse", set: { title } });

describe("undo and redo", () => {
  test("UI-BLOCKS-EDITOR-R14: undo starts off and turns on after a change; redo only after an undo", () => {
    const editor = createEditor(fullCourse());
    expect([editor.canUndo, editor.canRedo]).toEqual([false, false]);
    expect(editor.undo()).toBe(false);
    editor.dispatch(rename("One"));
    expect([editor.canUndo, editor.canRedo]).toEqual([true, false]);
    editor.undo();
    expect([editor.canUndo, editor.canRedo]).toEqual([false, true]);
    editor.redo();
    expect(editor.document.title).toBe("One");
    editor.undo();
    editor.dispatch(rename("Two"));
    expect(editor.canRedo).toBe(false);
  });

  test("UI-BLOCKS-EDITOR-R12: undo brings back a deleted lesson and the references the delete fixed", () => {
    const course = fullCourse();
    const editor = createEditor(course);
    expect(editor.dispatch({ type: "deleteEntry", id: "quiz000001" }).ok).toBe(true);
    editor.undo();
    expect(serializeCourse(editor.document)).toBe(serializeCourse(course));
  });

  test("UI-PUBCOLLAB-R38, UI-BLOCKS-EDITOR-R15: history keeps the last 50 actions and can be cleared", () => {
    const editor = createEditor(fullCourse());
    for (let i = 1; i <= 55; i += 1) editor.dispatch(rename(`Title ${i}`));
    let undone = 0;
    while (editor.undo()) undone += 1;
    expect(undone).toBe(50);
    expect(editor.document.title).toBe("Title 5");
    editor.clearHistory();
    expect([editor.canUndo, editor.canRedo]).toEqual([false, false]);
  });

  test("a list of commands is one undo step", () => {
    const course = fullCourse();
    const editor = createEditor(course);
    editor.dispatch([rename("One"), { type: "deleteEntry", id: "lesson0002" }]);
    editor.undo();
    expect(serializeCourse(editor.document)).toBe(serializeCourse(course));
    expect(editor.canUndo).toBe(false);
  });

  test("a group joins several dispatches into one undo step, and nests", () => {
    const course = minimalCourse();
    const editor = createEditor(course);
    editor.dispatch(rename("Before"));
    editor.beginGroup();
    editor.dispatch({
      type: "insertEntry",
      value: { id: "lesson0001", kind: "lesson", title: "AI lesson", blocks: [] },
    });
    editor.beginGroup();
    editor.dispatch({
      type: "insertBlock",
      parent: "lesson0001",
      value: { id: "block00001", category: "divider", variant: "plain" },
    });
    editor.endGroup();
    // A rejected dispatch inside the group changes nothing.
    expect(editor.dispatch({ type: "deleteBlock", id: "nowhere001" }).ok).toBe(false);
    editor.dispatch(rename("After"));
    editor.endGroup();
    editor.dispatch(rename("Later"));
    editor.undo();
    editor.undo();
    expect(editor.document).toMatchObject({ title: "Before", entries: [] });
    editor.redo();
    expect(editor.document.entries).toHaveLength(1);
    expect(editor.document.title).toBe("After");
  });

  test("undo closes an open group", () => {
    const editor = createEditor(minimalCourse());
    editor.beginGroup();
    editor.dispatch(rename("One"));
    editor.undo();
    editor.dispatch(rename("Two"));
    editor.dispatch(rename("Three"));
    editor.endGroup();
    editor.undo();
    expect(editor.document.title).toBe("Empty");
  });
});

describe("change events", () => {
  test("carry the document, the affected ids, the ops and where the change came from", () => {
    const editor = createEditor(fullCourse());
    const events: ChangeEvent[] = [];
    const stop = editor.subscribe((event) => events.push(event));
    editor.dispatch({ type: "updateBlock", id: "block00001", set: { variant: "paragraph" } });
    editor.undo();
    editor.redo();
    expect(events.map((e) => [e.source, e.ids])).toEqual([
      ["do", ["block00001"]],
      ["undo", ["block00001"]],
      ["redo", ["block00001"]],
    ]);
    expect(events[2]?.document).toBe(editor.document);
    expect(events[0]?.ops).toEqual([
      { op: "set", path: ["entries", 1, "blocks", 0, "variant"], value: "paragraph" },
    ]);
    stop();
    editor.dispatch(rename("Quiet"));
    expect(events).toHaveLength(3);
  });

  test("a rejected or empty dispatch sends no event and makes no undo step", () => {
    const course = fullCourse();
    const editor = createEditor(course);
    const events: ChangeEvent[] = [];
    editor.subscribe((event) => events.push(event));
    expect(editor.dispatch(rename(course.title)).ok).toBe(true);
    expect(editor.dispatch({ type: "deleteBlock", id: "nowhere001" }).ok).toBe(false);
    expect(events).toEqual([]);
    expect(editor.canUndo).toBe(false);
    expect(editor.document).toBe(course);
  });
});

test("an invalid document is refused", () => {
  expect(() => createEditor({ ...minimalCourse(), title: 1 } as never)).toThrow(
    "Invalid course document: /title must be a string",
  );
});

test("a document from a newer minor version keeps the properties this version does not know", () => {
  const newer = { ...minimalCourse(), schemaVersion: "1.9", futureSetting: true } as never;
  const editor = createEditor(newer);
  expect(editor.dispatch(rename("Kept")).ok).toBe(true);
  expect(editor.document).toMatchObject({ futureSetting: true, title: "Kept" });
});
