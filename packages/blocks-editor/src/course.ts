// New course documents and their file names (blocks-editor.md W1, W2; D-33).
import type { Course } from "@course-suite/format";
import { courseSchema, newContentId, newProjectId, SCHEMA_VERSION } from "@course-suite/format";
import { PROJECT_EXTENSION } from "@course-suite/project";

/** UI-BLOCKS-EDITOR-R13: a course title holds up to 100 characters. */
export const TITLE_MAX = 100;

/** rise.md 3L: a course's source language is US English unless the author sets another. */
export const DEFAULT_LANGUAGE = "en-US";

/** The course format's own rule for a language tag. */
const LANGUAGE = new RegExp(
  (courseSchema.$defs as Record<string, { pattern: string }>).Language?.pattern ?? "$^",
);

/**
 * The language code the author typed, in its canonical BCP 47 form (`fr-ca` gives `fr-CA`), or
 * undefined when it is not one the course format takes (BLK-01 course details).
 */
export function languageCode(text: string): string | undefined {
  try {
    const [code] = Intl.getCanonicalLocales(text.trim());
    return code !== undefined && LANGUAGE.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A blank course: an empty outline (W1). A blank microlearning: its one lesson, empty (W2,
 * rise.md 3A). The source language defaults to US English (rise.md 3L).
 */
export function blankCourse(kind: Course["kind"], title: string, now = new Date()): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newProjectId(),
    kind,
    title,
    sourceLanguage: DEFAULT_LANGUAGE,
    entries:
      kind === "microlearning" ? [{ id: newContentId(), kind: "lesson", title, blocks: [] }] : [],
    media: [],
    createdAt: now.toISOString(),
  };
}

/**
 * The file name to suggest for a course: its title without the characters Windows forbids in a
 * name (and no trailing dot or space, which Windows drops), then `.crs` (D-33).
 */
export function fileNameFor(title: string, fallback: string): string {
  const name = Array.from(title, (c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "-" : c))
    .join("")
    .trim()
    .replace(/[. ]+$/, "");
  return `${name || fallback}${PROJECT_EXTENSION}`;
}

/** The title to show: the course's own, or a stand-in while it has none. */
export const shownTitle = (title: string, untitled: string) => title.trim() || untitled;
