// SCORM 1.2 run-time adapter (STD-04, M1-19; standards.md §3.6 P-3, §3.7, §4.1 and §5; rise.md rules
// 1 to 4): finds the LMS's `API` object and turns the tracking core's calls into SCORM 1.2 calls in
// the order LMSs expect. The core decides when to write; this decides what each write looks like.
import type { Interaction } from "@course-suite/format";
import { cut, findApi, type ScormWindow, scormWriter } from "./scorm.js";
import type { Launch, Mode, Status, TrackingAdapter } from "./tracker.js";

/** The SCORM 1.2 run-time API an LMS puts on a window as `API`. Every value is a string. */
export interface Scorm12Api {
  LMSInitialize(arg: ""): string;
  LMSFinish(arg: ""): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(arg: ""): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
}

/**
 * The LMS's SCORM 1.2 API: on the window or one of its parents, then on the window that opened it
 * or one of that window's parents (standards.md P-3). Undefined when there is none.
 */
export const findScorm12Api = (win: ScormWindow): Scorm12Api | undefined =>
  findApi(win, "API", isApi);

const isApi = (value: unknown): value is Scorm12Api =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<Scorm12Api>).LMSInitialize === "function" &&
  typeof (value as Partial<Scorm12Api>).LMSSetValue === "function";

export interface Scorm12AdapterOptions {
  /**
   * Blocks output also writes the bookmark to `cmi.core.lesson_location` and reads it back at
   * launch; slide output keeps the position only in the suspend data (standards.md rule 17).
   * Default true.
   */
  bookmark?: boolean;
}

/** SCORM 1.2 caps CMIString255 values (standards.md §4.2). */
const MAX_TEXT = 255;

/**
 * The SCORM 1.2 adapter. A refused write is kept and sent again before the next commit, and the
 * method throws a `ScormError` once its other writes are done, so the core reports it and goes on
 * (standards.md P-20).
 */
export function createScorm12Adapter(
  api: Scorm12Api,
  options: Scorm12AdapterOptions = {},
): TrackingAdapter {
  const bookmark = options.bookmark ?? true;
  const writer = scormWriter({
    setName: "LMSSetValue",
    setValue: (element, value) => api.LMSSetValue(element, value),
    lastError: () => api.LMSGetLastError(),
    errorString: (code) => api.LMSGetErrorString(code),
  });
  const { set, raise } = writer;
  let sentStatus: string | undefined;
  let sentScore: string | undefined;
  let interactions: number | undefined;

  const get = (element: string) => api.LMSGetValue(element);

  return {
    initialize(): Launch {
      if (api.LMSInitialize("") !== "true") throw writer.error("LMSInitialize");
      // Launch order of standards.md rule 2 and rise.md rule 1. Review mode writes nothing (rule 15).
      const mode = toMode(get("cmi.core.lesson_mode"));
      if (mode === "browse") set("cmi.core.lesson_status", "browsed");
      let lmsStatus = get("cmi.core.lesson_status");
      if (mode !== "review") {
        if (lmsStatus === "not attempted") {
          set("cmi.core.lesson_status", "incomplete");
          lmsStatus = "incomplete";
        }
        set("cmi.core.exit", "suspend");
      }
      const launch: Launch = { mode, status: toStatus(lmsStatus) };
      const resume = get("cmi.suspend_data");
      if (resume) launch.resume = resume;
      if (bookmark) {
        const location = get("cmi.core.lesson_location");
        if (location) launch.location = location;
      }
      // A refused launch write stays queued and is sent again at the first commit, which reports it.
      writer.forget();
      return launch;
    },

    writeResume(payload) {
      set("cmi.suspend_data", payload);
      raise();
    },

    writeLocation(location) {
      if (!bookmark) return;
      set("cmi.core.lesson_location", cut(location, MAX_TEXT));
      raise();
    },

    reportStatus(status) {
      let wrote = false;
      // Score raw 0 to 100 with min 0 and max 100, sent only when it changes (standards.md P-11).
      if (status.score) {
        const raw = String(status.score.raw);
        if (raw !== sentScore) {
          set("cmi.core.score.raw", raw);
          set("cmi.core.score.min", String(status.score.min));
          set("cmi.core.score.max", String(status.score.max));
          sentScore = raw;
          wrote = true;
        }
      }
      // One status word, one-to-one with ours (standards.md rule 11). Progress has no 1.2 element.
      const word = toWord(status);
      if (word && word !== sentStatus) {
        set("cmi.core.lesson_status", word === "passed" ? "completed" : word); // REVIEW PROBE: deliberately broken
        sentStatus = word;
        wrote = true;
      }
      raise();
      return wrote;
    },

    reportInteraction(interaction) {
      // Appended after the interactions earlier sessions wrote.
      interactions ??= Number.parseInt(get("cmi.interactions._count"), 10) || 0;
      const n = `cmi.interactions.${interactions++}`;
      set(`${n}.id`, interaction.id);
      set(`${n}.type`, interaction.type);
      set(`${n}.weighting`, String(interaction.weighting));
      set(
        `${n}.student_response`,
        cut(responseText(interaction.type, interaction.response), MAX_TEXT),
      );
      set(`${n}.result`, interaction.result === "correct" ? "correct" : "wrong");
      patterns(interaction).forEach((pattern, i) => {
        set(`${n}.correct_responses.${i}.pattern`, cut(pattern, MAX_TEXT));
      });
      raise();
    },

    writeSessionTime(ms) {
      set("cmi.core.session_time", timespan(ms));
      raise();
    },

    setExit(exit) {
      // "" when the learner reached the end, otherwise suspend (standards.md rule 8).
      set("cmi.core.exit", exit === "normal" ? "" : "suspend");
      raise();
    },

    commit() {
      // Writes the LMS refused before go again first (standards.md P-20).
      writer.retry();
      if (api.LMSCommit("") !== "true") writer.refused("LMSCommit");
      raise();
    },

    terminate() {
      if (api.LMSFinish("") !== "true") throw writer.error("LMSFinish");
    },
  };
}

function toMode(value: string): Mode {
  return value === "review" || value === "browse" ? value : "normal";
}

function toStatus(word: string): Status {
  switch (word) {
    case "passed":
      return { completion: "completed", success: "passed" };
    case "failed":
      return { completion: "incomplete", success: "failed" };
    case "completed":
      return { completion: "completed", success: "unknown" };
    case "incomplete":
    case "browsed":
      return { completion: "incomplete", success: "unknown" };
    case "not attempted":
      return { completion: "not-attempted", success: "unknown" };
    default:
      return { completion: "unknown", success: "unknown" };
  }
}

function toWord(status: Status): string | undefined {
  if (status.success !== "unknown") return status.success;
  if (status.completion === "completed" || status.completion === "incomplete") {
    return status.completion;
  }
  return undefined;
}

/** CMITimespan HHHH:MM:SS.SS (standards.md §4.1). */
export function timespan(ms: number): string {
  const centis = Math.min(Math.max(0, Math.round(ms / 10)), 9999 * 360_000 + 359_999);
  const pad = (value: number, size: number) => String(value).padStart(size, "0");
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor(centis / 6_000) % 60;
  const seconds = Math.floor(centis / 100) % 60;
  return `${pad(hours, 4)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centis % 100, 2)}`;
}

/** SCORM 1.2 response text: choices and accepted answers by commas, matching pairs as `a.b`. */
function responseText(type: Interaction["type"], response: Interaction["response"]): string {
  if (typeof response === "string") return response;
  if (type === "matching") {
    return (response as [string, string][]).map((pair) => pair.join(".")).join(",");
  }
  return (response as string[]).join(",");
}

function patterns(interaction: Interaction): string[] {
  // Each accepted answer of a fill-in is a correct pattern of its own.
  if (interaction.type === "fill-in") return interaction.correctResponse;
  return [responseText(interaction.type, interaction.correctResponse)];
}
