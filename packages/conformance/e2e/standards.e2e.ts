// Standards CI harness (M1-20, STD-03; standards.md §3.11 T-6, T-7): every corpus course (or the
// format's fixtures without a test-courses checkout) is built as SCORM 1.2 with the Blocks player,
// run in the test LMS along one learner path under a fake clock, and its ordered API call trace is
// compared with the golden trace committed under packages/exporters/test/golden. Any call added,
// removed, reordered or changed in value fails, and the failure shows the diff.
//
// Regenerate the goldens after an intended change with `UPDATE_GOLDEN=1 pnpm test:e2e`, and review the
// diff like code: it is what every LMS will see.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  COMMIT_INTERVAL_MS,
  pageHash,
  pagesOf,
  RESUME_DELAY_MS,
} from "@course-suite/player-blocks";
import { expect, test } from "@playwright/test";
import { closeSco, runPackage } from "../src/run-package.js";
import type { ScormCall } from "../src/test-lms.js";
import { ROOT, scorm12Package, standardsCourses } from "../test/blocks.js";

const GOLDEN = join(ROOT, "packages", "exporters", "test", "golden", "scorm12");
/** Any fixed time: the trace holds only times relative to the launch. */
const START = new Date("2026-01-05T09:00:00Z");

/** One line per call, so a failure shows a readable line diff. */
const line = (call: ScormCall) =>
  `${call.method}(${call.args.map((arg) => JSON.stringify(arg)).join(", ")}) -> ${JSON.stringify(call.result)} [${call.errorCode}]`;

for (const { name, course, media } of standardsCourses()) {
  test(`[standards:R2] [standards:R3] [standards:R5] [standards:R7] [standards:R8] [standards:R9] [rise:R1] [rise:R2] [rise:R3] [rise:R4] ${name}: launch, start, lesson change, resume writes, timed save and page-hide exit match the golden trace`, async ({
    browser,
  }) => {
    const pages = pagesOf(course);
    const run = await runPackage(await scorm12Package(course, media), {
      browser,
      // The clock stands still unless the learner path moves it, so every run is the same.
      prepare: async (page) => {
        await page.clock.install({ time: START });
        await page.clock.pauseAt(START.getTime() + 1_000);
      },
      drive: async (sco, page) => {
        // Launch, then the start button (standards.md rules 2 and 3).
        await sco.getByRole("link", { name: "Begin course" }).click();
        // The lesson must have opened before the clock moves, or its writes land at another time.
        await expect(sco.locator("h1")).toHaveText(pages[0]?.title ?? "");
        await page.clock.runFor(RESUME_DELAY_MS);
        // A lesson change: the bookmark, then the debounced resume write (rise.md rules 2 and 3).
        const next = pages[1];
        if (next) {
          await sco.evaluate(`location.hash = ${JSON.stringify(pageHash(next.id))}`);
          await expect(sco.locator("h1")).toHaveText(next.title);
        }
        await page.clock.runFor(RESUME_DELAY_MS);
        // The timed save (rise.md rule 4), then the frame closes (standards.md rules 7 to 9).
        await page.clock.runFor(COMMIT_INTERVAL_MS - 2 * RESUME_DELAY_MS);
        await closeSco(page);
      },
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.finished).toBe(true);

    const trace = run.trace.map(line);
    const file = join(GOLDEN, `${name}.json`);
    if (process.env.UPDATE_GOLDEN) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(trace, null, 2)}\n`);
    }
    expect(
      existsSync(file),
      `no golden trace at ${file}; create it with UPDATE_GOLDEN=1 pnpm test:e2e`,
    ).toBe(true);
    expect(trace).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
}
