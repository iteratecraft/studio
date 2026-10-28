// Player lifecycle (ENG-06a, M1-13): the player's events, its saved state and its completion model,
// wired to the tracking core with the Blocks profile (rise.md rules 2-8; standards.md §5 rules 3-9
// and 17). No DOM: the shell calls it, so tests run it under a fake clock.
import type { Course, Question, QuizEntry, Response } from "@course-suite/format";
import { isPassed, toInteraction } from "@course-suite/format";
import {
  type Clock,
  createTracker,
  pruneResume,
  type ResumeState,
  type Status,
  type TrackingAdapter,
} from "@course-suite/tracking";
import { createProgress, type Progress } from "./progress.js";
import { type Page, pageHash, parseRoute } from "./route.js";

/** Blocks profile: write the saved state about 100 ms after the last change (rise.md rule 3). */
export const RESUME_DELAY_MS = 100;
/** Blocks profile: write the session time and commit every 20 seconds (rise.md rule 4). */
export const COMMIT_INTERVAL_MS = 20_000;

/** What happened in the player, in order. Adapters and the preview listen to these. */
export type PlayerEvent =
  | { type: "started" }
  | { type: "page-entered"; page: string }
  | { type: "page-left"; page: string }
  | { type: "quiz-submitted"; quiz: string; score: number; passed: boolean }
  | { type: "quiz-retried"; quiz: string }
  | { type: "course-finished" }
  | { type: "exit"; reachedEnd: boolean }
  | { type: "page-hide"; reachedEnd: boolean }
  /** Saving failed or the state no longer fits the target: the player shows a notice. */
  | { type: "save-failed" };

/** An event with its time in milliseconds since the epoch. */
export type TimedEvent = PlayerEvent & { at: number };

export interface RuntimeOptions {
  course: Course;
  adapter: TrackingAdapter;
  /** The published package's version, kept with the saved state (rise.md rule 12). */
  packageVersion: string;
  /** The target's resume cap in characters (`RESUME_CAPS`). */
  resumeCap: number;
  clock?: Clock;
}

export interface Runtime {
  readonly progress: Progress;
  /** The page the learner was on last time, when the course still has it. */
  readonly resumeAt: Page | undefined;
  /** Saving has failed in this session. */
  readonly saveFailed: boolean;
  /** The session is over: the learner left or the page was hidden. */
  readonly ended: boolean;
  on(listener: (event: TimedEvent) => void): () => void;
  /** The start button, or the first page opened: reports the course as started (standards.md rule 3). */
  begin(): void;
  /** A page opened: the bookmark (rise.md rule 2), its viewed blocks and the saved state. */
  enter(page: Page): void;
  /** Progress changed: saves the state (rise.md rule 3) and reports the status (rules 5-8). */
  changed(): void;
  /** A quiz question was submitted: one interaction (rules 10 and 11). */
  answered(quiz: QuizEntry, question: Question, response: Response | undefined): void;
  quizSubmitted(quiz: QuizEntry, score: number): void;
  quizRetried(quiz: QuizEntry): void;
  /** The exit link or page-hide: ends the session (standards.md rules 7-9). Later calls do nothing. */
  exit(reason: "exit" | "page-hide"): void;
}

/** Opens the tracking session, restores the saved state and returns the running player state. */
export async function startRuntime(options: RuntimeOptions): Promise<Runtime> {
  const { course } = options;
  const listeners = new Set<(event: TimedEvent) => void>();
  const now = () => options.clock?.now() ?? Date.now();
  const emit = (event: PlayerEvent) => {
    for (const listener of [...listeners]) listener({ ...event, at: now() });
  };
  let saveFailed = false;
  const failed = (error?: unknown) => {
    if (error !== undefined) console.error(error);
    if (saveFailed) return;
    saveFailed = true;
    emit({ type: "save-failed" });
  };
  // An LMS call that throws must not stop the course; the learner gets a notice instead.
  const safely = (call: () => void) => {
    try {
      call();
    } catch (error) {
      failed(error);
    }
  };

  const tracker = createTracker({
    adapter: options.adapter,
    packageVersion: options.packageVersion,
    resumeCap: options.resumeCap,
    resumeDelayMs: RESUME_DELAY_MS,
    saveIntervalMs: COMMIT_INTERVAL_MS,
    ...(options.clock ? { clock: options.clock } : {}),
    onResumeWarning: (warning) => {
      if (warning.code === "over-cap") failed();
    },
    // The LMS refused a call: the adapter retries at the next commit; the learner gets a notice.
    onError: failed,
  });

  let saved: ResumeState = {};
  let bookmark: string | undefined;
  try {
    const session = await tracker.start();
    // Reset on update (rise.md rule 12, UI-PUBCOLLAB-R16): progress saved by another version of
    // the package starts again, bookmark included; quiz results stay (blocks-publish-collab.md 2.2).
    const reset =
      course.publish?.resetOnUpdate === true &&
      session.resume.status === "ok" &&
      session.resume.packageVersion !== options.packageVersion;
    if (session.resume.status === "ok") {
      const ids = idsOf(course);
      const state = session.resume.state;
      saved = pruneResume(
        reset ? (state.attempts ? { attempts: state.attempts } : {}) : state,
        (id) => ids.has(id),
      );
    }
    if (!reset) bookmark = session.location;
  } catch (error) {
    failed(error);
  }

  const progress = createProgress(course, saved);
  const fromBookmark = bookmark === undefined ? undefined : parseRoute(bookmark, progress.pages);
  const resumeAt =
    fromBookmark?.kind === "page"
      ? fromBookmark.page
      : progress.pages.find((page) => page.id === saved.location);

  let begun = false;
  let current: Page | undefined;
  let ended = false;
  let finished = courseStatus(course, progress).completion === "completed";

  function report() {
    if (!begun) return;
    const status = courseStatus(course, progress);
    // What the LMS already holds is never taken back (rise.md rule 7).
    if (tracker.status.completion === "completed") delete status.completion;
    if (tracker.status.success === "passed") delete status.success;
    safely(() => tracker.report(status));
    if (!finished && status.completion === "completed") {
      finished = true;
      emit({ type: "course-finished" });
    }
  }

  function changed() {
    const state = progress.snapshot();
    safely(() => tracker.saveState(current ? { ...state, location: current.id } : state));
    report();
  }

  function leave(page: Page) {
    emit({ type: "page-left", page: page.id });
    safely(() => tracker.left(page.id));
  }

  function begin() {
    if (begun || ended) return;
    begun = true;
    emit({ type: "started" });
    report();
  }

  return {
    progress,
    resumeAt,
    get saveFailed() {
      return saveFailed;
    },
    get ended() {
      return ended;
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    begin,

    enter(page) {
      if (ended) return;
      begin();
      const same = current === page;
      if (current && !same) leave(current);
      current = page;
      emit({ type: "page-entered", page: page.id });
      safely(() => tracker.setLocation(pageHash(page.id)));
      if (!same) safely(() => tracker.entered(page.id));
      // A locked page opened by its address shows, but its blocks do not count (UI-BLOCKS-R26).
      if (!progress.lockedBy(page)) progress.view(page);
      changed();
    },

    changed,

    answered(quiz, question, response) {
      const attempt = progress.quiz(quiz).scores.length + 1;
      safely(() =>
        tracker.recordInteraction(toInteraction(quiz.title, question, response, attempt), {
          quiz: quiz.id,
          question: question.id,
        }),
      );
    },

    quizSubmitted(quiz, score) {
      emit({ type: "quiz-submitted", quiz: quiz.id, score, passed: progress.quiz(quiz).passed });
      safely(() => tracker.quizScored(quiz.id, { score, passed: isPassed(score, quiz.settings) }));
      changed();
    },

    quizRetried(quiz) {
      emit({ type: "quiz-retried", quiz: quiz.id });
      changed();
    },

    exit(reason) {
      if (ended) return;
      changed();
      ended = true;
      const reachedEnd = progress.courseDone();
      if (current) leave(current);
      emit({ type: reason, reachedEnd });
      safely(() => tracker.exit(reachedEnd));
    },
  };
}

/**
 * The status to report (rise.md rules 5-8): course progress; completion by the completion rule, or
 * by one quiz's best score when the author tracks a quiz; the author's wording pair decides whether
 * success is reported too.
 */
export function courseStatus(course: Course, progress: Progress): Partial<Status> {
  const share = progress.coursePercent() / 100;
  const wording = course.publish?.statusWording;
  const tracking = course.publish?.tracking;
  if (tracking?.kind === "quiz") {
    const quiz = progress.pages.find(
      (page): page is QuizEntry => page.kind === "quiz" && page.id === tracking.quiz,
    );
    const state = quiz && progress.quiz(quiz);
    if (!state || state.scores.length === 0) return { completion: "incomplete", progress: share };
    const score = { raw: state.best, min: 0, max: 100 };
    if (state.passed) return { completion: "completed", success: "passed", score, progress: share };
    return wording?.notDone === "failed"
      ? { completion: "incomplete", success: "failed", score, progress: share }
      : { completion: "incomplete", score, progress: share };
  }
  // The threshold counts whole lessons: the course completes with the lesson that reaches it
  // (rise.md rule 6, UI-PUBCOLLAB-R20).
  const threshold = tracking?.kind === "completion" ? (tracking.threshold ?? 100) : 100;
  const done = threshold < 100 ? progress.coursePercent() >= threshold : progress.courseDone();
  if (!done) return { completion: "incomplete", progress: share };
  return wording?.done === "passed"
    ? { completion: "completed", success: "passed", progress: share }
    : { completion: "completed", progress: share };
}

/** Every content id in the course, so saved state for removed content is dropped. */
function idsOf(course: Course): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "id" && typeof child === "string") ids.add(child);
        else if (key !== "ext") walk(child);
      }
    }
  };
  walk(course.entries);
  return ids;
}
