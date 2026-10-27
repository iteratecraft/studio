// M2-16 (BLK-08): the navigation settings and the rules that tie them together, and the continue
// block's own look.
import { describe, expect, test } from "vitest";
import type { Course, LessonEntry, QuizEntry } from "./course.js";
import {
  hasSearch,
  isRestricted,
  isStepped,
  type MenuStyle,
  menuLook,
  menuOf,
  pageButtonsOf,
  searchBlocked,
  skipAheadQuiz,
} from "./navigation.js";
import { contrastOf, THEME_COLORS } from "./theme.js";
import { validateCourse } from "./validate.js";
import { variantSettings } from "./variants.js";

const lesson: LessonEntry = { id: "lessonaaa1", kind: "lesson", title: "First", blocks: [] };
const course = (navigation?: Course["navigation"], extra: Partial<Course> = {}): Course => ({
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Navigation",
  entries: [lesson],
  media: [],
  ...(navigation && { navigation }),
  ...extra,
});

describe("navigation settings", () => {
  test("[rise:3F] blocks-editor 2.18: every setting is optional, with the sidebar, search and full-width buttons by default", () => {
    const plain = course();
    expect(validateCourse(plain)).toEqual([]);
    expect(menuOf(plain)).toBe("sidebar");
    expect(hasSearch(plain)).toBe(true);
    expect(pageButtonsOf(plain)).toBe("full-width");
    expect(isRestricted(plain)).toBe(false);
  });

  test("[rise:3F] every navigation option is a valid document, and an unknown value is not", () => {
    const all = course({
      off: false,
      menu: "overlay",
      menuClosed: true,
      sectionsClosed: true,
      search: false,
      pageButtons: "floating",
      pageButtonColor: "theme",
      menuStyle: "dark-theme",
      progressIndicator: "circle",
      compactCount: false,
      steps: false,
      stepIndicator: "numbers",
    });
    expect(validateCourse(all)).toEqual([]);
    const wrong = course({ menu: "drawer" as "sidebar" });
    expect(validateCourse(wrong).map((error) => error.path)).toEqual(["/navigation/menu"]);
  });

  test("[rise:3F] search is unavailable without the sidebar, with navigation off or restricted", () => {
    expect(searchBlocked(course({ menu: "compact" }))).toBe("no-sidebar");
    expect(searchBlocked(course({ menu: "overlay" }))).toBe("no-sidebar");
    expect(searchBlocked(course({ off: true }))).toBe("no-sidebar");
    expect(searchBlocked(course({ restricted: true }))).toBe("restricted");
    expect(hasSearch(course({ restricted: true, search: true }))).toBe(false);
    expect(hasSearch(course({ search: false }))).toBe(false);
  });

  test("[rise:R14] a quiz with skip-ahead forces lessons in order and is named as the cause", () => {
    const skipping: QuizEntry = {
      id: "quizskip01",
      kind: "quiz",
      title: "Check-in",
      questions: [],
      settings: { skipAhead: { entry: lesson.id } },
    };
    const withQuiz = course(undefined, { entries: [skipping, lesson] });
    expect(isRestricted(withQuiz)).toBe(true);
    expect(skipAheadQuiz(withQuiz)?.title).toBe("Check-in");
    expect(searchBlocked(withQuiz)).toBe("restricted");
  });

  test("[rise:3A] [rise:3F] a microlearning has no menu and no lesson buttons, and steps only when set", () => {
    const micro = course({ steps: true }, { kind: "microlearning" });
    expect(menuOf(micro)).toBeUndefined();
    expect(pageButtonsOf(micro)).toBeUndefined();
    expect(isStepped(micro)).toBe(true);
    expect(isStepped(course({ steps: true }))).toBe(false);
    expect(pageButtonsOf(course({ pageButtons: "off" }))).toBeUndefined();
  });
});

describe("menu look and lesson buttons", () => {
  const STYLES: MenuStyle[] = [
    "light",
    "gray",
    "theme",
    "tint",
    "dark",
    "dark-theme",
    "image-light",
    "image-dark",
  ];

  test("blocks-editor 2.18: every menu colour style, progress indicator, placement and button colour is valid; light, theme default and the lesson count by default", () => {
    for (const menuStyle of STYLES) expect(validateCourse(course({ menuStyle }))).toEqual([]);
    for (const progressIndicator of ["theme", "circle", "check"] as const) {
      expect(validateCourse(course({ progressIndicator }))).toEqual([]);
    }
    const tinted = course({ pageButtons: "floating-full-width", pageButtonColor: "theme-tint" });
    expect(validateCourse(tinted)).toEqual([]);
    expect(pageButtonsOf(tinted)).toBe("floating-full-width");
    expect(menuLook(course())).toEqual({ style: "light" });
    expect(validateCourse(course({ menuStyle: "neon" as MenuStyle })).map((e) => e.path)).toEqual([
      "/navigation/menuStyle",
    ]);
  });

  test("blocks-editor 2.18 [rise:R18]: a filled menu's text keeps 4.5:1 for every suggested theme colour, and an image menu's overlay keeps it over any picture", () => {
    for (const color of THEME_COLORS) {
      for (const menuStyle of STYLES) {
        const look = menuLook(course({ menuStyle }, { theme: { color } }));
        if (menuStyle === "light" || menuStyle === "gray") {
          expect(look.fill, menuStyle).toBeUndefined();
          continue;
        }
        const fill = look.fill as { color: string; text: string };
        expect(
          contrastOf(fill.text, fill.color),
          `${menuStyle} on ${color}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Without a cover picture an image style is its overlay colour alone.
    expect(menuLook(course({ menuStyle: "image-dark" })).image).toBeUndefined();
    const pictured = menuLook(
      course({ menuStyle: "image-dark" }, { cover: { key: "cover.jpg", alt: "" } }),
    );
    expect(pictured.fill).toEqual({ color: "#000000", text: "#ffffff" });
    const opacity = pictured.image?.opacity ?? 0;
    // White text over a white picture under the black overlay at that strength.
    const shade = Math.round(255 * (1 - opacity / 100));
    const worst = `#${shade.toString(16).padStart(2, "0").repeat(3)}`;
    expect(contrastOf("#ffffff", worst)).toBeGreaterThanOrEqual(4.4);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(100);
  });
});

describe("continue button look", () => {
  const gate = (variantSettings: Record<string, unknown>) =>
    course(undefined, {
      entries: [
        {
          ...lesson,
          blocks: [{ id: "bcontinue1", category: "divider", variant: "continue", variantSettings }],
        },
      ],
    });

  test("blocks-interactions 2.11: colour with contrast, width and corners are valid, with full width and automatic text by default", () => {
    const block = { category: "divider", variant: "continue", variantSettings: {} } as const;
    expect(variantSettings(block)).toMatchObject({ contrast: "auto", width: 100 });
    expect(
      validateCourse(gate({ color: "#2f6f9f", contrast: "light", width: 60, cornerRadius: 12 })),
    ).toEqual([]);
    const paths = (settings: Record<string, unknown>) =>
      validateCourse(gate(settings)).map((error) => error.path);
    expect(paths({ width: 10 })).toEqual(["/entries/0/blocks/0/variantSettings/width"]);
    expect(paths({ cornerRadius: 31 })).toEqual([
      "/entries/0/blocks/0/variantSettings/cornerRadius",
    ]);
    expect(paths({ color: "blue" })).toEqual(["/entries/0/blocks/0/variantSettings/color"]);
  });
});
