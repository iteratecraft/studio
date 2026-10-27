// How learners move through a course (M2-16, BLK-08; rise.md 3F, rules 14 and 17;
// blocks-editor.md 2.18 navigation): the settings the player follows and the editor offers, with the
// rules that tie them together, so both read them the same way.
import type { Course, MediaRef, QuizEntry } from "./course.js";
import { mix, overlayFloor, textColor, themeColors } from "./theme.js";

export type Navigation = NonNullable<Course["navigation"]>;

/** The first quiz with skip-ahead, which forces restricted navigation on (rule 14). */
export const skipAheadQuiz = (course: Course): QuizEntry | undefined =>
  course.entries.find(
    (entry): entry is QuizEntry => entry.kind === "quiz" && entry.settings?.skipAhead !== undefined,
  );

/** Lessons open only in order: the author's choice, or forced by a quiz with skip-ahead (rule 14). */
export const isRestricted = (course: Course): boolean =>
  course.navigation?.restricted === true || skipAheadQuiz(course) !== undefined;

/** A microlearning has no menu; it scrolls, or shows one step at a time (rise.md 3A, 3F). */
export const isStepped = (course: Course): boolean =>
  course.kind === "microlearning" && course.navigation?.steps === true;

/** Which course menu learners get: none for a microlearning or with navigation off. */
export function menuOf(course: Course): "sidebar" | "compact" | "overlay" | undefined {
  if (course.kind === "microlearning" || course.navigation?.off === true) return undefined;
  return course.navigation?.menu ?? "sidebar";
}

/**
 * Why course search is unavailable: there is no sidebar (another menu, or navigation off), or
 * navigation is restricted (rise.md 3F, rule 14); undefined when it is available.
 */
export function searchBlocked(course: Course): "no-sidebar" | "restricted" | undefined {
  if (menuOf(course) !== "sidebar") return "no-sidebar";
  return isRestricted(course) ? "restricted" : undefined;
}

/** Learners can search the course: the author's switch, where search is available. */
export const hasSearch = (course: Course): boolean =>
  course.navigation?.search !== false && searchBlocked(course) === undefined;

/**
 * Where the previous and next lesson buttons go: none for a microlearning (one lesson) or when the
 * author turned them off (branching courses, rise.md 3F).
 */
export function pageButtonsOf(
  course: Course,
): Exclude<Navigation["pageButtons"], "off" | undefined> | undefined {
  const placement = course.navigation?.pageButtons ?? "full-width";
  return course.kind === "microlearning" || placement === "off" ? undefined : placement;
}

export type MenuStyle = NonNullable<Navigation["menuStyle"]>;

/** The dark menu, the same dark as the dark lesson buttons. */
export const DARK_MENU = "#2b3038";

/**
 * How the menu and the compact card look (blocks-editor.md 2.18 menu colour style). Light and gray
 * keep the player's own colours, which keep their ratios on both. Every other style fills them with
 * a colour of its own and draws all their text in black or white, whichever reads better on it
 * (4.5:1 or more; the theme's contrast setting is not applied here, so the menu stays readable).
 * An image style lays the course's cover picture under its overlay, strong enough to keep 4.5:1
 * over any picture; without a cover picture it is the overlay colour alone.
 */
export interface MenuLook {
  style: MenuStyle;
  fill?: { color: string; text: string };
  image?: { ref: MediaRef; opacity: number };
}

export function menuLook(course: Course): MenuLook {
  const style = course.navigation?.menuStyle ?? "light";
  const colors = themeColors(course.theme);
  const filled = (color: string): MenuLook => ({ style, fill: { color, text: textColor(color) } });
  switch (style) {
    case "light":
    case "gray":
      return { style };
    case "theme":
      return filled(colors.theme);
    case "tint":
      return filled(colors.tint);
    case "dark":
      return filled(DARK_MENU);
    case "dark-theme":
      return filled(mix(colors.theme, "#000000", 0.55));
    case "image-light":
    case "image-dark": {
      const look = filled(style === "image-light" ? "#ffffff" : "#000000");
      const fill = look.fill as { color: string; text: string };
      const ref = course.cover;
      if (!ref) return look;
      return { ...look, image: { ref, opacity: overlayFloor(fill.color, fill.text) ?? 100 } };
    }
  }
}
