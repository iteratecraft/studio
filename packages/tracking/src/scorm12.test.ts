import type { Interaction } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  type Clock,
  createScorm12Adapter,
  createTracker,
  encodeResume,
  findScorm12Api,
  RESUME_CAPS,
  type Scorm12AdapterOptions,
  type Scorm12Api,
  ScormError,
  type ScormWindow,
  timespan,
} from "./index.js";

/** An LMS API in memory that logs every call as `method args... -> result`. */
function fakeApi(values: Record<string, string> = {}, refuse: string[] = []) {
  const data = new Map(Object.entries({ "cmi.core.lesson_status": "not attempted", ...values }));
  const log: string[] = [];
  let lastError = "0";
  const record = (method: string, args: string[], result: string) => {
    log.push([method, ...args, "->", result].join(" "));
    return result;
  };
  const api: Scorm12Api = {
    LMSInitialize: () => record("LMSInitialize", [], "true"),
    LMSFinish: () => record("LMSFinish", [], "true"),
    LMSGetValue: (element) => record("LMSGetValue", [element], data.get(element) ?? ""),
    LMSSetValue(element, value) {
      if (refuse.includes(element)) {
        lastError = "351";
        return record("LMSSetValue", [element, value], "false");
      }
      data.set(element, value);
      return record("LMSSetValue", [element, value], "true");
    },
    LMSCommit() {
      if (refuse.includes("commit")) {
        lastError = "101";
        return record("LMSCommit", [], "false");
      }
      return record("LMSCommit", [], "true");
    },
    LMSGetLastError: () => lastError,
    LMSGetErrorString: (code) => (code === "0" ? "" : "General exception"),
  };
  /** Calls after `from`, so a test sees only what it caused. */
  const since = (from: number) => log.slice(from);
  return { api, log, data, since, refuse };
}

function fakeClock() {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: Clock & { advance(ms: number): void } = {
    now: () => now,
    setTimeout(run, ms) {
      timers.set(++next, { at: now + ms, run });
      return next;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, t]) => t.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = end;
    },
  };
  return clock;
}

/** A tracker on a fake LMS with the Blocks profile timings (rise.md rules 3 and 4). */
function setup(
  values: Record<string, string> = {},
  refuse: string[] = [],
  options: Scorm12AdapterOptions = {},
) {
  const lms = fakeApi(values, refuse);
  const clock = fakeClock();
  const errors: unknown[] = [];
  const tracker = createTracker({
    adapter: createScorm12Adapter(lms.api, options),
    clock,
    packageVersion: "4",
    resumeCap: RESUME_CAPS.scorm12,
    resumeDelayMs: 100,
    saveIntervalMs: 20_000,
    onError: (error) => errors.push(error),
  });
  return { ...lms, clock, tracker, errors };
}

const payload = (state: Parameters<typeof encodeResume>[0]) => {
  const encoded = encodeResume(state, { packageVersion: "4", cap: RESUME_CAPS.scorm12 });
  if (!encoded.ok) throw new Error("does not fit");
  return encoded.payload;
};

describe("launch", () => {
  test("[standards:R2] [rise:R1] first launch: initialize, mode, status, incomplete, exit suspend, suspend data, location", async () => {
    const { tracker, log } = setup();
    const session = await tracker.start();
    expect(log).toEqual([
      "LMSInitialize -> true",
      "LMSGetValue cmi.core.lesson_mode -> ",
      "LMSGetValue cmi.core.lesson_status -> not attempted",
      "LMSSetValue cmi.core.lesson_status incomplete -> true",
      "LMSSetValue cmi.core.exit suspend -> true",
      "LMSGetValue cmi.suspend_data -> ",
      "LMSGetValue cmi.core.lesson_location -> ",
    ]);
    expect(session).toMatchObject({
      mode: "normal",
      status: { completion: "incomplete", success: "unknown" },
      resume: { status: "empty" },
    });
  });

  test("[standards:R2] [rise:R1] a relaunch reads back the status, the saved state and the bookmark", async () => {
    const saved = payload({ location: "lesson0002", done: ["lesson0001"] });
    const { tracker, log } = setup({
      "cmi.core.lesson_mode": "normal",
      "cmi.core.lesson_status": "passed",
      "cmi.suspend_data": saved,
      "cmi.core.lesson_location": "#/lessons/lesson0002",
    });
    const session = await tracker.start();
    expect(log).not.toContain("LMSSetValue cmi.core.lesson_status incomplete -> true");
    expect(session).toMatchObject({
      status: { completion: "completed", success: "passed" },
      location: "#/lessons/lesson0002",
      resume: { status: "ok", state: { location: "lesson0002", done: ["lesson0001"] } },
    });
  });

  test("[standards:R2] [standards:P-15] browse mode reports browsed, then writes nothing", async () => {
    const { tracker, log, since, clock } = setup({ "cmi.core.lesson_mode": "browse" });
    const session = await tracker.start();
    expect(log.slice(1, 4)).toEqual([
      "LMSGetValue cmi.core.lesson_mode -> browse",
      "LMSSetValue cmi.core.lesson_status browsed -> true",
      "LMSGetValue cmi.core.lesson_status -> browsed",
    ]);
    expect(session.mode).toBe("browse");
    const from = log.length;
    tracker.report({ completion: "completed" });
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(30_000);
    tracker.exit(true);
    expect(since(from)).toEqual(["LMSFinish -> true"]);
  });

  test("[standards:R15] [standards:P-14] a review-mode launch makes zero LMSSetValue calls", async () => {
    const { tracker, log, clock } = setup({ "cmi.core.lesson_mode": "review" });
    await tracker.start();
    tracker.setLocation("#/lessons/lesson0001");
    tracker.report({ completion: "completed", success: "passed" });
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(30_000);
    tracker.exit(true);
    expect(log.filter((call) => call.startsWith("LMSSetValue"))).toEqual([]);
    expect(log.at(-1)).toBe("LMSFinish -> true");
  });

  test("an LMS that refuses to initialize fails the start", async () => {
    const { api } = fakeApi();
    api.LMSInitialize = () => "false";
    const tracker = createTracker({
      adapter: createScorm12Adapter(api),
      packageVersion: "4",
      resumeCap: RESUME_CAPS.scorm12,
    });
    await expect(tracker.start()).rejects.toBeInstanceOf(ScormError);
  });
});

describe("learning", () => {
  test("[rise:R2] [standards:R17] every lesson opened is written as the lesson location", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.setLocation("#/lessons/lesson0001");
    tracker.setLocation("#/lessons/lesson0002");
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.lesson_location #/lessons/lesson0001 -> true",
      "LMSSetValue cmi.core.lesson_location #/lessons/lesson0002 -> true",
    ]);
  });

  test("[standards:R17] slide-style output keeps the position only in the suspend data", async () => {
    const { tracker, log } = setup({}, [], { bookmark: false });
    await tracker.start();
    tracker.setLocation("#/lessons/lesson0001");
    expect(log.some((call) => call.includes("lesson_location"))).toBe(false);
  });

  test("[rise:R3] suspend data is written 100 ms after the last change, without a commit", async () => {
    const { tracker, since, log, clock } = setup();
    await tracker.start();
    const from = log.length;
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(50);
    tracker.saveState({ done: ["lesson0001", "lesson0002"] });
    clock.advance(99);
    expect(since(from)).toEqual([]);
    clock.advance(1);
    expect(since(from)).toEqual([
      `LMSSetValue cmi.suspend_data ${payload({ done: ["lesson0001", "lesson0002"] })} -> true`,
    ]);
  });

  test("[rise:R4] [standards:R5] every 20 s the session time is written, then committed", async () => {
    const { tracker, since, log, clock } = setup();
    await tracker.start();
    const from = log.length;
    clock.advance(40_000);
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.session_time 0000:00:20.00 -> true",
      "LMSCommit -> true",
      "LMSSetValue cmi.core.session_time 0000:00:40.00 -> true",
      "LMSCommit -> true",
    ]);
  });

  test("[standards:R11] [standards:R12] [rise:R4] score raw, min, max and the status word, then a commit", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.report({
      completion: "incomplete",
      success: "failed",
      score: { raw: 60, min: 0, max: 100 },
    });
    tracker.report({
      completion: "completed",
      success: "passed",
      score: { raw: 80, min: 0, max: 100 },
    });
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.score.raw 60 -> true",
      "LMSSetValue cmi.core.score.min 0 -> true",
      "LMSSetValue cmi.core.score.max 100 -> true",
      "LMSSetValue cmi.core.lesson_status failed -> true",
      "LMSCommit -> true",
      "LMSSetValue cmi.core.score.raw 80 -> true",
      "LMSSetValue cmi.core.score.min 0 -> true",
      "LMSSetValue cmi.core.score.max 100 -> true",
      "LMSSetValue cmi.core.lesson_status passed -> true",
      "LMSCommit -> true",
    ]);
  });

  test("[standards:R3] [standards:R11] the first report sends its word; a progress-only change sends and commits nothing", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.report({ completion: "incomplete", progress: 0 });
    tracker.report({ progress: 0.5 });
    tracker.report({ completion: "completed", progress: 1 });
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.lesson_status incomplete -> true",
      "LMSCommit -> true",
      "LMSSetValue cmi.core.lesson_status completed -> true",
      "LMSCommit -> true",
    ]);
  });

  test("[rise:R10] answered questions are appended as interactions, each committed", async () => {
    const { tracker, since, log } = setup({ "cmi.interactions._count": "2" });
    await tracker.start();
    const from = log.length;
    const choice: Interaction = {
      id: "Final_quiz_Pick_two_1",
      weighting: 1,
      result: "incorrect",
      type: "choice",
      response: ["Greens", "Browns"],
      correctResponse: ["Greens"],
    };
    const fillIn: Interaction = {
      id: "Final_quiz_Lid_1",
      weighting: 1,
      result: "correct",
      type: "fill-in",
      response: "on",
      correctResponse: ["on", "closed"],
    };
    const matching: Interaction = {
      id: "Final_quiz_Match_1",
      weighting: 1,
      result: "correct",
      type: "matching",
      response: [["Grass", "Green"]],
      correctResponse: [
        ["Grass", "Green"],
        ["Leaves", "Brown"],
      ],
    };
    tracker.recordInteraction(choice);
    tracker.recordInteraction(fillIn);
    tracker.recordInteraction(matching);
    expect(since(from)).toEqual([
      "LMSGetValue cmi.interactions._count -> 2",
      "LMSSetValue cmi.interactions.2.id Final_quiz_Pick_two_1 -> true",
      "LMSSetValue cmi.interactions.2.type choice -> true",
      "LMSSetValue cmi.interactions.2.weighting 1 -> true",
      "LMSSetValue cmi.interactions.2.student_response Greens,Browns -> true",
      "LMSSetValue cmi.interactions.2.result wrong -> true",
      "LMSSetValue cmi.interactions.2.correct_responses.0.pattern Greens -> true",
      "LMSCommit -> true",
      "LMSSetValue cmi.interactions.3.id Final_quiz_Lid_1 -> true",
      "LMSSetValue cmi.interactions.3.type fill-in -> true",
      "LMSSetValue cmi.interactions.3.weighting 1 -> true",
      "LMSSetValue cmi.interactions.3.student_response on -> true",
      "LMSSetValue cmi.interactions.3.result correct -> true",
      "LMSSetValue cmi.interactions.3.correct_responses.0.pattern on -> true",
      "LMSSetValue cmi.interactions.3.correct_responses.1.pattern closed -> true",
      "LMSCommit -> true",
      "LMSSetValue cmi.interactions.4.id Final_quiz_Match_1 -> true",
      "LMSSetValue cmi.interactions.4.type matching -> true",
      "LMSSetValue cmi.interactions.4.weighting 1 -> true",
      "LMSSetValue cmi.interactions.4.student_response Grass.Green -> true",
      "LMSSetValue cmi.interactions.4.result correct -> true",
      "LMSSetValue cmi.interactions.4.correct_responses.0.pattern Grass.Green,Leaves.Brown -> true",
      "LMSCommit -> true",
    ]);
  });

  test("a typed answer longer than SCORM 1.2 stores is cut to 255 characters", async () => {
    const { tracker, data } = setup();
    await tracker.start();
    tracker.recordInteraction({
      id: "Quiz_Long_1",
      weighting: 1,
      result: "incorrect",
      type: "fill-in",
      response: "x".repeat(300),
      correctResponse: ["y"],
    });
    expect(data.get("cmi.interactions.0.student_response")).toHaveLength(255);
  });
});

describe("exit", () => {
  test("[standards:R7] [standards:R8] [standards:R13] at the end: status, pending data and commit, time, exit '', commit, finish", async () => {
    const { tracker, since, log, clock } = setup();
    await tracker.start();
    clock.advance(1_500);
    tracker.saveState({ done: ["lesson0001"] });
    const from = log.length;
    tracker.exit(true);
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.lesson_status completed -> true",
      `LMSSetValue cmi.suspend_data ${payload({ done: ["lesson0001"] })} -> true`,
      "LMSCommit -> true",
      "LMSSetValue cmi.core.session_time 0000:00:01.50 -> true",
      "LMSSetValue cmi.core.exit  -> true",
      "LMSCommit -> true",
      "LMSFinish -> true",
    ]);
  });

  test("[standards:R8] [standards:R9] leaving before the end exits with suspend", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.exit(false);
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.session_time 0000:00:00.00 -> true",
      "LMSSetValue cmi.core.exit suspend -> true",
      "LMSCommit -> true",
      "LMSFinish -> true",
    ]);
  });
});

describe("errors (standards.md P-20)", () => {
  test("a refused commit is reported, the course goes on and the next commit retries", async () => {
    const lms = setup({}, ["commit"]);
    const { tracker, since, log, clock, errors, refuse } = lms;
    await tracker.start();
    tracker.report({ completion: "completed" });
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("LMSCommit failed: 101 General exception");
    refuse.length = 0;
    const from = log.length;
    clock.advance(20_000);
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.session_time 0000:00:20.00 -> true",
      "LMSCommit -> true",
    ]);
  });

  test("a refused write is sent again before the next commit", async () => {
    const lms = setup({}, ["cmi.suspend_data"]);
    const { tracker, since, log, clock, errors, refuse } = lms;
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(100);
    expect(String(errors[0])).toContain("LMSSetValue(cmi.suspend_data) failed: 351");
    refuse.length = 0;
    const from = log.length;
    clock.advance(20_000);
    expect(since(from)).toEqual([
      "LMSSetValue cmi.core.session_time 0000:00:20.00 -> true",
      `LMSSetValue cmi.suspend_data ${payload({ done: ["lesson0001"] })} -> true`,
      "LMSCommit -> true",
    ]);
  });

  test("a refusal during exit never stops the exit sequence", async () => {
    const { tracker, log, errors } = setup({}, ["cmi.core.session_time", "commit"]);
    await tracker.start();
    tracker.exit(false);
    expect(log.slice(-5)).toEqual([
      "LMSSetValue cmi.core.session_time 0000:00:00.00 -> false",
      "LMSSetValue cmi.core.exit suspend -> true",
      "LMSSetValue cmi.core.session_time 0000:00:00.00 -> false",
      "LMSCommit -> false",
      "LMSFinish -> true",
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("API discovery (standards.md P-3)", () => {
  const api = fakeApi().api;
  const chain = (depth: number, top: ScormWindow) => {
    let win = top;
    for (let i = 0; i < depth; i++) win = { parent: win };
    return win;
  };

  test("finds the API on a parent frame", () => {
    const top: ScormWindow = { API: api };
    top.parent = top;
    expect(findScorm12Api(chain(3, top))).toBe(api);
  });

  test("then on the window that opened the course and its parents", () => {
    const lmsTop: ScormWindow = { API: api };
    lmsTop.parent = lmsTop;
    const popup: ScormWindow = { opener: chain(2, lmsTop) };
    popup.parent = popup;
    expect(findScorm12Api(chain(1, popup))).toBe(api);
  });

  test("stops after a bounded number of levels and at a window it may not read", () => {
    const far: ScormWindow = { API: api };
    expect(findScorm12Api(chain(20, far))).toBeUndefined();
    const foreign = {
      get API(): unknown {
        throw new Error("SecurityError");
      },
    };
    expect(findScorm12Api({ parent: foreign })).toBeUndefined();
    expect(findScorm12Api({ API: { LMSInitialize: "no" } })).toBeUndefined();
  });
});

test("[standards:R5] session time is HHHH:MM:SS.SS", () => {
  expect(timespan(0)).toBe("0000:00:00.00");
  expect(timespan(61_234)).toBe("0000:01:01.23");
  expect(timespan(3_600_000 * 12 + 5)).toBe("0012:00:00.01");
  expect(timespan(Number.MAX_SAFE_INTEGER)).toBe("9999:59:59.99");
});
