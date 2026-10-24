// Standard-neutral tracking core (STD-01, M1-07; standards.md §4.3 and §5): one status model and
// one write schedule, whatever the standard. An adapter per standard turns the calls below into
// its own API calls, handshake and wording; the core never talks to the network itself
// (standards.md rule 16).
import type { Interaction } from "@course-suite/format";
import {
  checkResume,
  type DecodeResult,
  decodeResume,
  encodeResume,
  type ResumeState,
  type ResumeWarning,
} from "./resume.js";

/** Did the learner finish. Kept apart from success in every standard (standards.md §4.3). */
export type Completion = "not-attempted" | "incomplete" | "completed" | "unknown";
/** Did the learner pass. */
export type Success = "unknown" | "passed" | "failed";

export interface Status {
  completion: Completion;
  success: Success;
  /** Scaled score is raw ÷ max (standards.md rule 12). */
  score?: { raw: number; min: number; max: number };
  /** Share of the course done, 0 to 1. */
  progress?: number;
}

/** `review` and `browse` write nothing (standards.md rule 15). */
export type Mode = "normal" | "review" | "browse";

/** What the LMS or LRS already holds when the course opens. */
export interface Launch {
  mode: Mode;
  status: Status;
  /** The stored resume payload. */
  resume?: string;
  /** The stored bookmark. */
  location?: string;
  language?: string;
  /** Time spent in earlier sessions, in milliseconds. */
  totalTimeMs?: number;
}

/**
 * One adapter per standard. Every method after `initialize` is synchronous so the player can still
 * save while the page is hidden (standards.md rule 9); an adapter that talks over the network queues
 * its own requests. A method throws when the LMS refused a call; the core reports the error and goes
 * on, so a refused save never stops the exit sequence (standards.md P-20).
 */
export interface TrackingAdapter {
  /** Opens the session with the standard's own launch handshake (standards.md rules 1 and 2). */
  initialize(): Launch | Promise<Launch>;
  writeResume(payload: string): void;
  writeLocation(location: string): void;
  /** Returns true when it wrote anything the standard stores; the core then commits it. */
  reportStatus(status: Status): boolean;
  /** `question` names the quiz and question by content id, for standards that report them as activities. */
  reportInteraction(interaction: Interaction, question?: QuestionRef): void;
  /**
   * What the learner does, not only the result, for standards that report it (xAPI, cmi5; standards.md
   * §4.4). Pages and quizzes are named by content id. SCORM adapters leave these out.
   */
  reportEntered?(page: string): void;
  reportLeft?(page: string): void;
  reportQuiz?(quiz: string, attempt: QuizAttempt): void;
  /** Time in this session so far, in milliseconds. */
  writeSessionTime(ms: number): void;
  /** `normal` when the learner reached the end, otherwise `suspend` (standards.md rule 8). */
  setExit(exit: "normal" | "suspend"): void;
  commit(): void;
  terminate(): void;
}

/** A question of a quiz, by content ids. */
export interface QuestionRef {
  quiz: string;
  question: string;
}

/** One scored quiz attempt. */
export interface QuizAttempt {
  /** Percent, 0 to 100. */
  score: number;
  passed: boolean;
}

/** Time and timers, injectable so tests control them. */
export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

// The tracking package has no DOM or Node typings; timers are global in both.
const timers = globalThis as unknown as {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

// No DOM or Node typings here either; the console is global in both.
const logError = (error: unknown) =>
  (globalThis as { console?: { error(error: unknown): void } }).console?.error(error);

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => timers.setTimeout(callback, ms),
  clearTimeout: (handle) => timers.clearTimeout(handle),
};

export interface TrackerOptions {
  adapter: TrackingAdapter;
  /** The version of the published package, kept with the resume state. */
  packageVersion: string;
  /** The target's resume cap in characters (`RESUME_CAPS`). */
  resumeCap: number;
  clock?: Clock;
  /** Wait after the last state change before writing it (standards.md rule 4). Default 500. */
  resumeDelayMs?: number;
  /** Interval for writing session time and committing (standards.md rule 5). Default 60,000. */
  saveIntervalMs?: number;
  /** Called when a state is saved without some parts, or not saved because it is over the cap. */
  onResumeWarning?: (warning: ResumeWarning) => void;
  /** Called when an adapter call after `initialize` throws. Default: the console. */
  onError?: (error: unknown) => void;
}

export interface Session {
  mode: Mode;
  status: Status;
  location?: string;
  language?: string;
  totalTimeMs?: number;
  /** The stored resume state. Prune ids a republish removed with `pruneResume`. */
  resume: DecodeResult;
}

export interface Tracker {
  /** Initializes the adapter and decodes the stored resume state. Call once. */
  start(): Promise<Session>;
  /** The current status. */
  readonly status: Status;
  /** Saves a new state shortly after the last change; an unchanged state is never written. */
  saveState(state: ResumeState): void;
  /** Writes the bookmark now. */
  setLocation(location: string): void;
  /** Reports a status change and commits it (standards.md rule 6). */
  report(change: Partial<Status>): void;
  /** Reports one answered question and commits it. */
  recordInteraction(interaction: Interaction, question?: QuestionRef): void;
  /** A page (lesson or quiz) opened, by content id. */
  entered(page: string): void;
  /** The page the learner was on closed. */
  left(page: string): void;
  /** A quiz attempt was scored. */
  quizScored(quiz: string, attempt: QuizAttempt): void;
  /**
   * Ends the session in the order of standards.md rule 7. Called while `start` is still pending, it
   * ends the session as soon as it opens. Later calls do nothing.
   */
  exit(reachedEnd: boolean): void;
}

export function createTracker(options: TrackerOptions): Tracker {
  const { adapter, clock = systemClock, resumeDelayMs = 500, saveIntervalMs = 60_000 } = options;
  let phase: "new" | "starting" | "open" | "closed" = "new";
  let writes = false;
  let startedAt = 0;
  let status: Status = { completion: "unknown", success: "unknown" };
  let written: string | undefined;
  let pending: ResumeState | undefined;
  let resumeTimer: unknown;
  let saveTimer: unknown;
  let exitRequest: boolean | undefined;

  const resumeOptions = { packageVersion: options.packageVersion, cap: options.resumeCap };

  const active = () => phase === "open" && writes;

  /** Runs one adapter call; an error is reported and the caller goes on. */
  const call = <T>(run: () => T): T | undefined => {
    try {
      return run();
    } catch (error) {
      (options.onError ?? logError)(error);
      return undefined;
    }
  };

  const sessionTime = () => clock.now() - startedAt;

  function scheduleSave() {
    saveTimer = clock.setTimeout(() => {
      call(() => adapter.writeSessionTime(sessionTime()));
      call(() => adapter.commit());
      scheduleSave();
    }, saveIntervalMs);
  }

  /** Writes the pending state if it differs from the stored one; true when it wrote. */
  function flush(): boolean {
    clock.clearTimeout(resumeTimer);
    const state = pending;
    pending = undefined;
    if (!state) return false;
    const encoded = encodeResume(state, resumeOptions);
    if (!encoded.ok || encoded.dropped.length > 0) {
      for (const warning of checkResume(state, resumeOptions)) options.onResumeWarning?.(warning);
    }
    if (!encoded.ok || encoded.payload === written) return false;
    // A refused write is still pending in the adapter, which sends it again before the next commit.
    call(() => adapter.writeResume(encoded.payload));
    written = encoded.payload;
    return true;
  }

  return {
    async start() {
      if (phase !== "new") throw new Error("The tracker has already started.");
      phase = "starting";
      const launch = await adapter.initialize();
      phase = "open";
      startedAt = clock.now();
      writes = launch.mode === "normal";
      status = launch.status;
      written = launch.resume;
      if (writes) scheduleSave();
      // A pagehide while the adapter was initializing: end the session now that it is open.
      if (exitRequest !== undefined) exit(exitRequest);
      const session: Session = {
        mode: launch.mode,
        status,
        resume: decodeResume(launch.resume ?? ""),
      };
      if (launch.location !== undefined) session.location = launch.location;
      if (launch.language !== undefined) session.language = launch.language;
      if (launch.totalTimeMs !== undefined) session.totalTimeMs = launch.totalTimeMs;
      return session;
    },

    get status() {
      return status;
    },

    saveState(state) {
      if (!active()) return;
      pending = state;
      clock.clearTimeout(resumeTimer);
      resumeTimer = clock.setTimeout(flush, resumeDelayMs);
    },

    setLocation(location) {
      if (active()) call(() => adapter.writeLocation(location));
    },

    report(change) {
      const next = { ...status, ...change };
      if (sameStatus(next, status)) return;
      status = next;
      if (!active()) return;
      if (call(() => adapter.reportStatus(status))) call(() => adapter.commit());
    },

    recordInteraction(interaction, question) {
      if (!active()) return;
      call(() => adapter.reportInteraction(interaction, question));
      call(() => adapter.commit());
    },

    entered(page) {
      if (active()) call(() => adapter.reportEntered?.(page));
    },

    left(page) {
      if (active()) call(() => adapter.reportLeft?.(page));
    },

    quizScored(quiz, attempt) {
      if (active()) call(() => adapter.reportQuiz?.(quiz, attempt));
    },

    exit,
  };

  function exit(reachedEnd: boolean) {
    if (phase === "starting") {
      exitRequest ??= reachedEnd;
      return;
    }
    if (phase !== "open") return;
    phase = "closed";
    clock.clearTimeout(saveTimer);
    if (!writes) {
      clock.clearTimeout(resumeTimer);
      call(() => adapter.terminate());
      return;
    }
    // Finishing with no status set marks the course completed (standards.md rule 13).
    if (reachedEnd && status.completion !== "completed" && status.success === "unknown") {
      status = { ...status, completion: "completed" };
      call(() => adapter.reportStatus(status));
    }
    if (flush()) call(() => adapter.commit());
    call(() => adapter.writeSessionTime(sessionTime()));
    call(() => adapter.setExit(reachedEnd ? "normal" : "suspend"));
    call(() => adapter.commit());
    call(() => adapter.terminate());
  }
}

function sameStatus(a: Status, b: Status): boolean {
  return (
    a.completion === b.completion &&
    a.success === b.success &&
    a.progress === b.progress &&
    a.score?.raw === b.score?.raw &&
    a.score?.min === b.score?.min &&
    a.score?.max === b.score?.max
  );
}
