import { describe, expect, test } from "vitest";
import { interactiveBlocksCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import { validateCourse } from "./validate.js";
import { INTERACTIVE_ITEMS, OPEN, VARIANTS, variantSettings } from "./variants.js";

const at = (id: string) => {
  const course = interactiveBlocksCourse();
  for (const [e, entry] of course.entries.entries()) {
    if (entry.kind !== "lesson") continue;
    const b = entry.blocks.findIndex((block) => block.id === id);
    if (b >= 0) return `/entries/${e}/blocks/${b}`;
  }
  throw new Error(id);
};

describe("interactive block variants (M2-14, BLK-06)", () => {
  test("[rise:3C] [rise:4] a course with every interactive variant is valid, and each holds its own kind of item", () => {
    const course = interactiveBlocksCourse();
    expect(validateCourse(course)).toEqual([]);
    const used = new Set(
      course.entries.flatMap((entry) =>
        entry.kind === "lesson" ? entry.blocks.map((b) => b.variant) : [],
      ),
    );
    expect([...used].sort()).toEqual(Object.keys(INTERACTIVE_ITEMS).sort());
  });

  test.each([
    [
      "a marker in an accordion",
      `${at("iaaccord01")}/items/0`,
      { id: "markerzz01", kind: "marker", x: 1, y: 1 },
      "/items/0/kind",
      'must be "content"',
    ],
    [
      "a section in a labeled graphic",
      `${at("ialabeled1")}/items/1`,
      { id: "sectionz01", kind: "content", title: "x" },
      "/items/1/kind",
      'must be "marker"',
    ],
    [
      "a step in a flashcard grid",
      `${at("iacardgrid")}/items/0`,
      { id: "stepzzzz01", kind: "step", role: "step" },
      "/items/0/kind",
      'must be "flashcard"',
    ],
    [
      "an introduction after the first card",
      `${at("iaprocess1")}/items/2/role`,
      "intro",
      "/items/2/role",
      "an introduction must be the first card",
    ],
    [
      "a summary before the last card",
      `${at("iaprocess1")}/items/0/role`,
      "summary",
      "/items/0/role",
      "a summary the last",
    ],
    [
      "a marker icon we do not draw",
      `${at("ialabeled1")}/items/1/icon`,
      "rocket",
      "/items/1/icon",
      "must be one of number, plus",
    ],
    [
      "a marker placed past the picture",
      `${at("ialabeled1")}/items/0/x`,
      101,
      "/items/0/x",
      "at most 100",
    ],
    [
      "an accordion that opens one at a time by a word",
      `${at("iaaccord02")}/variantSettings/oneAtATime`,
      "yes",
      "/variantSettings/oneAtATime",
      "must be a boolean",
    ],
    [
      "a step word longer than 40 characters",
      `${at("iaprocess1")}/variantSettings`,
      { stepWord: "x".repeat(41) },
      "/variantSettings/stepWord",
      "at most 40",
    ],
    [
      "buttons of an unknown width",
      `${at("iabuttons1")}/variantSettings/width`,
      "huge",
      "/variantSettings/width",
      "must be one of",
    ],
    [
      "a button to an address that is not a web page",
      `${at("iabuttons1")}/items/0/destination/url`,
      "javascript:alert(1)",
      "/items/0/destination/url",
      "must match",
    ],
    [
      "a button without a label",
      `${at("iabutton01")}/items/0/label`,
      "",
      "/items/0/label",
      "must not be empty",
    ],
    [
      "a button to a lesson the course does not have",
      `${at("iabutton01")}/items/0/destination/entry`,
      "lessongone",
      "/items/0/destination/entry",
      "does not refer to an object",
    ],
  ])("[rise:3C] %s is refused", (_, path, value, where, message) => {
    const errors = validateCourse(edit(interactiveBlocksCourse(), path, value));
    const block = path.split("/").slice(0, 5).join("/");
    expect(errors).toContainEqual({
      path: `${block}${where}`,
      message: expect.stringContaining(message),
    });
  });

  test("[rise:3C] blocks-interactions 2.5: a process may leave out its introduction and its summary", () => {
    const full = interactiveBlocksCourse();
    const path = `${at("iaprocess1")}/items`;
    const steps = full.entries[1]?.kind === "lesson" ? full.entries[1].blocks[1]?.items : [];
    const course = edit(full, path, steps?.slice(1, -1));
    expect(validateCourse(course)).toEqual([]);
  });

  test("[rise:3C] UI-BLOCKS-EDITOR-R25: siblings share their settings, so the variant switcher keeps them valid", () => {
    const interactive = VARIANTS.interactive ?? {};
    expect(interactive.accordion).toBe(interactive.tabs);
    expect(interactive["flashcard-grid"]).toBe(interactive["flashcard-stack"]);
    expect(interactive.button).toBe(interactive["button-stack"]);
    // Blocks of later epics keep whatever they hold until those epics close them.
    for (const variant of ["scenario", "sorting", "timeline", "slides"]) {
      expect(interactive[variant], variant).toBe(OPEN);
    }
  });

  test("[rise:3C] blocks-interactions 2.2 to 2.10: settings left out take their defaults", () => {
    expect(variantSettings({ category: "interactive", variant: "accordion" })).toEqual({
      oneAtATime: false,
      zoom: true,
    });
    expect(variantSettings({ category: "interactive", variant: "process" })).toEqual({
      stepLabel: true,
      zoom: true,
    });
    expect(variantSettings({ category: "interactive", variant: "flashcard-stack" })).toEqual({
      flipHint: true,
      autosize: true,
      cardHeight: 240,
      imageStyle: "centered",
    });
    expect(variantSettings({ category: "interactive", variant: "button-stack" })).toEqual({
      showDescription: true,
      align: "left",
      width: "fit",
      buttonContrast: "auto",
      spacing: 12,
    });
    expect(variantSettings({ category: "interactive", variant: "labeled-graphic" })).toEqual({
      cornerRadius: 0,
      markerContrast: "auto",
      zoom: true,
    });
  });
});
