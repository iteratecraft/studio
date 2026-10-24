import type { LessonEntry } from "@course-suite/format";
import {
  type Clock,
  createMemoryAdapter,
  type KeyValueStorage,
  type MemoryAdapterOptions,
  RESUME_CAPS,
} from "@course-suite/tracking";
import { describe, expect, test } from "vitest";
import { answersOf, check, continueBlock, course, lesson, quiz, text } from "../test/courses.js";
import {
  COMMIT_INTERVAL_MS,
  courseStatus,
  RESUME_DELAY_MS,
  type RuntimeOptions,
  startRuntime,
  type TimedEvent,
} from "./runtime.js";

/** A clock that moves only when the test advances it, running timers in time order. */
function fakeClock() {
  let now = 1_000;
  let nextHandle = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock & { advance(ms: number): void } = {
    now: () => now,
    setTimeout(callback, ms) {
      timers.set(++nextHandle, { at: now + ms, callback });
      return nextHandle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
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

function mapStorage(): KeyValueStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

async function setup(
  courseValue: RuntimeOptions["course"],
  adapterOptions: MemoryAdapterOptions = {},
) {
  const clock = fakeClock();
  const adapter = createMemoryAdapter(adapterOptions);
  const runtime = await startRuntime({
    course: courseValue,
    adapter,
    clock,
    packageVersion: "1",
    resumeCap: RESUME_CAPS.scorm12,
  });
  const events: TimedEvent[] = [];
  runtime.on((event) => events.push(event));
  const calls = (method: string) => adapter.calls.filter((call) => call.method === method);
  const since = (from: number) => adapter.calls.slice(from).map((call) => call.method);
  return { clock, adapter, runtime, events, calls, since };
}

const pages = () => [lesson(text()), lesson(text(), continueBlock(), text()), lesson(text())];

describe("Blocks tracking profile", () => {
  test("[rise:R3] the saved state is written 0.1 s after the last change, once for a burst", async () => {
    const [one, two] = pages() as LessonEntry[];
    const { clock, runtime, calls } = await setup(course([one as LessonEntry, two as LessonEntry]));
    runtime.enter(one as LessonEntry);
    clock.advance(RESUME_DELAY_MS - 1);
    runtime.enter(two as LessonEntry);
    clock.advance(RESUME_DELAY_MS - 1);
    expect(calls("writeResume")).toHaveLength(0);
    clock.advance(1);
    expect(calls("writeResume")).toHaveLength(1);
    runtime.changed(); // nothing new: never written again
    clock.advance(RESUME_DELAY_MS);
    expect(calls("writeResume")).toHaveLength(1);
  });

  test("[rise:R4] session time is written and committed every 20 seconds", async () => {
    const { clock, since, adapter } = await setup(course(pages()));
    const start = adapter.calls.length;
    clock.advance(COMMIT_INTERVAL_MS - 1);
    expect(since(start)).toEqual([]);
    clock.advance(1);
    expect(since(start)).toEqual(["writeSessionTime", "commit"]);
    clock.advance(COMMIT_INTERVAL_MS);
    expect(since(start)).toEqual(["writeSessionTime", "commit", "writeSessionTime", "commit"]);
    expect(adapter.calls.at(-2)?.args).toEqual([2 * COMMIT_INTERVAL_MS]);
  });

  test("[rise:R2] [standards:R17] every lesson opened is written as the bookmark", async () => {
    const [one, two] = pages() as LessonEntry[];
    const { runtime, calls } = await setup(course([one as LessonEntry, two as LessonEntry]));
    runtime.enter(one as LessonEntry);
    runtime.enter(two as LessonEntry);
    runtime.enter(one as LessonEntry);
    expect(calls("writeLocation").map((call) => call.args[0])).toEqual([
      `#/lessons/${one?.id}`,
      `#/lessons/${two?.id}`,
      `#/lessons/${one?.id}`,
    ]);
  });

  test("[standards:R3] the start button reports the course started, once", async () => {
    const { runtime, calls, events } = await setup(course(pages()));
    expect(calls("reportStatus")).toHaveLength(0);
    runtime.begin();
    runtime.begin();
    expect(calls("reportStatus").map((call) => call.args[0])).toEqual([
      { completion: "incomplete", success: "unknown", progress: 0 },
    ]);
    expect(events.map((event) => event.type)).toEqual(["started"]);
    expect(events[0]?.at).toBe(1_000);
  });
});

describe("completion model", () => {
  test("[rise:R6] [standards:R6] by percentage: completed when every lesson is done, and committed at once", async () => {
    const list = pages();
    const { runtime, adapter, events } = await setup(course(list));
    for (const page of list) runtime.enter(page);
    const gated = list[1] as LessonEntry;
    const start = adapter.calls.length;
    runtime.enter(gated);
    expect(adapter.calls.slice(start).some((call) => call.method === "reportStatus")).toBe(false);
    // Pressing the continue block finishes the last lesson.
    runtime.progress.pressContinue(gated, gated.blocks[1] as never);
    runtime.changed();
    const report = adapter.calls.findLastIndex((call) => call.method === "reportStatus");
    expect(adapter.calls[report]?.args[0]).toMatchObject({ completion: "completed", progress: 1 });
    expect(adapter.calls[report + 1]?.method).toBe("commit");
    expect(events.filter((event) => event.type === "course-finished")).toHaveLength(1);
  });

  test("[rise:R7] 'passed' wording reports passed with completed", () => {
    const list = [lesson(text())];
    const progress = { coursePercent: () => 100, courseDone: () => true, pages: list };
    const passed = course(list, {
      publish: { standard: "scorm12", statusWording: { done: "passed", notDone: "incomplete" } },
    });
    expect(courseStatus(passed, progress as never)).toEqual({
      completion: "completed",
      success: "passed",
      progress: 1,
    });
  });

  test("[rise:R7] [rise:R8] quiz tracking: failed only with a 'failed' wording, never after a pass; best score sent", async () => {
    const entry = quiz(4, { passingScore: 50 });
    const failing = course([entry], {
      publish: {
        standard: "scorm12",
        statusWording: { done: "passed", notDone: "failed" },
        tracking: { kind: "quiz", quiz: entry.id },
      },
    });
    const { runtime, calls } = await setup(failing);
    const attempt = (right: number) => {
      const { questions } = runtime.progress.startAttempt(entry);
      questions.forEach((q, i) => {
        runtime.progress.answerQuestion(entry, q, i < right ? answersOf(q as never).right : "x");
      });
      runtime.quizSubmitted(entry, runtime.progress.submitAttempt(entry).percent);
      runtime.progress.resetQuiz(entry);
      runtime.quizRetried(entry);
    };
    runtime.begin();
    attempt(1);
    expect(calls("reportStatus").at(-1)?.args[0]).toEqual({
      completion: "incomplete",
      success: "failed",
      score: { raw: 25, min: 0, max: 100 },
      progress: 0,
    });
    attempt(3);
    attempt(0);
    expect(calls("reportStatus").at(-1)?.args[0]).toEqual({
      completion: "completed",
      success: "passed",
      score: { raw: 75, min: 0, max: 100 },
      progress: 0,
    });

    const plain = course([entry], {
      publish: { standard: "scorm12", tracking: { kind: "quiz", quiz: entry.id } },
    });
    const other = await setup(plain);
    other.runtime.begin();
    const { questions } = other.runtime.progress.startAttempt(entry);
    expect(questions).toHaveLength(4);
    other.runtime.quizSubmitted(entry, other.runtime.progress.submitAttempt(entry).percent);
    expect(other.calls("reportStatus").at(-1)?.args[0]).toMatchObject({
      completion: "incomplete",
      success: "unknown",
    });
  });

  test("[rise:R10] [rise:R11] each submitted quiz question is one interaction, numbered by attempt", async () => {
    const entry = quiz(1);
    const { runtime, calls } = await setup(course([entry]));
    runtime.begin();
    const [question] = runtime.progress.startAttempt(entry).questions;
    if (!question) throw new Error("no question");
    const { right } = answersOf(question as never);
    runtime.progress.answerQuestion(entry, question, right);
    runtime.answered(entry, question, right);
    runtime.progress.submitAttempt(entry);
    runtime.progress.resetQuiz(entry);
    runtime.progress.startAttempt(entry);
    runtime.answered(entry, question, undefined);
    const prompt = question.prompt.replace(/<[^>]*>/g, "");
    expect(calls("reportInteraction").map((call) => call.args[0])).toMatchObject(
      [
        { type: "choice", weighting: 1, result: "correct", id: `${entry.title}_${prompt}_1` },
        { type: "choice", weighting: 1, result: "incorrect", id: `${entry.title}_${prompt}_2` },
      ].map((interaction) => ({ ...interaction, id: interaction.id.replaceAll(" ", "_") })),
    );
  });
});

describe("session end", () => {
  test("[standards:R7] [standards:R8] exit before the end: status, pending state, time, suspend, commit, terminate", async () => {
    const list = pages();
    const { runtime, adapter, events, clock } = await setup(course(list));
    runtime.enter(list[0] as LessonEntry);
    const start = adapter.calls.length;
    clock.advance(5);
    runtime.exit("exit");
    runtime.exit("page-hide");
    expect(adapter.calls.slice(start).map((call) => call.method)).toEqual([
      "writeResume",
      "commit",
      "writeSessionTime",
      "setExit",
      "commit",
      "terminate",
    ]);
    expect(adapter.calls.find((call) => call.method === "setExit")?.args).toEqual(["suspend"]);
    expect(events.map((event) => [event.type, event.at])).toEqual([
      ["started", 1_000],
      ["page-entered", 1_000],
      ["page-left", 1_005],
      ["exit", 1_005],
    ]);
    expect(runtime.ended).toBe(true);
  });

  test("[standards:R8] [standards:R9] page-hide at the end of the course exits normally", async () => {
    const list = [lesson(text())];
    const { runtime, calls, events } = await setup(course(list));
    runtime.enter(list[0] as LessonEntry);
    runtime.exit("page-hide");
    expect(calls("setExit")[0]?.args).toEqual(["normal"]);
    expect(events.at(-1)).toMatchObject({ type: "page-hide", reachedEnd: true });
  });
});

describe("resume", () => {
  test("a new session resumes progress, quiz draws and the page, without content an update removed", async () => {
    const storage = mapStorage();
    const kc = check(true);
    const entry = quiz(3);
    const list = [lesson(kc, text()), entry, lesson(text())];
    const first = await setup(course(list), { storage });
    first.runtime.enter(list[0] as LessonEntry);
    first.runtime.progress.answerCheck(
      list[0] as LessonEntry,
      kc,
      answersOf(kc.question as never).right,
      true,
    );
    first.runtime.enter(entry);
    const attempt = first.runtime.progress.startAttempt(entry);
    first.runtime.changed();
    first.runtime.exit("page-hide");

    // The update removed the last lesson; its id would be in the saved state if it were kept.
    const second = await setup(course(list.slice(0, 2)), { storage });
    expect(second.runtime.resumeAt).toBe(entry);
    expect(second.runtime.progress.status(list[0] as LessonEntry)).toBe("done");
    expect(second.runtime.progress.quiz(entry).attempt?.questions).toEqual(attempt.questions);
  });

  test("a stored state that is not ours is ignored and the course starts fresh", async () => {
    const storage = mapStorage();
    storage.setItem("course.resume", "not a payload");
    const { runtime } = await setup(course(pages()), { storage });
    expect(runtime.progress.coursePercent()).toBe(0);
    expect(runtime.resumeAt).toBeUndefined();
  });
});

describe("save failures", () => {
  test("an LMS call that throws shows the save-failed notice once and never stops the course", async () => {
    const list = pages();
    const adapter = createMemoryAdapter();
    adapter.writeLocation = () => {
      throw new Error("LMS gone");
    };
    const runtime = await startRuntime({
      course: course(list),
      adapter,
      packageVersion: "1",
      resumeCap: RESUME_CAPS.scorm12,
      clock: fakeClock(),
    });
    const events: string[] = [];
    runtime.on((event) => events.push(event.type));
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (error: unknown) => errors.push(error);
    try {
      runtime.enter(list[0] as LessonEntry);
      runtime.enter(list[2] as LessonEntry);
    } finally {
      console.error = original;
    }
    expect(events.filter((type) => type === "save-failed")).toHaveLength(1);
    expect(runtime.saveFailed).toBe(true);
    expect(errors).toHaveLength(2);
    expect(runtime.progress.isDone((list[2] as LessonEntry).id)).toBe(true);
  });

  test("a state over the target's cap shows the save-failed notice", async () => {
    const entry = quiz(400);
    const clock = fakeClock();
    const runtime = await startRuntime({
      course: course([entry]),
      adapter: createMemoryAdapter(),
      packageVersion: "1",
      resumeCap: 200,
      clock,
    });
    const events: string[] = [];
    runtime.on((event) => events.push(event.type));
    runtime.enter(entry);
    runtime.progress.startAttempt(entry);
    runtime.changed();
    clock.advance(RESUME_DELAY_MS);
    expect(events).toContain("save-failed");
  });
});
