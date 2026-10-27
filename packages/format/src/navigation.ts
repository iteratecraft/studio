// How learners move through a course (M2-16, BLK-08; rise.md 3F, rules 14 and 17;
// blocks-editor.md 2.18 navigation): the settings the player follows and the editor offers, with the
// rules that tie them together, so both read them the same way.
import type { Course, QuizEntry } from "./course.js";

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
export function pageButtonsOf(course: Course): "full-width" | "floating" | undefined {
  const placement = course.navigation?.pageButtons ?? "full-width";
  return course.kind === "microlearning" || placement === "off" ? undefined : placement;
}
