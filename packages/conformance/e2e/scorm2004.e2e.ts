// A Blocks course published as SCORM 2004 4th edition in the test LMS, end to end (M1-22, M1-23,
// STD-05): launch, a lesson completed, the course closed, relaunched, resumed at the right lesson, and
// the quiz passed at 80 out of 100.
import type { Course, Question } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { RESUME_DELAY_MS } from "@course-suite/player-blocks";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { closeSco, relaunchCmi2004, runPackage } from "../src/run-package.js";
import type { ScormCall } from "../src/test-lms.js";
import { STORED, scorm2004Package } from "../test/blocks.js";

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Which of greens or browns an item is; the brown answer is right. */
const sortQuestion = (n: number, item: string): Question => ({
  id: `qsort0000${n}`,
  kind: "single-choice",
  prompt: `<p>Is ${item} a green or a brown?</p>`,
  answers: [
    { id: `abrown000${n}`, text: "Brown", correct: true },
    { id: `agreen000${n}`, text: "Green", correct: false },
  ],
});
const ITEMS = ["cardboard", "straw", "sawdust", "dry leaves", "paper"];

/** Two lessons and a five-question quiz that decides the result, reported as passed/incomplete. */
const course: Course = {
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en",
  publish: {
    standard: "scorm2004",
    scorm2004Edition: "4th",
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
      questions: ITEMS.map((item, i) => sortQuestion(i + 1, item)),
    },
  ],
  media: [],
};

const calls = (trace: ScormCall[]) => trace.map((call) => [call.method, ...call.args, call.result]);
const sets = (trace: ScormCall[]) =>
  trace.filter((call) => call.method === "SetValue").map((call) => call.args);
const gets = (trace: ScormCall[]) =>
  trace.filter((call) => call.method === "GetValue").map((call) => call.args[0]);

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

/** The launch of standards.md rule 1, after Initialize, for an LMS holding `success`/`completion`. */
const launch = (success: string, completion: string, suspendData: string) => [
  ["GetValue", "cmi.success_status", success],
  ["GetValue", "cmi.completion_status", completion],
  ["SetValue", "cmi.exit", "suspend", "true"],
  ["GetValue", "cmi.mode", "normal"],
  ["GetValue", "cmi.suspend_data", suspendData],
  ["GetValue", "cmi.success_status", success],
  ["GetValue", "cmi.completion_status", completion],
];

/** Reads that standards.md rule 1 rules out. */
const EXCLUDED = [
  "cmi.location",
  "cmi.learner_name",
  "cmi.learner_id",
  "cmi.entry",
  "cmi.launch_data",
];

test("[standards:R1] [standards:R3] [standards:R7] [standards:R9] [standards:R10] [standards:R12] [standards:R17] [rise:R2] [rise:R10] a learner completes a lesson, closes, relaunches, resumes at that lesson and passes at 80 out of 100", async ({
  browser,
}) => {
  const pkg = await scorm2004Package(course);
  expect(pkg.descriptor.kind === "scorm" && pkg.descriptor.manifest.schemaVersion).toBe(
    "2004 4th Edition",
  );

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
  expect(calls(first.trace).slice(0, 8)).toEqual([
    ["Initialize", "", "true"],
    ...launch("unknown", "unknown", ""),
  ]);
  expect(gets(first.trace).filter((element) => EXCLUDED.includes(element ?? ""))).toEqual([]);
  // The start button: success unknown, completion incomplete, committed (rule 3).
  expect(calls(first.trace).slice(8, 11)).toEqual([
    ["SetValue", "cmi.success_status", "unknown", "true"],
    ["SetValue", "cmi.completion_status", "incomplete", "true"],
    ["Commit", "", "true"],
  ]);
  expect(sets(first.trace).filter(([element]) => element === "cmi.location")).toEqual([
    ["cmi.location", "#/lessons/lessonone1"],
    ["cmi.location", "#/lessons/lessontwo1"],
  ]);
  // The exit order of standards.md rule 7: resume data saved and committed, then time, exit, terminate.
  expect(
    calls(first.trace)
      .slice(-6)
      .map(([method, element]) => `${method} ${element}`),
  ).toEqual([
    "SetValue cmi.suspend_data",
    "Commit ",
    "SetValue cmi.session_time",
    "SetValue cmi.exit",
    "Commit ",
    "Terminate ",
  ]);
  expect(first.cmi).toMatchObject({
    completion_status: "incomplete",
    success_status: "unknown",
    location: "#/lessons/lessontwo1",
    exit: "suspend",
  });
  expect(first.cmi.suspend_data).toMatch(/^1\./);

  // Second visit: the LMS hands back what it kept; the learner resumes and passes the quiz.
  const second = await runPackage(pkg, {
    browser,
    cmi: relaunchCmi2004(first.cmi),
    drive: async (sco) => {
      const resume = sco.getByRole("link", { name: "Resume where you stopped" });
      await expect(resume).toHaveAttribute("href", "#/lessons/lessontwo1");
      await expect(sco.locator(".outline-progress")).toHaveText("67% done");
      await resume.click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      await outline(sco, "Final check").click();
      await sco.getByRole("button", { name: "Begin quiz" }).click();
      // Four right and the last one wrong: 80%.
      for (const [i] of ITEMS.entries()) {
        await sco.getByRole("radio", { name: i < 4 ? "Brown" : "Green" }).check();
        await sco.getByRole("button", { name: "Submit" }).click();
        await sco
          .getByRole("button", { name: i < 4 ? "Next question" : "See your result" })
          .click();
      }
      await expect(sco.locator(".quiz-score")).toHaveText("Your score: 80%");
      await sco.getByRole("button", { name: "Exit course" }).click();
      await expect(sco.getByRole("main")).toContainText("You have left the course.");
    },
  });
  expect(second.pageErrors).toEqual([]);
  expect(second.finished).toBe(true);
  expect(calls(second.trace).slice(0, 8)).toEqual([
    ["Initialize", "", "true"],
    ...launch("unknown", "incomplete", first.cmi.suspend_data as string),
  ]);
  expect(gets(second.trace).filter((element) => EXCLUDED.includes(element ?? ""))).toEqual([]);
  // Each answer is an interaction in SCORM 2004 form (rise.md rule 10).
  expect(sets(second.trace)).toEqual(
    expect.arrayContaining([
      ["cmi.interactions.0.id", "Final_check_Is_cardboard_a_green_or_a_brown?_1"],
      ["cmi.interactions.0.type", "choice"],
      ["cmi.interactions.0.learner_response", "Brown"],
      ["cmi.interactions.0.result", "correct"],
      ["cmi.interactions.4.learner_response", "Green"],
      ["cmi.interactions.4.result", "incorrect"],
      ["cmi.interactions.4.correct_responses.0.pattern", "Brown"],
    ]),
  );
  // The pass with its score: raw, min, max and scaled, then success and completion, committed.
  const passed = calls(second.trace).findIndex(
    ([method, element, value]) =>
      method === "SetValue" && element === "cmi.success_status" && value === "passed",
  );
  expect(calls(second.trace).slice(passed - 4, passed + 3)).toEqual([
    ["SetValue", "cmi.score.raw", "80", "true"],
    ["SetValue", "cmi.score.min", "0", "true"],
    ["SetValue", "cmi.score.max", "100", "true"],
    ["SetValue", "cmi.score.scaled", "0.8", "true"],
    ["SetValue", "cmi.success_status", "passed", "true"],
    ["SetValue", "cmi.completion_status", "completed", "true"],
    ["Commit", "", "true"],
  ]);
  // The learner reached the end, so the exit value is normal (standards.md rule 8).
  expect(second.cmi).toMatchObject({
    completion_status: "completed",
    success_status: "passed",
    exit: "normal",
    score: { raw: "80", min: "0", max: "100", scaled: "0.8" },
  });
  expect(second.trace.every((call) => call.errorCode === "0")).toBe(true);
});

test("[standards:R7] [standards:R9] [rise:R3] when the resume write went out before the course closed, the exit saves time and exit value and commits once", async ({
  browser,
}) => {
  const run = await runPackage(await scorm2004Package(course), {
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
    "SetValue cmi.suspend_data",
    "SetValue cmi.session_time",
    "SetValue cmi.exit",
    "Commit ",
    "Terminate ",
  ]);
  expect(run.cmi.suspend_data).toMatch(/^1\./);
});

test("(standards.md §4.2) the SCORM 2004 host keeps 50,000 characters of suspend data and the course reads them back whole", async ({
  browser,
}) => {
  const stored = "x".repeat(50_000);
  const written = "y".repeat(50_000);
  const run = await runPackage(await scorm2004Package(course), {
    browser,
    cmi: { suspend_data: stored },
    drive: async (sco, page) => {
      await expect(sco.getByRole("link", { name: "Begin course" })).toBeVisible();
      expect(
        await sco.evaluate(
          `parent.API_1484_11.SetValue("cmi.suspend_data", ${JSON.stringify(written)})`,
        ),
      ).toBe("true");
      await closeSco(page);
    },
  });
  // Not a payload of ours, so the course starts afresh instead of failing.
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(calls(run.trace)).toContainEqual(["GetValue", "cmi.suspend_data", stored]);
  expect(run.trace).toContainEqual({
    method: "SetValue",
    args: ["cmi.suspend_data", written],
    result: "true",
    errorCode: "0",
  });
});

test("[standards:R15] [standards:P-14] a review-mode launch writes nothing once the mode is read", async ({
  browser,
}) => {
  const run = await runPackage(await scorm2004Package(course), {
    browser,
    cmi: { mode: "review", completion_status: "completed", success_status: "passed" },
    drive: async (sco) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await outline(sco, "Greens and browns").click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      await sco.getByRole("button", { name: "Exit course" }).click();
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  const mode = run.trace.findIndex((call) => call.args[0] === "cmi.mode");
  expect(run.trace[mode]?.result).toBe("review");
  // The launch sets the exit value before the mode is known (rule 1); nothing is written after it.
  expect(run.trace.filter((call) => call.method === "SetValue").map((call) => call.args)).toEqual([
    ["cmi.exit", "suspend"],
  ]);
  expect(run.trace.slice(mode).filter((call) => call.method === "SetValue")).toEqual([]);
});

test("[standards:P-4] without an LMS a SCORM 2004 package still runs and keeps nothing", async ({
  browser,
}) => {
  const run = await runPackage(await scorm2004Package(course), {
    browser,
    timeoutMs: 1_000,
    prepare: async (page) => {
      // An LMS that offers no API: the course looks for it and finds none.
      await page.addInitScript(
        'Object.defineProperty(window, "API_1484_11", { get: () => undefined, set: () => {} })',
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
