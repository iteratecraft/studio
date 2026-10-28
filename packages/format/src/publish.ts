// Publish settings (M2-18, BLK-10, STD-08; blocks-publish-collab.md 2.1 to 2.3, A9 to A13; rise.md 3M,
// rules 6, 7, 12): the defaults the publish panel starts from, the settings a course is exported
// with, what makes them incoherent, and the checks run before an export. The panel, the conformance
// tests and the Moodle job all read these, so a package built from the panel's settings is the one
// they test.
import type { Course, PublishSettings, QuizEntry } from "./course.js";
import { DEFAULT_PASSING_SCORE } from "./quiz.js";

export type Standard = PublishSettings["standard"];

/** The outputs the panel offers, in its order: the four LMS standards, then web (D1, rise.md 3M). */
export const STANDARDS: readonly Standard[] = ["scorm12", "scorm2004", "xapi", "cmi5", "web"];

/**
 * What the panel starts from (blocks-publish-collab.md 2.1, 2.2): SCORM 1.2, completion by lessons
 * viewed at 100 %, passed/incomplete wording, no exit link, LMS-only launch on, no reset on update.
 * The usage-data switch of the spec is left out: our packages send nothing (ADR-0004, R59).
 */
export const PUBLISH_DEFAULTS = {
  standard: "scorm12",
  statusWording: { done: "passed", notDone: "incomplete" },
  tracking: { kind: "completion" },
  exitLink: false,
  lmsOnly: true,
  resetOnUpdate: false,
} as const satisfies PublishSettings;

/** The quizzes of a course, in outline order: the ones tracking may follow (courses only, D1). */
export const quizzesOf = (course: Course): QuizEntry[] =>
  course.kind === "microlearning"
    ? []
    : course.entries.filter((entry): entry is QuizEntry => entry.kind === "quiz");

/**
 * The settings a course is published with: its saved ones over the defaults. Tracking that names a
 * quiz the course no longer has falls back to completion; a microlearning, which has no quiz and so
 * cannot fail, gets a wording that never reports failed (rise.md 3M, rule 16).
 */
export function publishSettingsOf(course: Course): PublishSettings {
  const saved = course.publish;
  const settings: PublishSettings = { ...PUBLISH_DEFAULTS, ...saved };
  const tracking = settings.tracking;
  if (tracking?.kind === "quiz" && !quizzesOf(course).some((quiz) => quiz.id === tracking.quiz)) {
    settings.tracking = { kind: "completion" };
  }
  if (course.kind === "microlearning" && settings.statusWording?.notDone === "failed") {
    settings.statusWording = { ...settings.statusWording, notDone: "incomplete" };
  }
  return settings;
}

/** The quiz whose result decides completion and score, when tracking follows one. */
export function trackedQuiz(course: Course, settings = publishSettingsOf(course)) {
  const tracking = settings.tracking;
  return tracking?.kind === "quiz"
    ? quizzesOf(course).find((quiz) => quiz.id === tracking.quiz)
    : undefined;
}

/**
 * The settings to export with: those of `publishSettingsOf`, the passing score taken from the
 * tracked quiz, so the manifest's mastery score and the quiz agree (standards.md E-5, C-4), and the
 * package version one above the last export.
 */
export function exportSettingsOf(course: Course): PublishSettings & { packageVersion: number } {
  const { passingScore: _, ...settings } = publishSettingsOf(course);
  const quiz = trackedQuiz(course, settings);
  return {
    ...settings,
    ...(quiz && { passingScore: quiz.settings?.passingScore ?? DEFAULT_PASSING_SCORE }),
    packageVersion: (course.publish?.packageVersion ?? 0) + 1,
  };
}

/** The manifest identifier a SCORM package gets when the author sets none (stable per course). */
export const defaultManifestIdentifier = (course: Course) => `course-${course.id}`;

/** The activity id an xAPI or cmi5 package gets when the author sets none (stable per course). */
export const defaultActivityId = (course: Course) => `urn:uuid:${course.id}`;

const MANIFEST_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]{0,199}$/;
// An absolute IRI of URL-safe characters only (no spaces, quotes or angle brackets), short enough
// for every LMS (D1 "no special characters"; xAPI 1.0.3 part 2, 4.1.4.1).
const ACTIVITY_ID = /^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;

/** Whether `value` can be the package identifier of a package for `standard`. */
export function isPackageIdentifier(standard: Standard, value: string): boolean {
  if (standard === "xapi" || standard === "cmi5") {
    return value.length <= 2048 && ACTIVITY_ID.test(value);
  }
  return MANIFEST_IDENTIFIER.test(value);
}

/** A choice the publish settings cannot export with, by the setting it belongs to. */
export type PublishProblem =
  /** cmi5 move-on waits for a pass, but no quiz decides one (STD-08 "incoherent choices"). */
  | { setting: "moveOn"; code: "no-quiz" }
  /** The identifier the settings hold is not one the standard accepts. */
  | { setting: "identifier"; code: "invalid" };

/** What stops `course` from being exported with its publish settings. */
export function publishProblems(course: Course): PublishProblem[] {
  const settings = publishSettingsOf(course);
  const problems: PublishProblem[] = [];
  const { standard } = settings;
  const identifier =
    standard === "xapi" || standard === "cmi5" ? settings.activityId : settings.manifestIdentifier;
  if (
    standard !== "web" &&
    identifier !== undefined &&
    !isPackageIdentifier(standard, identifier)
  ) {
    problems.push({ setting: "identifier", code: "invalid" });
  }
  const passes = settings.moveOn === "Passed" || settings.moveOn === "CompletedAndPassed";
  if (standard === "cmi5" && passes && !trackedQuiz(course, settings)) {
    problems.push({ setting: "moveOn", code: "no-quiz" });
  }
  return problems;
}

/**
 * Something to look at before exporting (blocks-publish-collab.md A13, UI-PUBCOLLAB-R2; BLK-10
 * "pre-export checks"): a lesson or quiz with nothing in it, a link to a lesson or block the course
 * no longer has, or a picture with neither alt text nor the decorative mark. `entry` is where it is.
 */
export type CourseCheck =
  | { code: "empty"; entry: string }
  | { code: "broken-link"; entry: string; target: string }
  | { code: "no-alt"; entry: string; key: string };

const LESSON_LINK = /#\/lessons\/([^/?#\s"'<>]+)(?:\/([^/?#\s"'<>]+))?/g;

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/** The pre-export checks of `course`, in outline order. */
export function courseChecks(course: Course): CourseCheck[] {
  const pages = new Map(
    course.entries.flatMap((entry) => (entry.kind === "section" ? [] : [[entry.id, entry]])),
  );
  const images = new Set(
    course.media.filter((media) => media.mimeType?.startsWith("image/")).map((media) => media.key),
  );
  const checks: CourseCheck[] = [];
  for (const entry of pages.values()) {
    const empty = entry.kind === "quiz" ? entry.questions.length === 0 : entry.blocks.length === 0;
    if (empty) checks.push({ code: "empty", entry: entry.id });
    walk(entry, (value, key) => {
      if (typeof value === "string" && key !== "id") {
        for (const [link, page, block] of value.matchAll(LESSON_LINK)) {
          const target = pages.get(decode(page as string));
          const found =
            target &&
            (block === undefined ||
              (target.kind === "lesson" && target.blocks.some((b) => b.id === decode(block))));
          if (!found) checks.push({ code: "broken-link", entry: entry.id, target: link });
        }
      } else if (isMediaRef(value) && images.has(value.key) && value.alt === undefined) {
        checks.push({ code: "no-alt", entry: entry.id, key: value.key });
      }
    });
  }
  return checks;
}

const isMediaRef = (value: unknown): value is { key: string; alt?: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { key?: unknown }).key === "string";

/** Calls `visit` on every value under `value` (not inside `ext` data), with its property name. */
function walk(value: unknown, visit: (value: unknown, key?: string) => void, key?: string): void {
  visit(value, key);
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (typeof value === "object" && value !== null) {
    for (const [name, item] of Object.entries(value)) if (name !== "ext") walk(item, visit, name);
  }
}
