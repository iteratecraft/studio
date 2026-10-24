// A Blocks course published as SCORM 1.2 in the test LMS, end to end (M1-19, STD-04): launch, a
// lesson completed, the course closed, relaunched, resumed at the right lesson, and the quiz passed.
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { RESUME_DELAY_MS } from "@course-suite/player-blocks";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import type { ScormCall } from "../src/test-lms.js";
import { STORED, scorm12Package } from "../test/blocks.js";

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Two lessons and a quiz that decides the result, reported as passed/incomplete with a score. */
const course: Course = {
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en",
  publish: {
    standard: "scorm12",
    statusWording: { done: "passed", notDone: "incomplete" },
    passingScore: 80,
    tracking: { kind: "quiz", quiz: "quizfinal1" },
    exitLink: true,
  },
  entries: [
    {
      id: "lessonone1",
      kind: "lesson",
      title: "Why compost",
      blocks: [paragraph("tpara00001", "Compost feeds the soil.")],
    },
    {
      id: "lessontwo1",
      kind: "lesson",
      title: "Greens and browns",
      blocks: [paragraph("tpara00002", "Mix wet greens with dry browns.")],
    },
    {
      id: "quizfinal1",
      kind: "quiz",
      title: "Final check",
      questions: [
        {
          id: "qbrown0001",
          kind: "single-choice",
          prompt: "<p>Is cardboard a green or a brown?</p>",
          answers: [
            { id: "abrown0001", text: "Brown", correct: true },
            { id: "agreen0001", text: "Green", correct: false },
          ],
        },
      ],
    },
  ],
  media: [],
};

const calls = (trace: ScormCall[]) => trace.map((call) => [call.method, ...call.args, call.result]);
const sets = (trace: ScormCall[]) =>
  trace.filter((call) => call.method === "LMSSetValue").map((call) => call.args);

const outline = (sco: Frame, name: string) =>
  sco.getByRole("navigation", { name: "Course contents" }).getByRole("link", { name });

/**
 * Stops the course's timers until the learner path moves them, so whether the debounced resume write
 * is still pending at exit is decided by the test, not by how busy the machine is.
 */
const pauseClock = async (page: Page) => {
  await page.clock.install({ time: new Date("2026-01-05T09:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-05T09:00:01Z"));
};

test("[standards:R2] [standards:R7] [standards:R9] [rise:R1] [rise:R2] [rise:R7] [rise:R8] [rise:R10] a learner completes a lesson, closes, relaunches, resumes at that lesson and passes", async ({
  browser,
}) => {
  const pkg = await scorm12Package(course);

  // First visit: begin, finish the first lesson, open the second, close the course frame.
  const first = await runPackage(pkg, {
    browser,
    // The debounced resume write is still pending when the frame closes, so the exit path makes it.
    prepare: pauseClock,
    drive: async (sco, page) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await outline(sco, "Greens and browns").click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      // Removing the frame is a page-hide without an exit link (standards.md rule 9).
      await closeSco(page);
    },
  });
  expect(first.pageErrors).toEqual([]);
  expect(first.finished).toBe(true);
  expect(calls(first.trace).slice(0, 7)).toEqual([
    ["LMSInitialize", "", "true"],
    ["LMSGetValue", "cmi.core.lesson_mode", "normal"],
    ["LMSGetValue", "cmi.core.lesson_status", "not attempted"],
    ["LMSSetValue", "cmi.core.lesson_status", "incomplete", "true"],
    ["LMSSetValue", "cmi.core.exit", "suspend", "true"],
    ["LMSGetValue", "cmi.suspend_data", ""],
    ["LMSGetValue", "cmi.core.lesson_location", ""],
  ]);
  expect(sets(first.trace).filter(([element]) => element === "cmi.core.lesson_location")).toEqual([
    ["cmi.core.lesson_location", "#/lessons/lessonone1"],
    ["cmi.core.lesson_location", "#/lessons/lessontwo1"],
  ]);
  // The exit order of standards.md rule 7: resume data saved and committed, then time, exit, finish.
  expect(
    calls(first.trace)
      .slice(-6)
      .map(([method, element]) => `${method} ${element}`),
  ).toEqual([
    "LMSSetValue cmi.suspend_data",
    "LMSCommit ",
    "LMSSetValue cmi.core.session_time",
    "LMSSetValue cmi.core.exit",
    "LMSCommit ",
    "LMSFinish ",
  ]);
  const core = first.cmi.core as Record<string, unknown>;
  expect(core).toMatchObject({
    lesson_status: "incomplete",
    lesson_location: "#/lessons/lessontwo1",
    exit: "suspend",
  });
  expect(first.cmi.suspend_data).toMatch(/^1\./);

  // Second visit: the LMS hands back what it kept; the learner resumes and passes the quiz.
  const second = await runPackage(pkg, {
    browser,
    cmi: relaunchCmi(first.cmi),
    drive: async (sco) => {
      const resume = sco.getByRole("link", { name: "Resume where you stopped" });
      await expect(resume).toHaveAttribute("href", "#/lessons/lessontwo1");
      await expect(sco.locator(".outline-progress")).toHaveText("67% done");
      await resume.click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      await outline(sco, "Final check").click();
      await sco.getByRole("button", { name: "Begin quiz" }).click();
      await sco.getByRole("radio", { name: "Brown" }).check();
      await sco.getByRole("button", { name: "Submit" }).click();
      await sco.getByRole("button", { name: "See your result" }).click();
      await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
      await sco.getByRole("button", { name: "Exit course" }).click();
      await expect(sco.getByRole("main")).toContainText("You have left the course.");
    },
  });
  expect(second.pageErrors).toEqual([]);
  expect(second.finished).toBe(true);
  expect(calls(second.trace).slice(0, 6)).toEqual([
    ["LMSInitialize", "", "true"],
    ["LMSGetValue", "cmi.core.lesson_mode", "normal"],
    ["LMSGetValue", "cmi.core.lesson_status", "incomplete"],
    ["LMSSetValue", "cmi.core.exit", "suspend", "true"],
    ["LMSGetValue", "cmi.suspend_data", first.cmi.suspend_data],
    ["LMSGetValue", "cmi.core.lesson_location", "#/lessons/lessontwo1"],
  ]);
  // The answer is an interaction (rise.md rule 10); the pass is reported with its score, committed.
  expect(sets(second.trace)).toEqual(
    expect.arrayContaining([
      ["cmi.interactions.0.id", "Final_check_Is_cardboard_a_green_or_a_brown?_1"],
      ["cmi.interactions.0.type", "choice"],
      ["cmi.interactions.0.student_response", "Brown"],
      ["cmi.interactions.0.result", "correct"],
    ]),
  );
  const passed = calls(second.trace).findIndex(
    ([method, element, value]) =>
      method === "LMSSetValue" && element === "cmi.core.lesson_status" && value === "passed",
  );
  expect(calls(second.trace).slice(passed - 3, passed + 2)).toEqual([
    ["LMSSetValue", "cmi.core.score.raw", "100", "true"],
    ["LMSSetValue", "cmi.core.score.min", "0", "true"],
    ["LMSSetValue", "cmi.core.score.max", "100", "true"],
    ["LMSSetValue", "cmi.core.lesson_status", "passed", "true"],
    ["LMSCommit", "", "true"],
  ]);
  // The learner reached the end, so the exit value is empty (standards.md rule 8).
  expect(second.cmi.core).toMatchObject({
    lesson_status: "passed",
    exit: "",
    score: { raw: "100", min: "0", max: "100" },
  });
});

test("[standards:R7] [standards:R9] [rise:R3] when the resume write went out before the course closed, the exit saves time and exit value and commits once", async ({
  browser,
}) => {
  const run = await runPackage(await scorm12Package(course), {
    browser,
    prepare: pauseClock,
    drive: async (sco, page) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await outline(sco, "Greens and browns").click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      // The debounced resume write fires, so nothing is pending when the frame closes.
      await page.clock.runFor(RESUME_DELAY_MS);
      await closeSco(page);
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(
    calls(run.trace)
      .slice(-5)
      .map(([method, element]) => `${method} ${element}`),
  ).toEqual([
    "LMSSetValue cmi.suspend_data",
    "LMSSetValue cmi.core.session_time",
    "LMSSetValue cmi.core.exit",
    "LMSCommit ",
    "LMSFinish ",
  ]);
  expect(run.cmi.suspend_data).toMatch(/^1\./);
});

test("[standards:R15] [standards:P-14] a review-mode launch makes zero LMSSetValue calls", async ({
  browser,
}) => {
  const run = await runPackage(await scorm12Package(course), {
    browser,
    cmi: { core: { lesson_mode: "review", lesson_status: "passed" } },
    drive: async (sco) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await outline(sco, "Greens and browns").click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      await sco.getByRole("button", { name: "Exit course" }).click();
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(run.trace.filter((call) => call.method === "LMSSetValue")).toEqual([]);
});

test("[standards:P-4] without an LMS a SCORM 1.2 package still runs and keeps nothing", async ({
  browser,
}) => {
  const run = await runPackage(await scorm12Package(course), {
    browser,
    timeoutMs: 1_000,
    prepare: async (page) => {
      // An LMS that offers no API: the course looks for it and finds none.
      await page.addInitScript(
        'Object.defineProperty(window, "API", { get: () => undefined, set: () => {} })',
      );
    },
    drive: async (sco) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      // Nothing on the device either (ADR-0005).
      expect(await sco.evaluate(STORED)).toBe(0);
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.trace).toEqual([]);
  expect(run.finished).toBe(false);
});
