import type { Interaction } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  type Clock,
  createScorm2004Adapter,
  createTracker,
  duration,
  encodeResume,
  findScorm2004Api,
  RESUME_CAPS,
  type Scorm2004AdapterOptions,
  type Scorm2004Api,
  ScormError,
  type ScormWindow,
} from "./index.js";

/** An LMS API in memory that logs every call as `method args... -> result`. */
function fakeApi(values: Record<string, string> = {}, refuse: string[] = []) {
  const data = new Map(
    Object.entries({
      "cmi.completion_status": "not attempted",
      "cmi.success_status": "unknown",
      "cmi.mode": "normal",
      ...values,
    }),
  );
  const log: string[] = [];
  let lastError = "0";
  const record = (method: string, args: string[], result: string) => {
    log.push([method, ...args, "->", result].join(" "));
    return result;
  };
  const api: Scorm2004Api = {
    Initialize: () => record("Initialize", [], "true"),
    Terminate: () => record("Terminate", [], "true"),
    GetValue: (element) => record("GetValue", [element], data.get(element) ?? ""),
    SetValue(element, value) {
      if (refuse.includes(element)) {
        lastError = "351";
        return record("SetValue", [element, value], "false");
      }
      data.set(element, value);
      return record("SetValue", [element, value], "true");
    },
    Commit() {
      if (refuse.includes("commit")) {
        lastError = "391";
        return record("Commit", [], "false");
      }
      return record("Commit", [], "true");
    },
    GetLastError: () => lastError,
    GetErrorString: (code) => (code === "0" ? "" : "General commit failure"),
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
  options: Scorm2004AdapterOptions = {},
) {
  const lms = fakeApi(values, refuse);
  const clock = fakeClock();
  const errors: unknown[] = [];
  const tracker = createTracker({
    adapter: createScorm2004Adapter(lms.api, options),
    clock,
    packageVersion: "4",
    resumeCap: RESUME_CAPS.scorm2004,
    resumeDelayMs: 100,
    saveIntervalMs: 20_000,
    onError: (error) => errors.push(error),
  });
  return { ...lms, clock, tracker, errors };
}

const payload = (state: Parameters<typeof encodeResume>[0]) => {
  const encoded = encodeResume(state, { packageVersion: "4", cap: RESUME_CAPS.scorm2004 });
  if (!encoded.ok) throw new Error("does not fit");
  return encoded.payload;
};

describe("launch", () => {
  test("[standards:R1] first launch: initialize, success, completion, incomplete, exit suspend, mode, suspend data, success and completion again", async () => {
    const { tracker, log } = setup();
    const session = await tracker.start();
    expect(log).toEqual([
      "Initialize -> true",
      "GetValue cmi.success_status -> unknown",
      "GetValue cmi.completion_status -> not attempted",
      "SetValue cmi.completion_status incomplete -> true",
      "SetValue cmi.exit suspend -> true",
      "GetValue cmi.mode -> normal",
      "GetValue cmi.suspend_data -> ",
      "GetValue cmi.success_status -> unknown",
      "GetValue cmi.completion_status -> incomplete",
    ]);
    expect(session).toMatchObject({
      mode: "normal",
      status: { completion: "incomplete", success: "unknown" },
      resume: { status: "empty" },
    });
  });

  test("[standards:R1] [standards:R17] a relaunch reads back status and saved state, never the location, learner, entry or launch data", async () => {
    const saved = payload({ location: "lesson0002", done: ["lesson0001"] });
    const { tracker, log } = setup({
      "cmi.completion_status": "completed",
      "cmi.success_status": "passed",
      "cmi.suspend_data": saved,
      "cmi.location": "#/lessons/lesson0002",
      "cmi.entry": "resume",
    });
    const session = await tracker.start();
    expect(log).not.toContain("SetValue cmi.completion_status incomplete -> true");
    for (const element of ["location", "learner_name", "learner_id", "entry", "launch_data"]) {
      expect(log.some((call) => call.startsWith(`GetValue cmi.${element} `))).toBe(false);
    }
    expect(session).toMatchObject({
      status: { completion: "completed", success: "passed" },
      resume: { status: "ok", state: { location: "lesson0002", done: ["lesson0001"] } },
    });
    expect(session.location).toBeUndefined();
  });

  test("[standards:R15] [standards:P-14] review mode writes nothing once the mode is read", async () => {
    const { tracker, log, since, clock } = setup({
      "cmi.mode": "review",
      "cmi.completion_status": "completed",
      "cmi.success_status": "passed",
    });
    await tracker.start();
    const from = log.indexOf("GetValue cmi.mode -> review");
    tracker.setLocation("#/lessons/lesson0001");
    tracker.report({ completion: "completed", success: "passed" });
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(30_000);
    tracker.exit(true);
    expect(since(from).filter((call) => call.startsWith("SetValue"))).toEqual([]);
    expect(log.at(-1)).toBe("Terminate -> true");
  });

  test("[standards:R15] browse mode writes nothing once the mode is read", async () => {
    const { tracker, log, since } = setup({ "cmi.mode": "browse" });
    const session = await tracker.start();
    expect(session.mode).toBe("browse");
    const from = log.length;
    tracker.report({ completion: "completed" });
    tracker.exit(true);
    expect(since(from)).toEqual(["Terminate -> true"]);
  });

  test("an LMS that refuses to initialize fails the start", async () => {
    const { api } = fakeApi();
    api.Initialize = () => "false";
    const tracker = createTracker({
      adapter: createScorm2004Adapter(api),
      packageVersion: "4",
      resumeCap: RESUME_CAPS.scorm2004,
    });
    await expect(tracker.start()).rejects.toBeInstanceOf(ScormError);
  });
});

describe("learning", () => {
  test("[rise:R2] [standards:R17] every lesson opened is written as cmi.location", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.setLocation("#/lessons/lesson0001");
    tracker.setLocation(`#/lessons/${"x".repeat(1_200)}`);
    expect(since(from)).toEqual([
      "SetValue cmi.location #/lessons/lesson0001 -> true",
      `SetValue cmi.location ${`#/lessons/${"x".repeat(1_200)}`.slice(0, 1_000)} -> true`,
    ]);
  });

  test("[standards:R17] slide-style output keeps the position only in the suspend data", async () => {
    const { tracker, log } = setup({}, [], { bookmark: false });
    await tracker.start();
    tracker.setLocation("#/lessons/lesson0001");
    expect(log.some((call) => call.includes("cmi.location"))).toBe(false);
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
      `SetValue cmi.suspend_data ${payload({ done: ["lesson0001", "lesson0002"] })} -> true`,
    ]);
  });

  test("(standards.md §4.2) a state over the SCORM 1.2 cap but within 64,000 characters is written whole", async () => {
    const { tracker, data, clock } = setup();
    await tracker.start();
    // Ids that do not compress, so the payload is far over 4,096 characters.
    const done = Array.from(
      { length: 900 },
      (_, i) => `l${(i * 7919).toString(36).padStart(9, "q")}`,
    );
    tracker.saveState({ done });
    clock.advance(100);
    const written = data.get("cmi.suspend_data") ?? "";
    expect(written.length).toBeGreaterThan(RESUME_CAPS.scorm12);
    expect(written.length).toBeLessThanOrEqual(RESUME_CAPS.scorm2004);
    expect(written).toBe(payload({ done }));
  });

  test("[rise:R4] [standards:R5] every 20 s the session time is written as an ISO 8601 duration, then committed", async () => {
    const { tracker, since, log, clock } = setup();
    await tracker.start();
    const from = log.length;
    clock.advance(40_000);
    expect(since(from)).toEqual([
      "SetValue cmi.session_time PT20S -> true",
      "Commit -> true",
      "SetValue cmi.session_time PT40S -> true",
      "Commit -> true",
    ]);
  });

  test("[standards:R3] [standards:R10] the start button reports success unknown and completion incomplete; completed sets only completion", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.report({ completion: "incomplete", progress: 0 });
    tracker.report({ progress: 0.5 });
    tracker.report({ completion: "completed", progress: 1 });
    expect(since(from)).toEqual([
      "SetValue cmi.success_status unknown -> true",
      "SetValue cmi.completion_status incomplete -> true",
      "Commit -> true",
      "SetValue cmi.completion_status completed -> true",
      "Commit -> true",
    ]);
  });

  test("[standards:R10] [standards:R12] [rise:R4] [rise:R7] score raw, min, max and scaled, then success and completion apart, then a commit", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    tracker.report({ completion: "incomplete" });
    const from = log.length;
    tracker.report({ success: "failed", score: { raw: 60, min: 0, max: 100 } });
    tracker.report({ success: "passed", score: { raw: 80, min: 0, max: 100 } });
    expect(since(from)).toEqual([
      "SetValue cmi.score.raw 60 -> true",
      "SetValue cmi.score.min 0 -> true",
      "SetValue cmi.score.max 100 -> true",
      "SetValue cmi.score.scaled 0.6 -> true",
      "SetValue cmi.success_status failed -> true",
      // Failed also completes (rule 10).
      "SetValue cmi.completion_status completed -> true",
      "Commit -> true",
      "SetValue cmi.score.raw 80 -> true",
      "SetValue cmi.score.min 0 -> true",
      "SetValue cmi.score.max 100 -> true",
      "SetValue cmi.score.scaled 0.8 -> true",
      "SetValue cmi.success_status passed -> true",
      "Commit -> true",
    ]);
  });

  test("[standards:R10] a reset reports success unknown and completion incomplete", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    tracker.report({ completion: "completed", success: "passed" });
    const from = log.length;
    tracker.report({ completion: "incomplete", success: "unknown" });
    expect(since(from)).toEqual([
      "SetValue cmi.success_status unknown -> true",
      "SetValue cmi.completion_status incomplete -> true",
      "Commit -> true",
    ]);
  });

  test("[rise:R10] [standards:P-12] answered questions are appended as interactions in SCORM 2004 response formats, each committed", async () => {
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
      correctResponse: ["on", "closed", "shut", "down", "fixed", "sealed"],
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
      "GetValue cmi.interactions._count -> 2",
      "SetValue cmi.interactions.2.id Final_quiz_Pick_two_1 -> true",
      "SetValue cmi.interactions.2.type choice -> true",
      "SetValue cmi.interactions.2.weighting 1 -> true",
      "SetValue cmi.interactions.2.learner_response Greens[,]Browns -> true",
      "SetValue cmi.interactions.2.result incorrect -> true",
      "SetValue cmi.interactions.2.correct_responses.0.pattern Greens -> true",
      "Commit -> true",
      "SetValue cmi.interactions.3.id Final_quiz_Lid_1 -> true",
      "SetValue cmi.interactions.3.type fill-in -> true",
      "SetValue cmi.interactions.3.weighting 1 -> true",
      "SetValue cmi.interactions.3.learner_response on -> true",
      "SetValue cmi.interactions.3.result correct -> true",
      "SetValue cmi.interactions.3.correct_responses.0.pattern on -> true",
      "SetValue cmi.interactions.3.correct_responses.1.pattern closed -> true",
      "SetValue cmi.interactions.3.correct_responses.2.pattern shut -> true",
      "SetValue cmi.interactions.3.correct_responses.3.pattern down -> true",
      "SetValue cmi.interactions.3.correct_responses.4.pattern fixed -> true",
      "Commit -> true",
      "SetValue cmi.interactions.4.id Final_quiz_Match_1 -> true",
      "SetValue cmi.interactions.4.type matching -> true",
      "SetValue cmi.interactions.4.weighting 1 -> true",
      "SetValue cmi.interactions.4.learner_response Grass[.]Green -> true",
      "SetValue cmi.interactions.4.result correct -> true",
      "SetValue cmi.interactions.4.correct_responses.0.pattern Grass[.]Green[,]Leaves[.]Brown -> true",
      "Commit -> true",
    ]);
  });

  test("a typed answer longer than a fill-in holds is cut to 250 characters", async () => {
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
    expect(data.get("cmi.interactions.0.learner_response")).toHaveLength(250);
  });
});

describe("exit", () => {
  test("[standards:R7] [standards:R8] [standards:R13] at the end: status, pending data and commit, time, exit normal, commit, terminate", async () => {
    const { tracker, since, log, clock } = setup();
    await tracker.start();
    clock.advance(1_500);
    tracker.saveState({ done: ["lesson0001"] });
    const from = log.length;
    tracker.exit(true);
    expect(since(from)).toEqual([
      "SetValue cmi.success_status unknown -> true",
      "SetValue cmi.completion_status completed -> true",
      `SetValue cmi.suspend_data ${payload({ done: ["lesson0001"] })} -> true`,
      "Commit -> true",
      "SetValue cmi.session_time PT1.5S -> true",
      "SetValue cmi.exit normal -> true",
      "Commit -> true",
      "Terminate -> true",
    ]);
  });

  test("[standards:R8] [standards:R9] leaving before the end exits with suspend", async () => {
    const { tracker, since, log } = setup();
    await tracker.start();
    const from = log.length;
    tracker.exit(false);
    expect(since(from)).toEqual([
      "SetValue cmi.session_time PT0S -> true",
      "SetValue cmi.exit suspend -> true",
      "Commit -> true",
      "Terminate -> true",
    ]);
  });
});

describe("errors (standards.md P-20)", () => {
  test("a refused commit is reported, the course goes on and the next commit retries", async () => {
    const { tracker, since, log, clock, errors, refuse } = setup({}, ["commit"]);
    await tracker.start();
    tracker.report({ completion: "completed" });
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("Commit failed: 391 General commit failure");
    refuse.length = 0;
    const from = log.length;
    clock.advance(20_000);
    expect(since(from)).toEqual(["SetValue cmi.session_time PT20S -> true", "Commit -> true"]);
  });

  test("a refused write is sent again before the next commit", async () => {
    const { tracker, since, log, clock, errors, refuse } = setup({}, ["cmi.suspend_data"]);
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(100);
    expect(String(errors[0])).toContain("SetValue(cmi.suspend_data) failed: 351");
    refuse.length = 0;
    const from = log.length;
    clock.advance(20_000);
    expect(since(from)).toEqual([
      "SetValue cmi.session_time PT20S -> true",
      `SetValue cmi.suspend_data ${payload({ done: ["lesson0001"] })} -> true`,
      "Commit -> true",
    ]);
  });

  test("a refusal during exit never stops the exit sequence", async () => {
    const { tracker, log, errors } = setup({}, ["cmi.session_time", "commit"]);
    await tracker.start();
    tracker.exit(false);
    expect(log.slice(-5)).toEqual([
      "SetValue cmi.session_time PT0S -> false",
      "SetValue cmi.exit suspend -> true",
      "SetValue cmi.session_time PT0S -> false",
      "Commit -> false",
      "Terminate -> true",
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

  test("finds API_1484_11 on a parent frame, and not a SCORM 1.2 API", () => {
    const top: ScormWindow = { API_1484_11: api };
    top.parent = top;
    expect(findScorm2004Api(chain(3, top))).toBe(api);
    const old: ScormWindow = { API: { LMSInitialize() {}, LMSSetValue() {} } };
    expect(findScorm2004Api(old)).toBeUndefined();
  });

  test("then on the window that opened the course and its parents", () => {
    const lmsTop: ScormWindow = { API_1484_11: api };
    lmsTop.parent = lmsTop;
    const popup: ScormWindow = { opener: chain(2, lmsTop) };
    popup.parent = popup;
    expect(findScorm2004Api(chain(1, popup))).toBe(api);
  });

  test("stops after a bounded number of levels and at a window it may not read", () => {
    expect(findScorm2004Api(chain(20, { API_1484_11: api }))).toBeUndefined();
    const foreign = {
      get API_1484_11(): unknown {
        throw new Error("SecurityError");
      },
    };
    expect(findScorm2004Api({ parent: foreign })).toBeUndefined();
  });
});

test("[standards:R5] session time is an ISO 8601 duration to the hundredth of a second", () => {
  expect(duration(0)).toBe("PT0S");
  expect(duration(72_260)).toBe("PT1M12.26S");
  expect(duration(3_600_000 * 12 + 50)).toBe("PT12H0.05S");
  expect(duration(3_723_400)).toBe("PT1H2M3.4S");
});
