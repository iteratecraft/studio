// Player performance budget (M2-21, D-26; ENG-04 "Bundle size and first load"): a large course,
// published as a plain web package and opened from disk, must show its cover within the time budget
// and hold no more JavaScript heap than the memory budget once it has. The script and style sheet
// sizes are gated in @course-suite/exporters (src/player-budget.test.ts).
//
// Budgets: the median of three loads on the CI runner (windows-latest) on 2026-10-29 (cover in
// 168 ms, single loads 120 to 203 ms; 3.04 MB of heap), with a margin for a shared runner's noise:
// three times the time, and the heap plus half, rounded up to a whole MiB (docs/ci.md, "Player
// performance budget"). Raise one only with a reviewed reason in the pull request.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Course, type Entry, validateCourse } from "@course-suite/format";
import { interactiveBlocksCourse, staticBlocksCourse } from "@course-suite/format/test/courses";
import { readZip } from "@course-suite/zip";
import { expect, type Page, test } from "@playwright/test";
import { webZip } from "../test/blocks.js";

/** The budgets, in milliseconds and bytes. */
const BUDGET = {
  /** From navigation start until the cover's begin link is in the page. */
  coverMs: 500,
  /** JavaScript heap in use after a garbage collection, with the cover shown. */
  heapBytes: 5 * 1024 * 1024,
};

/** How many times the lessons of the two block fixtures are repeated. */
const COPIES = 20;

/**
 * A large course: the lessons of the static and interactive block fixtures, `COPIES` times over,
 * each copy with its own content ids (references inside a copy follow its renamed ids).
 */
function largeCourse(): Course {
  const sources = [staticBlocksCourse(), interactiveBlocksCourse()];
  const lessons = sources.flatMap((course) => course.entries.filter((e) => e.kind === "lesson"));
  let next = 0;
  const entries: Entry[] = [];
  for (let copy = 0; copy < COPIES; copy++) {
    const renamed = new Map<string, string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === "object" && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          if (key === "id" && typeof child === "string") {
            renamed.set(child, `p${(next++).toString(36).padStart(9, "0")}`);
          } else collect(child);
        }
      }
    };
    collect(lessons);
    const rename = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(rename)
        : typeof value === "object" && value !== null
          ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rename(child)]))
          : typeof value === "string"
            ? (renamed.get(value) ?? value)
            : value;
    entries.push(...(rename(lessons) as Entry[]));
  }
  const media = [...new Map(sources.flatMap((c) => c.media).map((m) => [m.id, m])).values()];
  const course: Course = {
    ...sources[0],
    title: "A large course",
    entries,
    media,
  } as Course;
  const problems = validateCourse(course);
  if (problems.length > 0) throw new Error(JSON.stringify(problems.slice(0, 5), null, 2));
  return course;
}

let dir = "";

test.beforeAll(async () => {
  const zip = await readZip(await webZip(largeCourse()));
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  dir = mkdtempSync(join(tmpdir(), "player-budget-"));
  for (const name of zip.value.names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
  }
});

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** One load of the course: when its cover was ready, and the heap in use then. */
async function load(page: Page) {
  // Records the moment the begin link first appears, without waiting on the test's own polling.
  await page.addInitScript(() => {
    const seen = () => {
      if (document.querySelector('a[href^="#/lessons/"]')) {
        (window as unknown as { coverReady: number }).coverReady = performance.now();
        return true;
      }
      return false;
    };
    new MutationObserver((_, observer) => {
      if (seen()) observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(pathToFileURL(join(dir, "index.html")).href);
  await expect(page.getByRole("link", { name: "Begin course" })).toBeVisible();
  const coverMs = await page.evaluate(
    () => (window as unknown as { coverReady: number }).coverReady,
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return { coverMs, heapBytes: usedSize };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

test("M2-21 player performance budget: a large course shows its cover within the time budget and holds no more heap than the memory budget", async ({
  browser,
}) => {
  const loads = [];
  for (let i = 0; i < 3; i++) {
    const page = await browser.newPage();
    loads.push(await load(page));
    await page.close();
  }
  const measured = {
    coverMs: Math.round(median(loads.map((l) => l.coverMs))),
    heapBytes: median(loads.map((l) => l.heapBytes)),
  };
  // In the CI log, so the next budget change starts from real numbers.
  console.log(
    `Player performance on a large course: ${JSON.stringify({ measured, loads, BUDGET })}`,
  );
  test
    .info()
    .annotations.push({ type: "player-performance", description: JSON.stringify(measured) });
  expect(measured.coverMs).toBeLessThanOrEqual(BUDGET.coverMs);
  expect(measured.heapBytes).toBeLessThanOrEqual(BUDGET.heapBytes);
});
