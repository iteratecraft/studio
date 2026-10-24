// Standards CI harness (M1-20, STD-03; standards.md §3.11 T-6, T-7): every corpus course (or the
// format's fixtures without a test-courses checkout) is built as SCORM 1.2 with the Blocks player,
// run in the test LMS along one learner path under a fake clock, and its ordered API call trace is
// compared with the golden trace committed under packages/exporters/test/golden. Any call added,
// removed, reordered or changed in value fails, and the failure shows the diff. The same courses
// built as xAPI walk the same path against the in-memory LRS; their golden is the statements the
// LRS stored, in order, and the state document it holds (STD-06).
//
// Regenerate the goldens after an intended change with `UPDATE_GOLDEN=1 pnpm test:e2e`, and review the
// diff like code: it is what every LMS will see.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Course } from "@course-suite/format";
import {
  COMMIT_INTERVAL_MS,
  pageHash,
  pagesOf,
  RESUME_DELAY_MS,
} from "@course-suite/player-blocks";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { closeSco, runPackage } from "../src/run-package.js";
import { firstRead, runXapiPackage } from "../src/run-xapi.js";
import type { ScormCall } from "../src/test-lms.js";
import { statementProblems } from "../src/xapi-statement.js";
import { ROOT, scorm12Package, standardsCourses, xapiPackage } from "../test/blocks.js";

const GOLDEN = join(ROOT, "packages", "exporters", "test", "golden", "scorm12");
const XAPI_GOLDEN = join(ROOT, "packages", "exporters", "test", "golden", "xapi");
/** Any fixed time: the trace holds only times relative to the launch. */
const START = new Date("2026-01-05T09:00:00Z");

/** One line per call, so a failure shows a readable line diff. */
const line = (call: ScormCall) =>
  `${call.method}(${call.args.map((arg) => JSON.stringify(arg)).join(", ")}) -> ${JSON.stringify(call.result)} [${call.errorCode}]`;

/** Compares `value` with the golden file, or writes it with UPDATE_GOLDEN=1. */
function matchGolden(file: string, value: unknown) {
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  expect(
    existsSync(file),
    `no golden at ${file}; create it with UPDATE_GOLDEN=1 pnpm test:e2e`,
  ).toBe(true);
  expect(value).toEqual(JSON.parse(readFileSync(file, "utf8")));
}

/** Freezes the page clock: it moves only when the learner path moves it, so every run is the same. */
async function freezeClock(page: Page) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(START.getTime() + 1_000);
}

/**
 * The learner path both standards walk: the start button, the first lesson, a lesson change, the
 * debounced resume write and the timed save (standards.md rules 3 to 5; rise.md rules 2 to 4).
 */
async function walk(course: Course, content: Page | Frame, page: Page) {
  const pages = pagesOf(course);
  await content.getByRole("link", { name: "Begin course" }).click();
  // The lesson must have opened before the clock moves, or its writes land at another time.
  await expect(content.locator("h1")).toHaveText(pages[0]?.title ?? "");
  await page.clock.runFor(RESUME_DELAY_MS);
  const next = pages[1];
  if (next) {
    await content.evaluate(`location.hash = ${JSON.stringify(pageHash(next.id))}`);
    await expect(content.locator("h1")).toHaveText(next.title);
  }
  await page.clock.runFor(RESUME_DELAY_MS);
  await page.clock.runFor(COMMIT_INTERVAL_MS - 2 * RESUME_DELAY_MS);
}

for (const { name, course, media } of standardsCourses()) {
  test(`[standards:R2] [standards:R3] [standards:R5] [standards:R7] [standards:R8] [standards:R9] [rise:R1] [rise:R2] [rise:R3] [rise:R4] ${name}: launch, start, lesson change, resume writes, timed save and page-hide exit match the golden trace`, async ({
    browser,
  }) => {
    const run = await runPackage(await scorm12Package(course, media), {
      browser,
      prepare: freezeClock,
      drive: async (sco, page) => {
        await walk(course, sco, page);
        // Then the frame closes (standards.md rules 7 to 9).
        await closeSco(page);
      },
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.finished).toBe(true);
    matchGolden(join(GOLDEN, `${name}.json`), run.trace.map(line));
  });
}

for (const { name, course, media } of standardsCourses("xapi")) {
  test(`[standards:X-2] [standards:X-3] [standards:X-4] [standards:X-6] [standards:R16] ${name}: as xAPI, launch, start, lesson change, timed save and closing match the golden statements and state`, async ({
    browser,
  }) => {
    const run = await runXapiPackage(await xapiPackage(course, media), {
      browser,
      prepare: freezeClock,
      drive: (page) => walk(course, page, page),
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.consoleErrors).toEqual([]);
    expect(
      run.lrs.requests.filter((request) => request.status >= 300 && !firstRead(request)),
    ).toEqual([]);
    // Every statement is valid in xAPI 1.0.3 and 2.0 (STD-06).
    for (const statement of run.lrs.statements) {
      expect(statementProblems(statement, "1.0")).toEqual([]);
      expect(statementProblems(statement, "2.0")).toEqual([]);
    }
    // Statement ids are random: the golden numbers them, after checking that none repeats.
    const ids = run.lrs.statements.map((statement) => statement.id);
    expect(new Set(ids).size).toBe(ids.length);
    const statements = run.lrs.statements.map(({ stored: _, ...statement }) => ({
      ...statement,
      id: `<statement ${ids.indexOf(statement.id) + 1}>`,
    }));
    const state = Object.fromEntries(
      [...run.lrs.state].map(([key, document]) => [
        JSON.parse(key).at(-1),
        JSON.parse(document.body),
      ]),
    );
    matchGolden(join(XAPI_GOLDEN, `${name}.json`), { statements, state });
  });
}
