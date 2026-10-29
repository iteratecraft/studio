import type { Interaction } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  type Clock,
  createMemoryAdapter,
  createTracker,
  encodeResume,
  type KeyValueStorage,
  type MemoryAdapterOptions,
  RESUME_CAPS,
  type ResumeWarning,
  type TrackerOptions,
} from "./index.js";

/** A clock that moves only when the test advances it, running timers in time order. */
function fakeClock() {
  let now = 0;
  let nextHandle = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock & { advance(ms: number): void; timers(): number } = {
    now: () => now,
    setTimeout(callback, ms) {
      timers.set(++nextHandle, { at: now + ms, callback });
      return nextHandle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    /** Timers still scheduled. */
    timers: () => timers.size,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, t]) => t.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
    },
  };
  return clock;
}

function setup(adapterOptions: MemoryAdapterOptions = {}, options: Partial<TrackerOptions> = {}) {
  const clock = fakeClock();
  const adapter = createMemoryAdapter(adapterOptions);
  const tracker = createTracker({
    adapter,
    clock,
    packageVersion: "1",
    resumeCap: RESUME_CAPS.scorm12,
    ...options,
  });
  const methods = () => adapter.calls.map((call) => call.method);
  /** Calls after the launch, so a test sees only what it caused. */
  const since = (from: number) => adapter.calls.slice(from).map((call) => call.method);
  return { clock, adapter, tracker, methods, since };
}

const interaction: Interaction = {
  id: "Quiz_Question_1",
  weighting: 1,
  result: "correct",
  type: "choice",
  response: ["a"],
  correctResponse: ["a"],
};

describe("resume writes", () => {
  test("[standards:R4] a burst of changes is written once, 0.5 s after the last change", async () => {
    const { clock, adapter, tracker } = setup();
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(300);
    tracker.saveState({ done: ["lesson0001", "block00001"] });
    clock.advance(499);
    expect(adapter.calls.filter((c) => c.method === "writeResume")).toEqual([]);
    clock.advance(1);
    const expected = encodeResume(
      { done: ["lesson0001", "block00001"] },
      { packageVersion: "1", cap: RESUME_CAPS.scorm12 },
    );
    expect(adapter.calls.filter((c) => c.method === "writeResume")).toEqual([
      { method: "writeResume", args: [expected.ok && expected.payload] },
    ]);
  });

  test("[standards:R4] an unchanged state is never written", async () => {
    const { clock, tracker, since } = setup();
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(500);
    const from = since(0).length;
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(500);
    expect(since(from)).toEqual([]);
  });

  test("[standards:R4] the state just resumed is not written back", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.tracker.start();
    first.tracker.saveState({ done: ["lesson0001"] });
    first.tracker.exit(false);

    const second = setup({ storage });
    const session = await second.tracker.start();
    expect(session.resume).toEqual({
      status: "ok",
      state: { done: ["lesson0001"] },
      packageVersion: "1",
    });
    second.tracker.saveState({ done: ["lesson0001"] });
    second.clock.advance(500);
    expect(second.methods()).not.toContain("writeResume");
  });

  test("[rise:R3] the delay is set per app profile", async () => {
    const { clock, methods, tracker } = setup({}, { resumeDelayMs: 100 });
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(100);
    expect(methods()).toContain("writeResume");
  });

  test("a state over the cap is not written, and the warning says why", async () => {
    const warnings: ResumeWarning[] = [];
    const { clock, methods, tracker } = setup(
      {},
      { resumeCap: 10, onResumeWarning: (w) => warnings.push(w) },
    );
    await tracker.start();
    tracker.saveState({ done: ["lesson0001", "lesson0002"] });
    clock.advance(500);
    expect(methods()).not.toContain("writeResume");
    expect(warnings).toMatchObject([{ code: "over-cap", cap: 10 }]);
  });
});

describe("status", () => {
  test("[standards:R6] a status change is reported and committed at once", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    const from = adapter.calls.length;
    tracker.report({ completion: "completed", score: { raw: 80, min: 0, max: 100 } });
    expect(since(from)).toEqual(["reportStatus", "commit"]);
    expect(adapter.calls.at(-2)?.args[0]).toEqual({
      completion: "completed",
      success: "unknown",
      score: { raw: 80, min: 0, max: 100 },
    });
    expect(tracker.status.completion).toBe("completed");
  });

  test("[standards:R6] reporting the same status again writes nothing", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    tracker.report({ success: "passed", score: { raw: 90, min: 0, max: 100 } });
    const from = adapter.calls.length;
    tracker.report({ success: "passed", score: { raw: 90, min: 0, max: 100 } });
    expect(since(from)).toEqual([]);
  });

  test("[rise:R4] an answered question is reported and committed", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    const from = adapter.calls.length;
    tracker.recordInteraction(interaction);
    expect(since(from)).toEqual(["reportInteraction", "commit"]);
  });

  test("the bookmark is written at once", async () => {
    const { adapter, tracker } = setup();
    await tracker.start();
    tracker.setLocation("lesson0002");
    expect(adapter.calls.at(-1)).toEqual({ method: "writeLocation", args: ["lesson0002"] });
  });
});

describe("session time", () => {
  test("[standards:R5] every 60 s session time is written, then committed, and accumulates", async () => {
    const { adapter, clock, tracker } = setup();
    await tracker.start();
    clock.advance(120_000);
    expect(adapter.calls.slice(1)).toEqual([
      { method: "writeSessionTime", args: [60_000] },
      { method: "commit", args: [] },
      { method: "writeSessionTime", args: [120_000] },
      { method: "commit", args: [] },
    ]);
  });

  test("[rise:R4] the interval is set per app profile", async () => {
    const { methods, clock, tracker } = setup({}, { saveIntervalMs: 20_000 });
    await tracker.start();
    clock.advance(20_000);
    expect(methods()).toEqual(["initialize", "writeSessionTime", "commit"]);
  });
});

describe("save before leaving", () => {
  test("[standards:P-16] a save writes pending data and session time, commits, and the session goes on", async () => {
    const { adapter, clock, tracker, since } = setup();
    await tracker.start();
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(100);
    const from = adapter.calls.length;
    tracker.save();
    expect(since(from)).toEqual(["writeResume", "writeSessionTime", "commit"]);
    expect(adapter.calls.find((c) => c.method === "writeSessionTime")?.args).toEqual([100]);
    // The state is written once; the session is still open for the exit that follows.
    const next = adapter.calls.length;
    tracker.exit(false);
    expect(since(next)).toEqual(["writeSessionTime", "setExit", "commit", "terminate"]);
  });

  test("[standards:R15] a save writes nothing before start, in review mode or after exit", async () => {
    const review = setup({ launch: { mode: "review" } });
    review.tracker.save();
    await review.tracker.start();
    review.tracker.save();
    expect(review.methods()).toEqual(["initialize"]);

    const { tracker, methods } = setup();
    await tracker.start();
    tracker.exit(false);
    const ended = methods().length;
    tracker.save();
    expect(methods()).toHaveLength(ended);
  });
});

describe("exit", () => {
  test("[standards:R7] exit writes pending data, then session time, exit value, commit, terminate", async () => {
    const { adapter, clock, tracker, since } = setup();
    await tracker.start();
    tracker.report({ completion: "incomplete" });
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(100);
    const from = adapter.calls.length;
    tracker.exit(false);
    expect(since(from)).toEqual([
      "writeResume",
      "commit",
      "writeSessionTime",
      "setExit",
      "commit",
      "terminate",
    ]);
    expect(adapter.calls.find((c) => c.method === "writeSessionTime")?.args).toEqual([100]);
  });

  test("[standards:R7] with nothing pending, exit writes no resume data", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    const from = adapter.calls.length;
    tracker.exit(false);
    expect(since(from)).toEqual(["writeSessionTime", "setExit", "commit", "terminate"]);
  });

  test("[standards:R8] the exit value is suspend, or normal once the learner reached the end", async () => {
    for (const [reachedEnd, exit] of [
      [false, "suspend"],
      [true, "normal"],
    ] as const) {
      const { adapter, tracker } = setup();
      await tracker.start();
      tracker.report({ completion: "completed" });
      tracker.exit(reachedEnd);
      expect(adapter.calls.find((c) => c.method === "setExit")?.args).toEqual([exit]);
    }
  });

  test("[standards:R7][standards:R13] finishing with no status set reports completed first", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    const from = adapter.calls.length;
    tracker.exit(true);
    expect(since(from)[0]).toBe("reportStatus");
    expect(adapter.calls[from]?.args[0]).toMatchObject({ completion: "completed" });
  });

  test("[standards:R13] a status already set is left as it is", async () => {
    const { adapter, tracker, since } = setup();
    await tracker.start();
    tracker.report({ success: "failed" });
    const from = adapter.calls.length;
    tracker.exit(true);
    expect(since(from)).not.toContain("reportStatus");
  });

  test("after exit nothing is written and no timer fires", async () => {
    const { adapter, clock, tracker, since } = setup();
    await tracker.start();
    tracker.exit(false);
    const from = adapter.calls.length;
    tracker.saveState({ done: ["lesson0001"] });
    tracker.report({ completion: "completed" });
    tracker.recordInteraction(interaction);
    tracker.setLocation("lesson0001");
    tracker.exit(true);
    clock.advance(600_000);
    expect(since(from)).toEqual([]);
  });

  test("[standards:R7][standards:R9] exit while start is pending ends the session as soon as it opens", async () => {
    const { clock, methods, tracker } = setup();
    const started = tracker.start();
    tracker.exit(false);
    tracker.exit(true);
    await started;
    clock.advance(600_000);
    expect(methods()).toEqual(["initialize", "writeSessionTime", "setExit", "commit", "terminate"]);
    expect(clock.timers()).toBe(0);
  });

  test("start runs once", async () => {
    const { tracker } = setup();
    await tracker.start();
    await expect(tracker.start()).rejects.toThrow("already started");
  });
});

describe("review mode", () => {
  test("[standards:R15] in review mode nothing is written", async () => {
    for (const mode of ["review", "browse"] as const) {
      const { clock, methods, tracker } = setup({ launch: { mode } });
      const session = await tracker.start();
      expect(session.mode).toBe(mode);
      tracker.saveState({ done: ["lesson0001"] });
      tracker.setLocation("lesson0001");
      tracker.report({ completion: "completed" });
      tracker.recordInteraction(interaction);
      clock.advance(120_000);
      tracker.exit(true);
      expect(methods()).toEqual(["initialize", "terminate"]);
    }
  });
});

describe("debug adapter", () => {
  test("a reload resumes from the same storage, with state and bookmark", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.tracker.start();
    first.tracker.setLocation("lesson0002");
    first.tracker.saveState({ location: "lesson0002", variables: { name000001: "Ada" } });
    first.tracker.exit(false);

    const session = await setup({ storage }).tracker.start();
    expect(session.location).toBe("lesson0002");
    expect(session.resume).toMatchObject({
      state: { location: "lesson0002", variables: { name000001: "Ada" } },
    });
  });

  test("blocked storage does not stop the course: it runs without resume", async () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const { clock, tracker } = setup({ storage: blocked });
    const session = await tracker.start();
    expect(session.resume).toEqual({ status: "empty" });
    tracker.saveState({ done: ["lesson0001"] });
    clock.advance(500);
    expect(() => tracker.exit(false)).not.toThrow();
  });

  test("the launch status and mode come from the options", async () => {
    const { tracker } = setup({
      launch: { status: { completion: "completed", success: "passed" }, totalTimeMs: 5_000 },
    });
    const session = await tracker.start();
    expect(session).toMatchObject({
      mode: "normal",
      status: { completion: "completed", success: "passed" },
      totalTimeMs: 5_000,
    });
  });
});

function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}
