import { createMemoryHost } from "@course-suite/host";
import { describe, expect, test } from "vitest";
import { blankCourse } from "./course.js";
import {
  itemOf,
  type LibraryItem,
  loadLibrary,
  saveLibrary,
  type View,
  visibleItems,
  withItem,
  without,
} from "./library.js";

const item = (title: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  file: { id: `${title}.crs`, name: `${title}.crs` },
  title,
  kind: "course",
  lessons: 0,
  created: 0,
  updated: 0,
  ...extra,
});
const view = (extra: Partial<View> = {}): View => ({
  query: "",
  sort: "updated",
  kind: "all",
  deleted: false,
  ...extra,
});
const titles = (items: LibraryItem[]) => items.map((i) => i.title);

describe("the course list", () => {
  test("keeps its items in the host's storage, and skips entries of the wrong shape", async () => {
    const { storage } = createMemoryHost();
    expect(await loadLibrary(storage)).toEqual([]);
    await saveLibrary(storage, [item("A")]);
    expect(await loadLibrary(storage)).toEqual([item("A")]);
    await storage.set("library", JSON.stringify([item("B"), { title: "no file" }, null, 3]));
    expect(await loadLibrary(storage)).toEqual([item("B")]);
    await storage.set("library", "not json");
    expect(await loadLibrary(storage)).toEqual([]);
  });

  test("a card counts lessons and quizzes, not section headers, and keeps when it was created", () => {
    const course = {
      ...blankCourse("course", "Safety", new Date(1000)),
      entries: [
        { id: "section001", kind: "section" as const, title: "Start" },
        { id: "lesson0001", kind: "lesson" as const, title: "One", blocks: [] },
      ],
    };
    const first = itemOf({ id: "a.crs", name: "a.crs" }, course, 5000);
    expect(first).toMatchObject({ title: "Safety", lessons: 1, created: 1000, updated: 5000 });
    const list = withItem([{ ...first, created: 42, deleted: 7 }, item("Other")], first);
    // Updated in place at the top, still created at the same time, and no longer deleted.
    expect(list[0]).toEqual({ ...first, created: 42 });
    expect(titles(list)).toEqual(["Safety", "Other"]);
    expect(titles(without(list, first.file))).toEqual(["Other"]);
  });

  test("UI-BLOCKS-EDITOR-R2, blocks-editor 2.1: sort by last updated, date created or title", () => {
    const items = [
      item("beta", { created: 3, updated: 1 }),
      item("Alpha", { created: 1, updated: 3 }),
      item("Gamma 10", { created: 2, updated: 2 }),
      item("Gamma 9", { created: 0, updated: 0 }),
    ];
    expect(titles(visibleItems(items, view(), "en"))).toEqual([
      "Alpha",
      "Gamma 10",
      "beta",
      "Gamma 9",
    ]);
    expect(titles(visibleItems(items, view({ sort: "created" }), "en"))).toEqual([
      "beta",
      "Gamma 10",
      "Alpha",
      "Gamma 9",
    ]);
    expect(titles(visibleItems(items, view({ sort: "title" }), "en"))).toEqual([
      "Alpha",
      "beta",
      "Gamma 9",
      "Gamma 10",
    ]);
  });

  test("search matches titles in any case, the type filter matches the kind, Deleted is apart", () => {
    const items = [
      item("Ladder safety"),
      item("Lifting", { kind: "microlearning" }),
      item("Old ladders", { deleted: 1 }),
    ];
    expect(titles(visibleItems(items, view({ query: " LADDER " }), "en"))).toEqual([
      "Ladder safety",
    ]);
    expect(titles(visibleItems(items, view({ kind: "microlearning" }), "en"))).toEqual(["Lifting"]);
    expect(titles(visibleItems(items, view({ deleted: true }), "en"))).toEqual(["Old ladders"]);
  });

  test("BLK-01: search, sort and type filter over 500 courses each take under 300 ms", () => {
    const items = Array.from({ length: 500 }, (_, i) =>
      item(`Course ${i}`, {
        created: i,
        updated: 500 - i,
        kind: i % 3 ? "course" : "microlearning",
      }),
    );
    for (const extra of [
      { query: "course 4" },
      { sort: "title" as const },
      { kind: "course" as const },
    ]) {
      const start = performance.now();
      visibleItems(items, view(extra), "en");
      expect(performance.now() - start).toBeLessThan(300);
    }
  });
});
