// Player performance budget (M2-21, D-26; ENG-04 "Bundle size and first load"): a large course,
// published as a plain web package and opened from disk, must show its cover within the time
// budgets and hold no more JavaScript heap than the memory budget once it has. The script and style
// sheet sizes are gated in @course-suite/exporters (src/player-budget.test.ts).
//
// Each figure is the median of five loads. Time is measured twice: as the main thread's busy time
// (Chrome's TaskDuration and ScriptDuration), which a shared runner's load disturbs less than the
// wall clock, and as the wall-clock time until the cover is in the page, which also sees waiting
// that costs no CPU. The heap is deterministic (3.039 to 3.050 MB in every load measured). How the
// budgets were set: docs/ci.md, "Player performance budget". The second test injects a known
// regression and checks that the budgets catch it. Raise a budget only with a reviewed reason in
// the pull request.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Course, type Entry, validateCourse } from "@course-suite/format";
import { interactiveBlocksCourse, staticBlocksCourse } from "@course-suite/format/test/courses";
import { readZip } from "@course-suite/zip";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { webZip } from "../test/blocks.js";

/**
 * The budgets, in milliseconds and bytes; each is held against the median of `LOADS` loads. Set
 * from the median on the CI runner (windows-latest) on 2026-10-29: main thread 188 ms, script
 * 17 ms, cover 150 ms (120 to 168 ms in earlier runs), heap 3,039,356 B.
 */
const BUDGET = {
  /** Main-thread busy time (TaskDuration) until the cover is shown: twice the runner's. */
  mainThreadMs: 380,
  /**
   * JavaScript run in that time (ScriptDuration): three times the runner's, as a few milliseconds
   * of garbage collection already move so small a figure by a tenth or more.
   */
  scriptMs: 50,
  /**
   * From navigation start until the cover's begin link is in the page, by the wall clock: twice
   * the runner's slowest median.
   */
  coverMs: 340,
  /** JavaScript heap in use after a garbage collection, cover shown: the runner's plus 15 %. */
  heapBytes: 3_500_000,
};

type Measures = { [K in keyof typeof BUDGET]: number };

/** Loads per measurement; the median of an odd number is one of the loads. */
const LOADS = 5;

/**
 * The regression the second test injects: 250 ms of blocking work at start-up, which the first
 * budgets missed (a cover 2.5 times slower on the runner passed them), and 512 KiB of retained
 * memory, a sixth of the heap.
 */
const REGRESSION = { blockMs: 250, retainedDoubles: 65_536 };

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

/** One load of the course in `page`, with `regression` injected when given: what its cover cost. */
async function load(page: Page, regression?: typeof REGRESSION): Promise<Measures> {
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
  if (regression) {
    // On the main thread while the page starts, as a slower player start-up would be.
    await page.addInitScript(({ blockMs, retainedDoubles }) => {
      document.addEventListener("DOMContentLoaded", () => {
        const end = performance.now() + blockMs;
        while (performance.now() < end) {
          // Blocking work.
        }
      });
      (window as unknown as { retained: number[] }).retained = Array.from(
        { length: retainedDoubles },
        (_, i) => i + 0.5,
      );
    }, regression);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(pathToFileURL(join(dir, "index.html")).href);
  await expect(page.getByRole("link", { name: "Begin course" })).toBeVisible();
  const { metrics } = await cdp.send("Performance.getMetrics");
  const seconds = (name: string) => {
    const metric = metrics.find((m) => m.name === name);
    if (!metric) throw new Error(`Chrome reported no ${name}`);
    return metric.value;
  };
  const coverMs = await page.evaluate(
    () => (window as unknown as { coverReady: number }).coverReady,
  );
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return {
    mainThreadMs: seconds("TaskDuration") * 1000,
    scriptMs: seconds("ScriptDuration") * 1000,
    coverMs,
    heapBytes: usedSize,
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** The median of `LOADS` loads, each in a new page; logged, for the next change of a budget. */
async function measure(browser: Browser, what: string, regression?: typeof REGRESSION) {
  const loads: Measures[] = [];
  for (let i = 0; i < LOADS; i++) {
    const page = await browser.newPage();
    loads.push(await load(page, regression));
    await page.close();
  }
  const keys = Object.keys(BUDGET) as (keyof Measures)[];
  const measured = Object.fromEntries(
    keys.map((key) => {
      const value = median(loads.map((l) => l[key]));
      return [key, key === "heapBytes" ? value : Math.round(value)];
    }),
  ) as Measures;
  console.log(`${what}: ${JSON.stringify({ measured, BUDGET, loads })}`);
  test
    .info()
    .annotations.push({ type: "player-performance", description: JSON.stringify(measured) });
  return measured;
}

/** The budgets `measured` exceeds. */
const exceeded = (measured: Measures) =>
  (Object.keys(BUDGET) as (keyof Measures)[]).filter((key) => measured[key] > BUDGET[key]);

test("M2-21 player performance budget: a large course shows its cover within the time budgets and holds no more heap than the memory budget", async ({
  browser,
}) => {
  const measured = await measure(browser, "Player performance on a large course");
  expect(exceeded(measured), JSON.stringify({ measured, BUDGET })).toEqual([]);
});

test("M2-21 player performance budget: 250 ms more blocking work at start-up, or 512 KiB more heap, exceeds the budgets", async ({
  browser,
}) => {
  const measured = await measure(browser, "Player performance with a regression", REGRESSION);
  // The script budget catches the blocking work on any machine, however fast or loaded: the work
  // alone is 250 ms of script. The main-thread and wall-clock budgets are twice the runner's own
  // figures, so they catch it on the runner they were set on, but a fast machine stays under them.
  expect(exceeded(measured), JSON.stringify({ measured, BUDGET })).toEqual(
    expect.arrayContaining(["scriptMs", "heapBytes"]),
  );
});
