// xAPI against a real LRS (M2-21, STD-06; standards.md X-1 to X-7, §4.4): the xAPI package, exported
// with the publish panel's settings, reports to SQL LRS (compose.yaml), once speaking xAPI 2.0 and
// once to an LRS held to 1.0.3. A learner completes a lesson, closes the course, relaunches with the
// same registration, resumes from the LRS's State document and passes the quiz; another fails it.
// What the LRS stored is held to what the conformance test LMS's in-memory LRS receives from the
// same visits: the same statements in the same order, with the same verbs, objects and results.
//
// Start the LRS first: `pnpm --filter @course-suite/conformance lrs:up` (docs/ci.md).
import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { createMemoryLrs } from "../src/memory-lrs.js";
import { readPackage } from "../src/package.js";
import { runXapiPackage, TEST_LAUNCH, type XapiRun } from "../src/run-xapi.js";
import { compost, failQuiz, firstVisit, secondVisit } from "../test/compost.js";
import { exportedZip } from "../test/hosts.js";
import { LRS_20, LRS_103, type Lrs, type Statement, settledStatements } from "./lrs.js";

const course = compost("xapi");

async function xapiPackage() {
  const pkg = await readPackage(await exportedZip(course, "xapi"));
  if (!pkg.ok) throw new Error(JSON.stringify(pkg.problems));
  return pkg.value;
}

/** What a statement says, without its id, timestamp, durations or the LRS's own fields. */
function said(statement: unknown) {
  const { verb, object, result, context } = statement as Statement;
  const { duration: _, ...outcome } = result ?? {};
  return {
    verb: verb.id,
    object: object.id,
    ...(result && { result: outcome }),
    registration: context?.registration,
  };
}

/** Every request went to the package or the LRS the launch link names (standards.md rule 16). */
function onlyPackageAndLrs(run: XapiRun, lrs: Lrs) {
  expect(
    run.requests.filter(
      (url) =>
        !url.startsWith(`${run.origin}/package/`) &&
        !url.startsWith(lrs.endpoint) &&
        url !== "about:blank",
    ),
  ).toEqual([]);
}

type Visit = (page: Page) => Promise<void>;

/**
 * What the test LMS's in-memory LRS receives from `visits`, one launch each with the same
 * registration, so a relaunch resumes from the state the visit before it left; and how many
 * statements it holds after each visit.
 */
async function reference(browser: Browser, visits: Visit[], registration: string) {
  const pkg = await xapiPackage();
  const lrs = createMemoryLrs({ auth: TEST_LAUNCH.auth });
  const counts: number[] = [];
  for (const drive of visits) {
    await runXapiPackage(pkg, { browser, lrs, launch: { registration }, drive });
    counts.push(lrs.statements.length);
  }
  return { sent: lrs.statements.map(said), counts };
}

/**
 * The same visits against `lrs`: each launch reports there, and the next starts only once the LRS
 * has stored as many statements as the test LMS held after that visit.
 */
async function against(
  lrs: Lrs,
  browser: Browser,
  visits: Visit[],
  registration: string,
  counts: number[],
) {
  const pkg = await xapiPackage();
  let stored: Statement[] = [];
  for (const [i, drive] of visits.entries()) {
    const run = await runXapiPackage(pkg, {
      browser,
      launch: { endpoint: lrs.endpoint, auth: lrs.auth, registration },
      drive,
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.consoleErrors).toEqual([]);
    onlyPackageAndLrs(run, lrs);
    stored = await settledStatements(lrs, registration, counts[i] ?? 1);
  }
  return stored.map(said);
}

for (const lrs of [LRS_20, LRS_103]) {
  test(`[standards:X-1] [standards:X-2] [standards:X-3] [standards:X-4] [standards:X-6] [standards:X-7] [standards:R16] ${lrs.name}: a learner completes a lesson, closes, relaunches, resumes from the LRS's state and passes; the LRS stores every statement the test LMS receives, in order`, async ({
    browser,
  }) => {
    const visits: Visit[] = [
      (page) => firstVisit(page, course),
      async (page) => {
        await secondVisit(page, course);
        await expect(page.locator(".quiz-score")).toHaveText("Your score: 100%");
      },
    ];
    const registration = randomUUID();
    const { sent, counts } = await reference(browser, visits, registration);
    const stored = await against(lrs, browser, visits, registration, counts);
    expect(stored).toEqual(sent);
    // The course ends passed with its score (standards.md §4.4).
    expect(stored.filter((s) => s.verb.endsWith("/passed")).at(-1)).toMatchObject({
      result: { success: true, score: { scaled: 1, raw: 100, min: 0, max: 100 } },
    });
  });

  test(`[standards:X-2] [standards:X-7] ${lrs.name}: a learner who fails the quiz; the LRS stores failed with the score, as the test LMS receives it`, async ({
    browser,
  }) => {
    const registration = randomUUID();
    const { sent, counts } = await reference(browser, [failQuiz], registration);
    const stored = await against(lrs, browser, [failQuiz], registration, counts);
    expect(stored).toEqual(sent);
    expect(stored.filter((s) => s.verb.endsWith("/failed")).at(-1)).toMatchObject({
      result: { success: false, score: { scaled: 0, raw: 0 } },
    });
  });
}
