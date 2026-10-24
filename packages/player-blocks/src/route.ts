// Lesson addresses (rise.md §3 B): the cover page has the root address and every lesson and quiz has
// its own, built from its stable id, so a link to a lesson survives republishing. Addresses live in
// the URL fragment, which works from disk, on any static host and inside an LMS frame.
import type { Course, LessonEntry, QuizEntry } from "@course-suite/format";

/** An entry the learner can open: a lesson or a quiz. Section headers hold no blocks. */
export type Page = LessonEntry | QuizEntry;

export type Route =
  | { kind: "cover" }
  | { kind: "page"; page: Page; index: number }
  /** An address that names no page of this course, for example a lesson removed by an update. */
  | { kind: "unknown" };

export const COVER_HASH = "#/";
export const pageHash = (id: string) => `#/lessons/${encodeURIComponent(id)}`;

export const pagesOf = (course: Course): Page[] =>
  course.entries.filter((entry): entry is Page => entry.kind !== "section");

export function parseRoute(hash: string, pages: readonly Page[]): Route {
  if (hash === "" || hash === "#" || hash === COVER_HASH) return { kind: "cover" };
  const match = /^#\/lessons\/([^/]+)$/.exec(hash);
  const id = match?.[1] === undefined ? undefined : safeDecode(match[1]);
  const index = pages.findIndex((page) => page.id === id);
  const page = pages[index];
  return page ? { kind: "page", page, index } : { kind: "unknown" };
}

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
};

/**
 * "Lesson n of m": quizzes the author left out of the lesson count are not counted and get no
 * number (rise.md §3 I).
 */
export function lessonNumber(
  pages: readonly Page[],
  page: Page,
): { current: number; total: number } | undefined {
  const counted = pages.filter((p) => p.kind === "lesson" || p.settings?.countAsLesson !== false);
  const current = counted.indexOf(page) + 1;
  return current > 0 ? { current, total: counted.length } : undefined;
}
