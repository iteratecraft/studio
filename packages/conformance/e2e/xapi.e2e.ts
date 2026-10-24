// A Blocks course published as xAPI, end to end against the test LMS's in-memory LRS (M1-24, M1-25,
// STD-06): launched with the launch-link parameters, a lesson completed, the course closed,
// relaunched, resumed from the LRS state document, and the quiz passed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { expect, type Page, test } from "@playwright/test";
import { createMemoryLrs } from "../src/memory-lrs.js";
import { firstRead, runXapiPackage, TEST_LAUNCH, type XapiRun } from "../src/run-xapi.js";
import { startTestLms } from "../src/test-lms.js";
import { statementProblems } from "../src/xapi-statement.js";
import { xapiPackage } from "../test/blocks.js";

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
    standard: "xapi",
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

/** No author IRI: the course's IRI comes from its project id (standards.md E-16). */
const COURSE_IRI = `urn:uuid:${PROJECT_ID}`;

type Statement = {
  id: string;
  verb: { id: string };
  object: { id: string };
  result?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

/** `verb object` per statement, with the course IRI cut to `~`. */
const lines = (statements: unknown[]) =>
  (statements as Statement[]).map(
    (s) => `${s.verb.id.split("/").at(-1)} ${s.object.id.replace(COURSE_IRI, "~")}`,
  );

const outline = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Course contents" }).getByRole("link", { name });

/** Every request went to the package or the LRS (standards.md rule 16, ADR-0004). */
function onlyPackageAndLrs(run: XapiRun) {
  expect(
    run.requests.filter(
      (url) =>
        !url.startsWith(`${run.origin}/package/`) &&
        !url.startsWith(`${run.origin}/xapi/`) &&
        url !== "about:blank",
    ),
  ).toEqual([]);
}

/** Every statement is valid for xAPI 1.0.3 and 2.0, and none is stored twice. */
function allValid(statements: unknown[]) {
  for (const statement of statements) {
    expect(statementProblems(statement, "1.0")).toEqual([]);
    expect(statementProblems(statement, "2.0")).toEqual([]);
  }
  const ids = (statements as Statement[]).map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
}

test("[standards:X-1] [standards:X-2] [standards:X-3] [standards:X-4] [standards:X-6] [standards:R16] a learner completes a lesson, closes, relaunches, resumes from the LRS state and passes", async ({
  browser,
}) => {
  const pkg = await xapiPackage(course);
  const lrs = createMemoryLrs({ auth: TEST_LAUNCH.auth });

  // First visit: begin, finish the first lesson, open the second, close the course page.
  const first = await runXapiPackage(pkg, {
    browser,
    lrs,
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await outline(page, "Greens and browns").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
    },
  });
  expect(first.pageErrors).toEqual([]);
  expect(first.consoleErrors).toEqual([]);
  onlyPackageAndLrs(first);
  expect(lines(lrs.statements)).toEqual([
    "attempted ~",
    "experienced ~/lessonone1",
    "leave ~/lessonone1",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
  ]);
  // First attempt: completion false (standards.md §4.4); registration in every statement (X-3).
  expect(lrs.statements[0]).toMatchObject({ result: { completion: false } });
  for (const statement of lrs.statements as Statement[]) {
    expect(statement.context).toMatchObject({
      registration: TEST_LAUNCH.registration,
      language: "en",
    });
  }
  // One state document for this learner, course and registration (X-4).
  expect([...lrs.state.keys()]).toEqual([
    JSON.stringify([
      COURSE_IRI,
      JSON.stringify(TEST_LAUNCH.actor),
      TEST_LAUNCH.registration,
      "course-state",
    ]),
  ]);
  const saved = JSON.parse([...lrs.state.values()][0]?.body ?? "{}");
  expect(saved).toMatchObject({
    resume: expect.stringMatching(/^1\./),
    location: "#/lessons/lessontwo1",
    status: { completion: "incomplete", success: "unknown" },
  });
  const firstCount = lrs.statements.length;

  // Second visit with the same registration: the course resumes from the state and the quiz passes.
  const second = await runXapiPackage(pkg, {
    browser,
    lrs,
    drive: async (page) => {
      const resume = page.getByRole("link", { name: "Resume where you stopped" });
      await expect(resume).toHaveAttribute("href", "#/lessons/lessontwo1");
      await expect(page.locator(".outline-progress")).toHaveText("67% done");
      await resume.click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
      await outline(page, "Final check").click();
      await page.getByRole("button", { name: "Begin quiz" }).click();
      await page.getByRole("radio", { name: "Brown" }).check();
      await page.getByRole("button", { name: "Submit" }).click();
      await page.getByRole("button", { name: "See your result" }).click();
      await expect(page.locator(".quiz-score")).toHaveText("Your score: 100%");
      await page.getByRole("button", { name: "Exit course" }).click();
      await expect(page.getByRole("main")).toContainText("You have left the course.");
    },
  });
  expect(second.pageErrors).toEqual([]);
  expect(second.consoleErrors).toEqual([]);
  onlyPackageAndLrs(second);
  const later = lrs.statements.slice(firstCount);
  expect(lines(later)).toEqual([
    "attempted ~",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
    "experienced ~/quizfinal1",
    "answered ~/quizfinal1/qbrown0001",
    "passed ~/quizfinal1",
    "passed ~",
    "leave ~/quizfinal1",
  ]);
  const [attempted, , , , answered, quiz, passed] = later as Statement[];
  // Not the first attempt any more.
  expect(attempted).not.toHaveProperty("result");
  expect(answered?.result).toEqual({ success: true, response: "Brown" });
  expect(quiz?.result).toEqual({
    score: { scaled: 1, raw: 100, min: 0, max: 100 },
    success: true,
    completion: true,
  });
  // The course result: completed and passed with the score and the time of both visits.
  expect(passed?.result).toMatchObject({
    score: { scaled: 1, raw: 100, min: 0, max: 100 },
    success: true,
    completion: true,
    duration: expect.stringMatching(/^PT/),
  });
  allValid(lrs.statements);
  expect(JSON.parse([...lrs.state.values()][0]?.body ?? "{}")).toMatchObject({
    status: { completion: "completed", success: "passed", score: { raw: 100 } },
  });
});

test("[standards:X-7] an LRS that speaks only xAPI 1.0.3 accepts every statement and the state", async ({
  browser,
}) => {
  const run = await runXapiPackage(await xapiPackage(course), {
    browser,
    lrsOptions: { versions: ["1.0.3"] },
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await outline(page, "Greens and browns").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
    },
  });
  expect(run.consoleErrors).toEqual([]);
  expect(run.lrs.requests.filter((r) => r.status >= 300 && !firstRead(r))).toEqual([]);
  expect(lines(run.lrs.statements)).toHaveLength(5);
  expect(run.lrs.state.size).toBe(1);
});

test("[standards:X-1] a launch link without credentials sends no requests, logs one console error and the course runs", async ({
  browser,
}) => {
  const run = await runXapiPackage(await xapiPackage(course), {
    browser,
    launch: { auth: null },
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await outline(page, "Greens and browns").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.consoleErrors).toEqual([expect.stringContaining("xAPI reporting is off")]);
  expect(run.requests.filter((url) => url.includes("/xapi/"))).toEqual([]);
  expect(run.lrs.requests).toEqual([]);
});

test("[standards:X-5] with the network cut the offline banner shows; once it is back every queued statement arrives in order, once", async ({
  browser,
}) => {
  const run = await runXapiPackage(await xapiPackage(course), {
    browser,
    timeoutMs: 15_000,
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await page.route("**/xapi/**", (route) => route.abort("internetdisconnected"));
      await outline(page, "Greens and browns").click();
      await outline(page, "Why compost").click();
      // After the quick retries (2.1 s) the learner is told, in the polite live region.
      const banner = page
        .getByRole("status")
        .filter({ hasText: "cannot reach your learning records" });
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await page.unroute("**/xapi/**");
      await expect(banner).toBeHidden({ timeout: 10_000 });
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(lines(run.lrs.statements)).toEqual([
    "attempted ~",
    "experienced ~/lessonone1",
    "leave ~/lessonone1",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
    "experienced ~/lessonone1",
    "leave ~/lessonone1",
  ]);
  allValid(run.lrs.statements);
});

/** The LRS client's REQUEST_TIMEOUT_MS: a request with no answer by then is given up. */
const REQUEST_TIMEOUT_MS = 10_000;

/** A page clock the test can move on, so a request timeout does not cost real seconds. */
const fakeClock = (page: Page) => page.clock.install();

test("[standards:X-4] [standards:P-20] a state read the LRS never answers is given up: the course opens with the save notice and sends nothing", async ({
  browser,
}) => {
  let reads = 0;
  const run = await runXapiPackage(await xapiPackage(course), {
    browser,
    prepare: async (page) => {
      await fakeClock(page);
      // The LRS takes the request and never answers it.
      await page.route("**/xapi/activities/state**", () => {
        reads++;
      });
    },
    drive: async (page) => {
      await expect.poll(() => reads).toBe(1);
      // Still on the loading screen, waiting for the state.
      await expect(page.getByRole("link", { name: "Begin course" })).toHaveCount(0);
      await page.clock.runFor(REQUEST_TIMEOUT_MS);
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await expect(
        page.getByRole("status").filter({ hasText: "cannot be saved right now" }),
      ).toBeVisible();
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.consoleErrors).toEqual([expect.stringContaining("no answer in time")]);
  // One read, given up; nothing is written over a state the course could not read.
  expect(reads).toBe(1);
  expect(run.lrs.statements).toEqual([]);
  expect(run.lrs.state.size).toBe(0);
});

test("[standards:X-5] a statement request the LRS never answers is given up: the offline banner shows, and every statement then arrives in order, once", async ({
  browser,
}) => {
  const lrs = createMemoryLrs({ auth: TEST_LAUNCH.auth });
  const run = await runXapiPackage(await xapiPackage(course), {
    browser,
    lrs,
    prepare: fakeClock,
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await expect.poll(() => lrs.statements.length).toBe(2);
      // The LRS takes the next statement request and never answers it.
      let held = 0;
      await page.route(
        "**/xapi/statements**",
        () => {
          held++;
        },
        { times: 1 },
      );
      await outline(page, "Greens and browns").click();
      await expect.poll(() => held).toBe(1);
      const banner = page
        .getByRole("status")
        .filter({ hasText: "cannot reach your learning records" });
      await expect(banner).toHaveCount(0);
      await page.clock.runFor(REQUEST_TIMEOUT_MS);
      await expect(banner).toBeVisible();
      // The quick retry goes through, with what was queued behind it.
      await page.clock.runFor(1_000);
      await expect(banner).toHaveCount(0);
      await expect.poll(() => lrs.statements.length).toBe(4);
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.consoleErrors).toEqual([]);
  expect(lines(lrs.statements)).toEqual([
    "attempted ~",
    "experienced ~/lessonone1",
    "leave ~/lessonone1",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
  ]);
  allValid(lrs.statements);
});

test("[standards:X-1] a package opened from disk reports to the LRS the launch link names", async ({
  browser,
}) => {
  const pkg = await xapiPackage(course);
  const dir = mkdtempSync(join(tmpdir(), "xapi-output-"));
  const lms = await startTestLms();
  try {
    for (const name of pkg.files.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), pkg.files.read(name) as Uint8Array);
    }
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const params = new URLSearchParams({
      endpoint: lms.xapiEndpoint,
      auth: TEST_LAUNCH.auth,
      actor: JSON.stringify(TEST_LAUNCH.actor),
    });
    await page.goto(`${pathToFileURL(join(dir, pkg.launchHref)).href}?${params}`);
    await page.getByRole("link", { name: "Begin course" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
    // Leaving the page fires pagehide; the last statement goes out with keepalive, after a preflight.
    await page.goto("about:blank");
    await expect
      .poll(() => lines(lms.lrs.statements))
      .toEqual(["attempted ~", "experienced ~/lessonone1", "leave ~/lessonone1"]);
    expect(errors).toEqual([]);
    // Without a registration the statements carry none.
    expect(lms.lrs.statements[0]).not.toHaveProperty("context.registration");
    await page.close();
  } finally {
    await lms.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
