import { expect, test } from "vitest";
import { minimalCourse } from "../test/courses.js";
import type { Theme } from "./course.js";
import {
  BUILTIN_FONTS,
  contrastOf,
  cropOf,
  FONT_PAIRINGS,
  fontKey,
  fontsOf,
  mix,
  nearestReadable,
  overlayFloor,
  PANEL,
  THEME_COLORS,
  themeColors,
  withLayoutStyle,
} from "./theme.js";
import { courseSchema, validateCourse } from "./validate.js";

/** The same 1,000 colours on every run: a small linear congruential generator. */
function randomColors(count: number): string[] {
  let seed = 20261026;
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return `#${(seed >>> 8).toString(16).padStart(6, "0")}`;
  });
}
const PAGE_TEXT = "#1d1f23";

test("[rise:R18] BLK-09, ENG-08: automatic contrast keeps text at 4.5:1 and theme-coloured buttons at 3:1 for 1,000 random theme colours", () => {
  for (const color of [...randomColors(1000), ...THEME_COLORS, "#ffffff", "#000000", "#777777"]) {
    const c = themeColors({ color });
    expect(contrastOf(c.themeText, c.theme), `text on ${color}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(c.tintText, c.tint), `text on the tint of ${color}`).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const surface of ["#ffffff", PANEL]) {
      expect(
        contrastOf(c.accent, surface),
        `links in ${color} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastOf(c.button, surface),
        `buttons in ${color} on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
    expect(contrastOf(c.buttonText, c.button), `button text in ${color}`).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastOf(PAGE_TEXT, c.accentSoft),
      `outline highlight of ${color}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("[rise:R18] ENG-08: text on an element filled with the accent colour keeps 4.5:1 for 2,000 random theme colours, whatever the button text is", () => {
  // The accent and the button differ: the default orange gives a button with dark text but an
  // accent dark enough for white text, so one text colour cannot serve both.
  const orange = themeColors(undefined);
  expect(orange.buttonText).toBe("#000000");
  expect(orange.accentText).toBe("#ffffff");
  for (const color of [...randomColors(2000), ...THEME_COLORS]) {
    for (const contrast of ["auto", "light", "dark"] as const) {
      const c = themeColors({ color, contrast });
      expect(contrastOf(c.accentText, c.accent), `text on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("UI-BLOCKS-EDITOR-R19: a fixed light or dark contrast is kept, whatever it gives", () => {
  expect(themeColors({ color: "#ffff00", contrast: "light" }).themeText).toBe("#ffffff");
  expect(themeColors({ color: "#000080", contrast: "dark" }).themeText).toBe("#000000");
  // The button is the theme colour itself then, as the author chose.
  expect(themeColors({ color: "#ffff00", contrast: "light" }).button).toBe("#ffff00");
});

test("the nearest passing colour is the colour itself when it passes, else the least change that does", () => {
  expect(nearestReadable("#285f9f", "#ffffff", 4.5)).toBe("#285f9f");
  for (const color of randomColors(200)) {
    for (const [against, ratio] of [
      ["#ffffff", 4.5],
      ["#000000", 4.5],
      ["#ffffff", 3],
      ["#777777", 4.5],
    ] as const) {
      const near = nearestReadable(color, against, ratio);
      expect(contrastOf(near, against), `${color} on ${against}`).toBeGreaterThanOrEqual(ratio);
    }
  }
  // Moving less would not do: the default theme colour needs its own darker shade for links.
  const near = nearestReadable("#ff631e", "#ffffff", 4.5);
  expect(near).not.toBe("#ff631e");
  expect(contrastOf(mix("#ff631e", "#000000", 0.05), "#ffffff")).toBeLessThan(4.5);
});

test("UI-BLOCKS-EDITOR-R43 BLK-09: a layout style changes only the cover and header layouts", () => {
  const theme: Theme = {
    color: "#285f9f",
    contrast: "dark",
    fonts: {
      heading: { kind: "builtin", id: "inter" },
      body: { kind: "custom", id: "fontabc123", name: "House" },
    },
    cover: { layout: "plain", startButton: false, overlay: { color: "theme", opacity: 70 } },
    headers: { layout: "color", color: "#123456", lessonCount: false, height: "large" },
    animations: false,
  };
  for (const style of ["classic", "rounded", "bold"] as const) {
    const next = withLayoutStyle(theme, style);
    expect(next.layout).toBe(style);
    const { layout: _, cover, headers, ...rest } = next;
    const { cover: oldCover, headers: oldHeaders, ...oldRest } = theme;
    expect(rest).toEqual(oldRest);
    expect({ ...cover, layout: "plain" }).toEqual(oldCover);
    expect({ ...headers, layout: "color" }).toEqual(oldHeaders);
  }
});

test("BLK-09, ENG-08: a role without a chosen font shows in device fonts, and the interface follows the heading", () => {
  expect(fontsOf(undefined)).toEqual({});
  expect(fontsOf({ fonts: { body: { kind: "builtin", id: "literata" } } })).toEqual({
    body: { kind: "builtin", id: "literata" },
  });
  const custom = { kind: "custom", id: "fontabc123", name: "House" } as const;
  expect(fontsOf({ fonts: { heading: custom } })).toEqual({ heading: custom, ui: custom });
  expect(fontKey(custom)).toBe("custom-fontabc123");
  expect(fontKey({ kind: "builtin", id: "inter" })).toBe("inter");
});

test("D-45: eight bundled families, the schema's list, and every pairing built from them", () => {
  const defs = courseSchema.$defs as Record<
    string,
    { oneOf: { properties: Record<string, { enum?: string[] }> }[] }
  >;
  const ids = defs.FontRef?.oneOf[0]?.properties.id?.enum;
  expect(BUILTIN_FONTS.map((font) => font.id)).toEqual(ids);
  expect(BUILTIN_FONTS).toHaveLength(8);
  for (const pairing of FONT_PAIRINGS) {
    for (const id of pairing) expect(ids).toContain(id);
  }
});

test("a cover overlay must be dark enough for its text over any picture", () => {
  const floor = overlayFloor("#000000", "#ffffff");
  expect(floor).toBeGreaterThan(50);
  expect(floor).toBeLessThan(70);
  expect(overlayFloor("#ffff00", "#ffffff")).toBeUndefined();
});

test("BLK-09 blocks-editor T4, T6: a crop shows a part of the image it was made for, kept inside it", () => {
  expect(cropOf(undefined, "a.png")).toBeUndefined();
  expect(cropOf({ x: 10, y: 20, width: 50, height: 40 }, "a.png")).toEqual({
    x: 10,
    y: 20,
    width: 50,
    height: 40,
  });
  // Made for another picture: the new one shows whole.
  expect(cropOf({ key: "b.png", x: 0, y: 0, width: 50, height: 50 }, "a.png")).toBeUndefined();
  expect(cropOf({ key: "a.png", x: 80, y: 90, width: 50, height: 50 }, "a.png")).toEqual({
    x: 80,
    y: 90,
    width: 20,
    height: 10,
  });
});

test("a course with a theme validates; an unknown theme setting does not", () => {
  const course = minimalCourse();
  course.theme = {
    layout: "bold",
    cover: { layout: "full-image", overlay: { color: "dark", opacity: 60 }, skip: true },
    headers: { layout: "color", color: "#123456", contrast: "light" },
    color: "#25bb64",
    fonts: {
      heading: { kind: "builtin", id: "montserrat" },
      body: { kind: "custom", id: "fontabc123", name: "House" },
    },
    animations: false,
    corners: "square",
    buttons: "square",
    textSizes: { body: 18, heading: 36, subheading: 26 },
  };
  expect(validateCourse(course)).toEqual([]);
  const big = { ...course, theme: { textSizes: { body: 80 } } };
  expect(validateCourse(big as never)).not.toEqual([]);
  const logo = { ...course, theme: { cover: { logo: { key: "nowhere.png" } } } };
  expect(validateCourse(logo as never)).toEqual([
    { path: "/theme/cover/logo/key", message: "is not in the media index" },
  ]);
  const wrong = { ...course, theme: { ...course.theme, shade: "#000000" } };
  expect(validateCourse(wrong as never)).not.toEqual([]);
  const font = { ...course, theme: { fonts: { heading: { kind: "builtin", id: "comic" } } } };
  expect(validateCourse(font as never)).not.toEqual([]);
});
