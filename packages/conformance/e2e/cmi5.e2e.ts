// A Blocks course published as cmi5, end to end against the test LMS's cmi5 launcher and in-memory
// LRS (M1-26, M1-27, STD-07): a Normal launch that is closed and resumed and then passes and returns
// to the LMS, a failed attempt, Browse and Review launches, and a fetch URL that gives no token or
// never answers.
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { expect, type Page, test } from "@playwright/test";
import { createMemoryLrs } from "../src/memory-lrs.js";
import { firstRead, runXapiPackage, type XapiRun } from "../src/run-xapi.js";
import { TEST_CMI5, TEST_CMI5_AUTH } from "../src/test-lms.js";
import { statementProblems } from "../src/xapi-statement.js";
import { cmi5Package } from "../test/blocks.js";

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Two lessons and a quiz that decides the result; passing score 80, so mastery 0.8. */
const course: Course = {
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en",
  publish: {
    standard: "cmi5",
    statusWording: { done: "passed", notDone: "incomplete" },
    passingScore: 80,
    tracking: { kind: "quiz", quiz: "quizfinal1" },
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

const COURSE_IRI = `urn:uuid:${PROJECT_ID}`;
const CMI5 = "https://w3id.org/xapi/cmi5";
const SESSION = `${CMI5}/context/extensions/sessionid`;

type Statement = {
  id: string;
  verb: { id: string };
  object: { id: string };
  result?: { duration?: string; extensions?: Record<string, unknown> } & Record<string, unknown>;
  context?: {
    contextActivities?: Record<string, { id: string }[]>;
    extensions?: Record<string, unknown>;
  };
  timestamp: string;
};

/** `verb object` per statement, the course IRI cut to `~` and the LMS's AU id to `AU`. */
const lines = (statements: unknown[]) =>
  (statements as Statement[]).map(
    (s) =>
      `${s.verb.id.split("/").at(-1)} ${s.object.id.replace(COURSE_IRI, "~").replace(TEST_CMI5.activityId, "AU")}`,
  );

const outline = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Course contents" }).getByRole("link", { name });

/** Every request went to the package, the LRS, the fetch URL or the return page (rule 16). */
function onlyLms(run: XapiRun) {
  expect(
    run.requests.filter(
      (url) =>
        !["/package/", "/xapi/", "/cmi5/"].some((path) => url.startsWith(`${run.origin}${path}`)) &&
        url !== "about:blank",
    ),
  ).toEqual([]);
}

/** Valid for xAPI 1.0.3 and 2.0, every id once, and in timestamp order (cmi5 §9.3). */
function allValid(statements: unknown[]) {
  for (const statement of statements) {
    expect(statementProblems(statement, "1.0")).toEqual([]);
    expect(statementProblems(statement, "2.0")).toEqual([]);
  }
  const list = statements as Statement[];
  expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
}

/** The statements the AU sent, without the LMS's launched. */
const fromAu = (statements: unknown[]) =>
  (statements as Statement[]).filter((s) => !s.verb.id.endsWith("/launched"));

async function passQuiz(page: Page, answer: "Brown" | "Green") {
  await outline(page, "Final check").click();
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await page.getByRole("radio", { name: answer }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "See your result" }).click();
}

test("[standards:C-1] [standards:C-2] [standards:C-4] [standards:C-5] [standards:C-6] [standards:C-7] [standards:C-8] [standards:C-9] [standards:R14] [standards:R16] a learner starts, closes, resumes from the AU state, passes and returns to the LMS", async ({
  browser,
}) => {
  const pkg = await cmi5Package(course);
  const lrs = createMemoryLrs({ auth: TEST_CMI5_AUTH });

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
  onlyLms(first);
  // One POST to the fetch URL per launch, and it gave the token (cmi5 §8.2).
  expect(first.fetches).toEqual([expect.stringMatching(/^POST \/cmi5\/fetch\/\S+ token$/)]);
  expect(lines(lrs.statements)).toEqual([
    "launched AU",
    "initialized AU",
    "attempted AU",
    "experienced ~/lessonone1",
    "leave ~/lessonone1",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
    "terminated AU",
  ]);
  const session1 = fromAu(lrs.statements);
  for (const statement of session1) {
    expect(statement.context?.extensions?.[SESSION]).toBe(`${TEST_CMI5.registration}-1`);
    expect(statement.context?.contextActivities?.grouping).toEqual([{ id: `${COURSE_IRI}/au` }]);
  }
  expect(session1[0]?.context?.contextActivities?.category).toEqual([
    { id: `${CMI5}/context/categories/cmi5` },
  ]);
  expect(session1[1]?.context?.contextActivities).not.toHaveProperty("category");
  // The 0-100 progress extension on the allowed statements, growing as lessons are done.
  const progress = session1
    .slice(1, -1)
    .map((s) => s.result?.extensions?.[`${CMI5}/result/extensions/progress`]);
  expect(progress).toEqual([undefined, 0, 33, 33, 67]);
  expect(session1.at(-1)?.result?.duration).toMatch(/^PT/);
  const firstCount = lrs.statements.length;

  const second = await runXapiPackage(pkg, {
    browser,
    lrs,
    drive: async (page) => {
      const resume = page.getByRole("link", { name: "Resume where you stopped" });
      await expect(resume).toHaveAttribute("href", "#/lessons/lessontwo1");
      await resume.click();
      await passQuiz(page, "Brown");
      await expect(page.locator(".quiz-score")).toHaveText("Your score: 100%");
      // The launch data names a return page, so the course offers an exit button that goes there.
      await page.getByRole("button", { name: "Exit course" }).click();
      await expect(page).toHaveURL(/\/cmi5\/return$/);
    },
  });
  expect(second.pageErrors).toEqual([]);
  expect(second.consoleErrors).toEqual([]);
  onlyLms(second);
  expect(second.fetches).toHaveLength(1);
  const later = lrs.statements.slice(firstCount);
  expect(lines(later)).toEqual([
    "launched AU",
    "initialized AU",
    "attempted AU",
    "experienced ~/lessontwo1",
    "leave ~/lessontwo1",
    "experienced ~/quizfinal1",
    "answered ~/quizfinal1/qbrown0001",
    "completed AU",
    "passed AU",
    "leave ~/quizfinal1",
    "terminated AU",
  ]);
  const byVerb = (verb: string) => fromAu(later).find((s) => s.verb.id.endsWith(`/${verb}`));
  const moveOn = [
    { id: `${CMI5}/context/categories/cmi5` },
    { id: `${CMI5}/context/categories/moveon` },
  ];
  expect(byVerb("completed")).toMatchObject({
    result: { completion: true, duration: expect.stringMatching(/^PT/) },
    context: { contextActivities: { category: moveOn } },
  });
  expect(byVerb("passed")).toMatchObject({
    result: { score: { scaled: 1, raw: 100, min: 0, max: 100 }, success: true },
    context: {
      contextActivities: { category: moveOn },
      extensions: {
        [`${CMI5}/context/extensions/masteryscore`]: 0.8,
        [SESSION]: `${TEST_CMI5.registration}-2`,
      },
    },
  });
  // No progress once completed (cmi5 §9.5.5.1).
  expect(byVerb("terminated")?.result).not.toHaveProperty("extensions");
  allValid(lrs.statements);
  const timestamps = fromAu(later).map((s) => s.timestamp);
  expect([...timestamps].sort()).toEqual(timestamps);
});

test("[standards:C-4] [standards:C-6] a failed quiz is reported as failed just before terminated", async ({
  browser,
}) => {
  const run = await runXapiPackage(await cmi5Package(course), {
    browser,
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await passQuiz(page, "Green");
      await expect(page.locator(".quiz-score")).toHaveText("Your score: 0%");
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(lines(run.lrs.statements).slice(-4)).toEqual([
    "answered ~/quizfinal1/qbrown0001",
    "leave ~/quizfinal1",
    "failed AU",
    "terminated AU",
  ]);
  expect(
    fromAu(run.lrs.statements).find((s) => s.verb.id.endsWith("/failed"))?.result,
  ).toMatchObject({
    score: { scaled: 0 },
    success: false,
  });
  expect(lines(run.lrs.statements)).not.toContain("completed AU");
  allValid(run.lrs.statements);
});

for (const launchMode of ["Browse", "Review"] as const) {
  test(`[standards:C-3] a ${launchMode} launch sends exactly initialized then terminated and writes no state`, async ({
    browser,
  }) => {
    const run = await runXapiPackage(await cmi5Package(course), {
      browser,
      cmi5: { launchMode },
      drive: async (page) => {
        await page.getByRole("link", { name: "Begin course" }).click();
        await outline(page, "Greens and browns").click();
        await passQuiz(page, "Brown");
      },
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.consoleErrors).toEqual([]);
    expect(lines(fromAu(run.lrs.statements))).toEqual(["initialized AU", "terminated AU"]);
    expect(run.lrs.requests.filter((r) => r.method === "PUT")).toEqual([]);
    expect(run.lrs.requests.filter((r) => r.status >= 300 && !firstRead(r))).toEqual([]);
  });
}

test("[standards:C-1] a fetch URL that gives no token stops reporting, shows the notice and the course runs", async ({
  browser,
}) => {
  const run = await runXapiPackage(await cmi5Package(course), {
    browser,
    cmi5: { refuseFetch: true },
    drive: async (page) => {
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await expect(page.getByRole("status").filter({ hasText: "cannot be saved" })).toBeVisible();
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.fetches).toEqual([expect.stringMatching(/ 2$/)]);
  expect(run.consoleErrors).toEqual([expect.stringContaining("no session credentials")]);
  expect(run.lrs.requests).toEqual([]);
  expect(lines(run.lrs.statements)).toEqual(["launched AU"]);
});

/** The LRS client's REQUEST_TIMEOUT_MS, shared by the fetch URL POST. */
const REQUEST_TIMEOUT_MS = 10_000;

test("[standards:C-1] [standards:P-20] a fetch URL that never answers is given up after 10 s: reporting is off, the notice shows and the course runs", async ({
  browser,
}) => {
  let posts = 0;
  const run = await runXapiPackage(await cmi5Package(course), {
    browser,
    prepare: async (page) => {
      // A page clock the test moves on, so the timeout does not cost real seconds.
      await page.clock.install();
      // The LMS takes the POST to the fetch URL and never answers it.
      await page.route("**/cmi5/fetch/**", () => {
        posts++;
      });
    },
    drive: async (page) => {
      await expect.poll(() => posts).toBe(1);
      // Still on the loading screen, waiting for the credentials.
      await expect(page.getByRole("link", { name: "Begin course" })).toHaveCount(0);
      await page.clock.runFor(REQUEST_TIMEOUT_MS);
      await page.getByRole("link", { name: "Begin course" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why compost");
      await expect(page.getByRole("status").filter({ hasText: "cannot be saved" })).toBeVisible();
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.consoleErrors).toEqual([
    expect.stringContaining("no session credentials: no answer in time"),
  ]);
  // One POST, held by the route, so the test LMS never saw it; no LRS request without credentials.
  expect(posts).toBe(1);
  expect(run.fetches).toEqual([]);
  expect(run.lrs.requests).toEqual([]);
  expect(lines(run.lrs.statements)).toEqual(["launched AU"]);
});
