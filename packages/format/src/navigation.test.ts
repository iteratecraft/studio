// M2-16 (BLK-08): the navigation settings and the rules that tie them together, and the continue
// block's own look.
import { describe, expect, test } from "vitest";
import type { Course, LessonEntry, QuizEntry } from "./course.js";
import {
  hasSearch,
  isRestricted,
  isStepped,
  menuOf,
  pageButtonsOf,
  searchBlocked,
  skipAheadQuiz,
} from "./navigation.js";
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
