import { describe, expect, test } from "vitest";
import { interactiveBlocksCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import { EMAIL_PATTERN, isEmail, isRelativeLink, RELATIVE_URL_PATTERN } from "./richtext.js";
import { courseSchema, validateCourse } from "./validate.js";
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
      "a button to a relative address that leaves for another host",
      `${at("iabuttons1")}/items/1/destination`,
      { kind: "relative", path: "//example.org/page" },
      "/items/1/destination/path",
      "must match",
    ],
    [
      "a button to a relative address with a scheme",
      `${at("iabuttons1")}/items/1/destination`,
      { kind: "relative", path: "javascript:alert(1)" },
      "/items/1/destination/path",
      "must match",
    ],
    [
      "a button to an email destination with no address",
      `${at("iabuttons1")}/items/2/destination`,
      { kind: "email", addresses: [] },
      "/items/2/destination/addresses",
      "at least 1",
    ],
    [
      "a button to a mail address that is not one",
      `${at("iabuttons1")}/items/3/destination/addresses/1`,
      "help at example.org",
      "/items/3/destination/addresses/1",
      "must match",
    ],
    [
      "an item embed that is not its provider's player",
      `${at("iaaccord01")}/items/1/embed/embedUrl`,
      "https://www.youtube-nocookie.com.example.org/embed/aaaaaaaaaaa",
      "/items/1/embed/embedUrl",
      "is not a player address of YouTube",
    ],
    [
      "an item embed named for a provider that is not listed",
      `${at("iaaccord01")}/items/1/embed/provider`,
      "Elsewhere",
      "/items/1/embed/embedUrl",
      "is not a player address of Elsewhere",
    ],
    [
      "an item with both a picture and an embed",
      `${at("iaaccord01")}/items/1/media`,
      { key: "wheel.svg", alt: "" },
      "/items/1/embed",
      "one picture, video or embed",
    ],
    [
      "a card side with both a picture and an embed",
      `${at("iacardgrid")}/items/2/back/media`,
      { key: "wheel.svg", alt: "" },
      "/items/2/back/embed",
      "one picture, video or embed",
    ],
    [
      "item audio missing from the media index",
      `${at("ialabeled1")}/items/2/audio/key`,
      "gone.wav",
      "/items/2/audio/key",
      "is not in the media index",
    ],
    [
      "a card side picture style we do not draw",
      `${at("iacardgrid")}/items/0/back/imageStyle`,
      "tiled",
      "/items/0/back/imageStyle",
      "must be one of",
    ],
    [
      "a button heading level past 6",
      `${at("iabutton01")}/variantSettings`,
      { headingLevel: 7 },
      "/variantSettings/headingLevel",
      "at most 6",
    ],
    [
      "an audio position other than top or bottom",
      `${at("ialabeled1")}/variantSettings/audioPosition`,
      "middle",
      "/variantSettings/audioPosition",
      "must be one of",
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

  test("[rise:3C] blocks-interactions A10, A11: embeds and audio belong to the items of interactive blocks only", () => {
    const course = interactiveBlocksCourse();
    const lesson = course.entries[0];
    if (lesson?.kind !== "lesson") throw new Error("fixture");
    lesson.blocks.push({
      id: "iagallery1",
      category: "gallery",
      variant: "grid-2",
      items: [
        {
          id: "iagalitem1",
          kind: "content",
          media: { key: "wheel.svg", alt: "" },
          audio: { key: "bell.wav" },
        },
        {
          id: "iagalitem2",
          kind: "content",
          embed: {
            embedUrl: "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa",
            provider: "YouTube",
          },
        },
      ],
    });
    const path = `/entries/0/blocks/${lesson.blocks.length - 1}/items`;
    expect(validateCourse(course)).toEqual([
      { path: `${path}/0/audio`, message: "is kept only on the items of interactive blocks" },
      { path: `${path}/1/embed`, message: "is kept only on the items of interactive blocks" },
    ]);
  });

  test("[rise:3C] blocks-interactions 2.10, W8: a relative address is a path next to the course, never another host or a scheme; a mail address has a domain", () => {
    // The player's and the editor's checks are the schema's own patterns.
    const defs = courseSchema.$defs as Record<string, { pattern?: string }>;
    expect(defs.RelativeUrl?.pattern).toBe(RELATIVE_URL_PATTERN);
    expect(defs.Email?.pattern).toBe(EMAIL_PATTERN);
    expect(isEmail("workshop@example.org")).toBe(true);
    expect(isEmail("workshop@example")).toBe(false);
    for (const path of ["handbook/care.html", "../shared/guide.pdf?page=2#top", "/files/a.pdf"]) {
      expect(isRelativeLink(path), path).toBe(true);
    }
    for (const path of [
      "//example.org/x",
      "/\\example.org/x",
      "https://example.org/",
      "mailto:a@example.org",
      "JavaScript:alert(1)",
      "#/lessons/x",
      "?q=1",
      "a b.html",
      "a\\b.html",
      "",
    ]) {
      expect(isRelativeLink(path), path).toBe(false);
    }
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
      audioPosition: "bottom",
    });
    expect(variantSettings({ category: "interactive", variant: "process" })).toEqual({
      stepLabel: true,
      zoom: true,
      audioPosition: "bottom",
    });
    // Each side of a card has its own picture style (2.8 "per side"), so the block has none.
    expect(variantSettings({ category: "interactive", variant: "flashcard-stack" })).toEqual({
      flipHint: true,
      autosize: true,
      cardHeight: 240,
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
      audioPosition: "bottom",
    });
  });
});
