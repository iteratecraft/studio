// M1 demo (M1-31) smoke test: `pnpm demo:m1`'s server, started here with the format's sample course
// only, lists the course in every output, and one launch of each standard, walked through by a
// learner in the course frame, shows the completion it reported in the live trace panel.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCourse } from "@course-suite/format/test/courses";
import { test as base, expect, type Frame, type Page } from "@playwright/test";
import { type Demo, demoCourses, startDemo } from "../demo/m1.js";
import { walkCourse } from "../test/learner.js";

const course = sampleCourse();
const NAME = "fixtures/sample";

const test = base.extend<object, { demo: Demo }>({
  demo: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures take their dependencies this way.
    async ({}, use) => {
      const outDir = mkdtempSync(join(tmpdir(), "m1-demo-"));
      const demo = await startDemo({
        outDir,
        courses: demoCourses().filter(({ name }) => name === NAME),
      });
      await use(demo);
      await demo.close();
      rmSync(outDir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],
});

/** The frame of a page element, once it has loaded. */
async function frameOf(page: Page | Frame, selector: string): Promise<Frame> {
  const frame = await (await page.waitForSelector(selector)).contentFrame();
  if (!frame) throw new Error(`${selector} is not a frame`);
  return frame;
}

test("the index lists the sample course in every output, with the zips and folders written", async ({
  page,
  demo,
}) => {
  await page.goto(demo.url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("M1 demo");
  for (const output of ["Web", "SCORM 1.2", "SCORM 2004", "xAPI", "cmi5"]) {
    await expect(page.getByRole("link", { name: `Launch ${NAME} as ${output}` })).toBeVisible();
  }
  for (const standard of ["web", "scorm12", "scorm2004", "xapi", "cmi5"]) {
    expect(existsSync(join(demo.outDir, NAME, `${standard}.zip`))).toBe(true);
    expect(existsSync(join(demo.outDir, NAME, standard, "index.html"))).toBe(true);
  }
});

test("a web launch plays the course and says there is nothing to trace", async ({ page, demo }) => {
  await page.goto(demo.url);
  await page.getByRole("link", { name: `Launch ${NAME} as Web` }).click();
  const course = await frameOf(page, "#course");
  await expect(course.getByRole("link", { name: "Begin course" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("nothing to trace");
});

/** Each standard, the first call or statement of a launch, and the success it reports at the end. */
const LAUNCHES = [
  {
    output: "SCORM 1.2",
    scorm: true,
    tags: "[standards:R11]",
    first: "LMSInitialize",
    success: "not reported",
  },
  {
    output: "SCORM 2004",
    scorm: true,
    tags: "[standards:R10]",
    first: "Initialize",
    success: "unknown",
  },
  { output: "xAPI", scorm: false, tags: "", first: "attempted", success: "not reported" },
  { output: "cmi5", scorm: false, tags: "", first: "initialized", success: "not reported" },
];

for (const { output, scorm, tags, first, success } of LAUNCHES) {
  test(
    `${tags} a ${output} launch, walked through, shows the calls or statements live and the completion reported`.trim(),
    async ({ page, demo }) => {
      test.setTimeout(60_000);
      await page.goto(demo.url);
      await page.getByRole("link", { name: `Launch ${NAME} as ${output}` }).click();
      const outer = await frameOf(page, "#course");
      const frame = scorm ? await frameOf(outer, "#sco") : outer;
      const trace = page.getByRole("log");
      // The launch shows up before the learner does anything.
      await expect(trace).toContainText(first);
      await walkCourse(frame, course);
      await expect(page.locator("#completion")).toHaveText("completed");
      // The sample course is tracked by what the learner viewed, so its quiz decides no success.
      await expect(page.locator("#success")).toHaveText(success);
    },
  );
}
