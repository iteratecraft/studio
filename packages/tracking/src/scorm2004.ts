// SCORM 2004 4th edition run-time adapter (STD-05, M1-23; standards.md §3.6 P-3, §3.7, §4.1, §4.2
// and §5 rules 1, 3, 7-10, 12, 15, 17): finds the LMS's `API_1484_11` object and turns the tracking
// core's calls into SCORM 2004 calls, keeping completion and success apart. The core decides when
// to write; this decides what each write looks like.
import type { Interaction } from "@course-suite/format";
import { cut, findApi, type ScormWindow, scormWriter } from "./scorm.js";
import type { Completion, Launch, Mode, Success, TrackingAdapter } from "./tracker.js";

/** The SCORM 2004 run-time API an LMS puts on a window as `API_1484_11`. Every value is a string. */
export interface Scorm2004Api {
  Initialize(arg: ""): string;
  Terminate(arg: ""): string;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string;
  Commit(arg: ""): string;
  GetLastError(): string;
  GetErrorString(code: string): string;
}

/**
 * The LMS's SCORM 2004 API: on the window or one of its parents, then on the window that opened it
 * or one of that window's parents (standards.md P-3). Undefined when there is none.
 */
export const findScorm2004Api = (win: ScormWindow): Scorm2004Api | undefined =>
  findApi(win, "API_1484_11", isApi);

const isApi = (value: unknown): value is Scorm2004Api =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<Scorm2004Api>).Initialize === "function" &&
  typeof (value as Partial<Scorm2004Api>).SetValue === "function";

export interface Scorm2004AdapterOptions {
  /**
   * Blocks output also writes the bookmark to `cmi.location` on every lesson open; slide output
   * keeps the position only in the suspend data (standards.md rule 17). Default true. The launch
   * never reads `cmi.location` (rule 1): the suspend data holds the position as well.
   */
  bookmark?: boolean;
}

/** `cmi.location` holds 1,000 characters (standards.md §4.2). */
const MAX_LOCATION = 1_000;
/** A fill-in response holds 250 characters. */
const MAX_FILL_IN = 250;
/** Correct patterns every LMS keeps for a fill-in: the smallest permitted maximum of the standard. */
const MAX_FILL_IN_PATTERNS = 5;

/**
 * The SCORM 2004 adapter. A refused write is kept and sent again before the next commit, and the
 * method throws a `ScormError` once its other writes are done, so the core reports it and goes on
 * (standards.md P-20).
 */
export function createScorm2004Adapter(
  api: Scorm2004Api,
  options: Scorm2004AdapterOptions = {},
): TrackingAdapter {
  const bookmark = options.bookmark ?? true;
  const writer = scormWriter({
    setName: "SetValue",
    setValue: (element, value) => api.SetValue(element, value),
    lastError: () => api.GetLastError(),
    errorString: (code) => api.GetErrorString(code),
  });
  const { set, raise } = writer;
  let sentSuccess: string | undefined;
  let sentCompletion: string | undefined;
  let sentScore: string | undefined;
  let interactions: number | undefined;

  const get = (element: string) => api.GetValue(element);

  return {
    initialize(): Launch {
      if (api.Initialize("") !== "true") throw writer.error("Initialize");
      // Launch order of standards.md rule 1. The mode is read only after the exit value is set, so
      // review and browse launches write nothing from the mode read on (rule 15).
      get("cmi.success_status");
      if (get("cmi.completion_status") === "not attempted") {
        set("cmi.completion_status", "incomplete");
      }
      set("cmi.exit", "suspend");
      const mode = toMode(get("cmi.mode"));
      const resume = get("cmi.suspend_data");
      const launch: Launch = {
        mode,
        status: {
          success: toSuccess(get("cmi.success_status")),
          completion: toCompletion(get("cmi.completion_status")),
        },
      };
      if (resume) launch.resume = resume;
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
      set("cmi.location", cut(location, MAX_LOCATION));
      raise();
    },

    reportStatus(status) {
      let wrote = false;
      // Score raw, min and max plus scaled = raw ÷ max, sent only when it changes (rule 12).
      if (status.score) {
        const { raw, min, max } = status.score;
        if (String(raw) !== sentScore) {
          set("cmi.score.raw", String(raw));
          set("cmi.score.min", String(min));
          set("cmi.score.max", String(max));
          if (max > 0) set("cmi.score.scaled", String(Math.min(1, Math.max(-1, raw / max))));
          sentScore = String(raw);
          wrote = true;
        }
      }
      // Passed and failed also complete; completed sets only completion (rule 10). The first report
      // sends both, so the start button reports success unknown and completion incomplete (rule 3).
      const completion =
        status.success !== "unknown" ? "completed" : completionWord(status.completion);
      if (status.success !== sentSuccess) {
        set("cmi.success_status", status.success);
        sentSuccess = status.success;
        wrote = true;
      }
      if (completion && completion !== sentCompletion) {
        set("cmi.completion_status", completion);
        sentCompletion = completion;
        wrote = true;
      }
      raise();
      return wrote;
    },

    reportInteraction(interaction) {
      // Appended after the interactions earlier sessions wrote. The id goes first and the type
      // before the responses: the LMS checks the responses against the type.
      interactions ??= Number.parseInt(get("cmi.interactions._count"), 10) || 0;
      const n = `cmi.interactions.${interactions++}`;
      set(`${n}.id`, interaction.id);
      set(`${n}.type`, interaction.type);
      set(`${n}.weighting`, String(interaction.weighting));
      set(`${n}.learner_response`, responseText(interaction.type, interaction.response));
      set(`${n}.result`, interaction.result);
      patterns(interaction).forEach((pattern, i) => {
        set(`${n}.correct_responses.${i}.pattern`, pattern);
      });
      raise();
    },

    writeSessionTime(ms) {
      set("cmi.session_time", duration(ms));
      raise();
    },

    setExit(exit) {
      // normal when the learner reached the end, otherwise suspend (standards.md rule 8).
      set("cmi.exit", exit);
      raise();
    },

    commit() {
      // Writes the LMS refused before go again first (standards.md P-20).
      writer.retry();
      if (api.Commit("") !== "true") writer.refused("Commit");
      raise();
    },

    terminate() {
      if (api.Terminate("") !== "true") throw writer.error("Terminate");
    },
  };
}

function toMode(value: string): Mode {
  return value === "review" || value === "browse" ? value : "normal";
}

function toSuccess(word: string): Success {
  return word === "passed" || word === "failed" ? word : "unknown";
}

function toCompletion(word: string): Completion {
  if (word === "not attempted") return "not-attempted";
  return word === "completed" || word === "incomplete" ? word : "unknown";
}

function completionWord(completion: Completion): string | undefined {
  return completion === "completed" || completion === "incomplete" ? completion : undefined;
}

/**
 * SCORM 2004 timeinterval, an ISO 8601 duration in hours, minutes and seconds to the hundredth,
 * such as `PT1M12.26S` (standards.md §4.1).
 */
export function duration(ms: number): string {
  const centis = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor(centis / 6_000) % 60;
  const seconds = Math.floor(centis / 100) % 60;
  const hundredths = centis % 100;
  const fraction = hundredths ? `.${String(hundredths).padStart(2, "0").replace(/0$/, "")}` : "";
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds}${fraction}S`;
}

/** SCORM 2004 response text: choices by `[,]`, matching pairs as `a[.]b`, typed text as typed. */
function responseText(type: Interaction["type"], response: Interaction["response"]): string {
  if (typeof response === "string") return cut(response, MAX_FILL_IN);
  if (type === "matching") {
    return (response as [string, string][]).map((pair) => pair.join("[.]")).join("[,]");
  }
  return (response as string[]).join("[,]");
}

function patterns(interaction: Interaction): string[] {
  // Each accepted answer of a fill-in is a correct pattern of its own.
  // shortcut: answers past the fifth are not sent, as an LMS may refuse them; send them when an LMS
  // in the test matrix keeps more.
  if (interaction.type === "fill-in") {
    return interaction.correctResponse
      .slice(0, MAX_FILL_IN_PATTERNS)
      .map((answer) => cut(answer, MAX_FILL_IN));
  }
  return [responseText(interaction.type, interaction.correctResponse)];
}
