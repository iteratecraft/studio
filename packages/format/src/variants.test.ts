import { describe, expect, test } from "vitest";
import { staticBlocksCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import type { Block } from "./course.js";
import { validateCourse } from "./validate.js";
import { deepestHeadingLevel, headingLevel, VARIANTS, variantSettings } from "./variants.js";

const READ = "/entries/0/blocks";
const at = (id: string) => {
  const course = staticBlocksCourse();
  for (const [e, entry] of course.entries.entries()) {
    if (entry.kind !== "lesson") continue;
    const b = entry.blocks.findIndex((block) => block.id === id);
    if (b >= 0) return `/entries/${e}/blocks/${b}`;
  }
  throw new Error(id);
};

describe("text and static block variants (BLK-04)", () => {
  test("[rise:3C] a course with every text and static variant is valid", () => {
    const course = staticBlocksCourse();
    expect(validateCourse(course)).toEqual([]);
    const used = new Set(
      course.entries.flatMap((entry) =>
        entry.kind === "lesson" ? entry.blocks.map((b) => `${b.category}/${b.variant}`) : [],
      ),
    );
    // Built before this epic, and covered by the other fixtures.
    const older = [
      "text/paragraph",
      "text/heading",
      "text/subheading",
      "text/paragraph-with-subheading",
      "divider/continue",
    ];
    const defined = Object.entries(VARIANTS)
      .flatMap(([category, variants]) => Object.keys(variants).map((v) => `${category}/${v}`))
      .filter((type) => !older.includes(type))
      // Multimedia blocks are BLK-05's, covered by the media course (variants-media.test.ts).
      .filter((type) => !type.startsWith("multimedia/"))
      // Knowledge checks are BLK-07's, covered by the quiz course (variants-quiz.test.ts).
      .filter((type) => !type.startsWith("knowledge-check/"));
    for (const type of defined) expect(used, type).toContain(type);
  });

  test.each([
    [
      "an unknown setting",
      `${at("ststatnote")}/variantSettings/shade`,
      1,
      "/variantSettings/shade",
      "is not a known property",
    ],
    [
      "a heading level 1",
      `${at("sttexthead")}/variantSettings/headingLevel`,
      1,
      "/variantSettings/headingLevel",
      "at least 2",
    ],
    [
      "five columns of text",
      `${at("sttextcols")}/variantSettings/columns`,
      5,
      "/variantSettings/columns",
      "at most 4",
    ],
    [
      "a corner radius over 30",
      `${at("stimgcentr")}/variantSettings/cornerRadius`,
      31,
      "/variantSettings/cornerRadius",
      "at most 30",
    ],
    [
      "a note colour that is not a colour",
      `${at("ststatnote")}/variantSettings/noteColor`,
      "red",
      "/variantSettings/noteColor",
      "must match",
    ],
    [
      "an unknown cell padding",
      `${at("sttexttabl")}/variantSettings/cellPadding`,
      "huge",
      "/variantSettings/cellPadding",
      "must be one of",
    ],
    [
      "an image linked to a script",
      `${at("stimgcentr")}/variantSettings/link`,
      "javascript:alert(1)",
      "/variantSettings/link",
      "must match",
    ],
    [
      "an unknown quote variant",
      `${at("stquotecar")}/variant`,
      "quote-z",
      "/variant",
      "is not a quote variant",
    ],
    [
      "a marker in a list",
      `${at("stlistnumb")}/items/0`,
      { id: "markerzz01", kind: "marker", x: 1, y: 1 },
      "/items/0/kind",
      'must be "content"',
    ],
    [
      "a continue block waiting for something unknown",
      `${READ}/0`,
      {
        id: "contzzzz01",
        category: "divider",
        variant: "continue",
        variantSettings: { completionType: "later" },
      },
      "/variantSettings/completionType",
      "must be one of",
    ],
  ])("[rise:3C] %s is reported at its path", (_name, path, value, errorPath, message) => {
    const block = path.split("/").slice(0, 5).join("/");
    expect(validateCourse(edit(staticBlocksCourse(), path, value))).toEqual([
      { path: `${block}${errorPath}`, message: expect.stringContaining(message) },
    ]);
  });

  test("a newer MINOR's settings and variants are kept, not reported", () => {
    const course = edit(
      edit(staticBlocksCourse(), `${at("stquotecar")}/variant`, "quote-z"),
      `${at("ststatnote")}/variantSettings/shade`,
      1,
    );
    expect(validateCourse(course, { allowUnknown: true })).toEqual([]);
  });

  test("defaults fill what a block leaves unset; its own values win", () => {
    expect(
      variantSettings({ category: "list", variant: "numbered", variantSettings: { start: 3 } }),
    ).toEqual({
      markerSpace: 12,
      markerContrast: "auto",
      start: 3,
    });
    expect(variantSettings({ category: "image", variant: "centered" })).toMatchObject({
      zoom: true,
      cornerRadius: 0,
    });
    // Open variants keep what they hold.
    expect(
      variantSettings({ category: "interactive", variant: "tabs", variantSettings: { x: 1 } }),
    ).toEqual({ x: 1 });
  });

  test("[rise:3C] UI-BLOCKS-EDITOR-R25: sibling variants share their settings, so a switch keeps them valid", () => {
    // Multimedia variants never switch into each other (M2-13), so each has its own table.
    for (const [category, variants] of Object.entries(VARIANTS)) {
      if (category === "multimedia") continue;
      const tables = new Set(Object.values(variants));
      expect(tables.size).toBeLessThanOrEqual(3);
    }
    expect(VARIANTS.statement?.note).toBe(VARIANTS.statement?.["statement-a"]);
    expect(VARIANTS.quote?.carousel).toBe(VARIANTS.quote?.["quote-a"]);
  });
});

describe("the heading outline of a lesson (BLK-04)", () => {
  const text = (variant: string, level?: number, title = "<p>x</p>"): Block => ({
    id: `blk${variant}${level ?? ""}`,
    category: "text",
    variant,
    items: [{ id: "itm", kind: "content", title, text: "<p>Body</p>" }],
    ...(level !== undefined && { variantSettings: { headingLevel: level } }),
  });

  test("[rise:3C] a heading asks for its chosen level, else 2 for a heading and 3 for a subheading", () => {
    expect(headingLevel(text("heading"))).toBe(2);
    expect(headingLevel(text("paragraph-with-subheading"))).toBe(3);
    expect(headingLevel(text("subheading", 5))).toBe(5);
    // No heading: a paragraph, an empty heading, another category.
    expect(headingLevel(text("paragraph", 4))).toBeUndefined();
    expect(headingLevel(text("heading", 2, ""))).toBeUndefined();
    expect(headingLevel({ id: "b", category: "statement", variant: "note" })).toBeUndefined();
  });

  test("[rise:3C] accessibility W18: a heading may go at most one level below the nearest heading above it", () => {
    const blocks = [
      text("heading"),
      text("paragraph"),
      text("subheading"),
      text("heading", 2, ""),
      text("subheading", 5),
    ];
    // Under the lesson title, level 2; a paragraph or an empty heading does not count.
    expect(deepestHeadingLevel(blocks, 0)).toBe(2);
    expect(deepestHeadingLevel(blocks, 2)).toBe(3);
    expect(deepestHeadingLevel(blocks, 4)).toBe(4);
    expect(deepestHeadingLevel(blocks, 5)).toBe(6);
  });
});
