// Accessibility baseline of the Blocks player (M1-29, ENG-04): every page state of every fixture and
// corpus course, checked with axe-core against WCAG 2.2 A and AA at 320, 768 and 1280 px, with no
// sideways scrolling (rise.md rule 18; accessibility.md UI-ACCESSIBILITY-R39). The corpus courses
// live in the private iteratecraft/test-courses repository, checked out at `test-courses/` in the
// root of studio; without a checkout they skip.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Course, openCourse } from "@course-suite/format";
import {
  fullCourse,
  mediaCourse,
  minimalCourse,
  sampleCourse,
} from "@course-suite/format/test/courses";
import type { Locator, Page } from "@playwright/test";
import { expectAccessible, violations } from "./axe.ts";
import { continueBlock, course, everyBlockCourse, lesson, paragraph, quiz } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const corpusDir = join(import.meta.dirname, "..", "..", "..", "test-courses", "blocks");
const corpus = existsSync(corpusDir)
  ? readdirSync(corpusDir).filter((name) => existsSync(join(corpusDir, name, "course.json")))
  : [];

function corpusCourse(name: string): Course {
  const opened = openCourse(readFileSync(join(corpusDir, name, "course.json"), "utf8"));
  if (opened.status !== "ok") throw new Error(`${name} does not open: ${opened.status}`);
  return opened.document;
}

/** A quiz that must be passed, with one retry and a timer, before the lessons after it open. */
const mustPass = () =>
  course(
    [
      lesson("lessonone1", "Before the quiz", paragraph("tparaone01", "Read this first.")),
      quiz("quizone001", "Compost quiz", {
        requirePassing: true,
        retries: 1,
        timer: { minutes: 5, display: "elapsed-of-total" },
        skipAhead: { entry: "lessonlast1", learnerChooses: true },
      }),
      lesson("lessonafter", "After the quiz", paragraph("tafter0001", "Well done")),
      lesson("lessonlast1", "Last", paragraph("tlast00001", "The end")),
    ],
    { navigation: { restricted: true } },
  );

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

/** Some answer: the first choice, a typed word, the first match in every drop-down. */
async function answer(form: Locator): Promise<void> {
  const choices = form.locator("input[type=radio], input[type=checkbox]");
  if ((await choices.count()) > 0) await choices.first().check();
  const typed = form.locator("input[type=text]");
  if ((await typed.count()) > 0) await typed.fill("an answer");
  for (const select of await form.locator("select").all()) await select.selectOption({ index: 1 });
  await form.locator("button[type=submit]").click();
}

/** Answers every check and presses every ready continue block, while the lesson stays open. */
async function workThrough(page: Page): Promise<boolean> {
  const url = page.url();
  let acted = false;
  for (let step = 0; step < 50 && page.url() === url; step++) {
    const check = page.locator(".blocks form.check:has(button[type=submit]:visible)").first();
    const gate = page.locator(".blocks button.continue:visible:not([aria-disabled])").first();
    if ((await check.count()) > 0) await answer(check);
    else if ((await gate.count()) > 0) await gate.click();
    else break;
    acted = true;
  }
  return acted && page.url() === url;
}

/** Start screen, every question before and after submit, and the results. */
async function takeQuiz(page: Page, name: string): Promise<void> {
  const begin = page.getByRole("button", { name: /^(Begin|Retake) quiz$/ });
  if (!(await begin.isVisible())) return;
  await expectAccessible(page, `${name}, start screen`);
  await begin.click();
  for (let index = 1; index <= 30; index++) {
    const form = page.locator(".quiz form.check");
    if ((await form.count()) === 0) break;
    await expectAccessible(page, `${name}, question ${index}`);
    await answer(form);
    await expectAccessible(page, `${name}, question ${index} answered`);
    await form.getByRole("button", { name: /^(Next question|See your result)$/ }).click();
  }
  await expect(page.getByRole("heading", { level: 2, name: "Your result" })).toBeVisible();
  await expectAccessible(page, `${name}, results`);
}

/** The cover, the outline over the content on narrow screens, then every page by its address. */
async function walk(page: Page, subject: Course, name: string): Promise<void> {
  await expect(h1(page)).toHaveText(subject.title);
  await expectAccessible(page, `${name}: cover`);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("button", { name: "Show contents" }).click();
  await expectAccessible(page, `${name}: contents open`, [320, 768]);
  for (const entry of subject.entries) {
    if (entry.kind === "section") continue;
    await page.evaluate((id) => {
      location.hash = `#/lessons/${id}`;
    }, entry.id);
    await expect(h1(page)).toHaveText(entry.title);
    const state = `${name}: ${entry.kind} "${entry.title}"`;
    await expectAccessible(page, state);
    if (entry.kind === "quiz") await takeQuiz(page, state);
    else if (await workThrough(page)) await expectAccessible(page, `${state}, worked through`);
  }
}

const fixtures: [string, () => Course][] = [
  ["sample", sampleCourse],
  ["full", fullCourse],
  ["minimal", minimalCourse],
  ["every block", () => everyBlockCourse()],
  ["must pass", mustPass],
  ["media", mediaCourse],
];

test.describe("WCAG 2.2 A and AA on every page", () => {
  // Many pages, three widths each.
  test.describe.configure({ timeout: 300_000 });

  for (const [name, make] of fixtures) {
    test(`[rise:R18] UI-ACCESSIBILITY-R39: fixture "${name}" at 320, 768 and 1280 px`, async ({
      write,
      open,
      page,
    }) => {
      const subject = make();
      await write({ course: subject });
      await open();
      await walk(page, subject, name);
    });
  }

  for (const name of corpus) {
    test(`[rise:R18] UI-ACCESSIBILITY-R39: corpus "${name}" at 320, 768 and 1280 px`, async ({
      write,
      open,
      page,
    }) => {
      const subject = corpusCourse(name);
      await write({ course: subject });
      await open();
      await walk(page, subject, name);
    });
  }
});

test("the checks catch a violation: an image that lost its alt text", async ({
  write,
  open,
  page,
}) => {
  await write();
  await open("#/lessons/lessonwhat");
  await page.locator("img.image").evaluate((image) => image.removeAttribute("alt"));
  expect(await violations(page)).toEqual(["image-alt (Images must have alternative text): img"]);
});

test("[rise:R20] the error screen when the course data is missing", async ({
  write,
  open,
  dir,
  page,
}) => {
  await write();
  rmSync(join(dir, "course-data.js"));
  await open();
  await expect(page.getByRole("alert")).toBeVisible();
  await expectAccessible(page, "error screen");
});

test("the goodbye page after the exit link", async ({ write, open, page }) => {
  await write({ course: everyBlockCourse() });
  await open("#/lessons/lessonnext");
  await page.getByRole("button", { name: "Exit course" }).click();
  await expect(page.getByRole("main")).toContainText("You have left the course.");
  await expectAccessible(page, "goodbye page");
});

test("the save-failed notice", async ({ write, open, page }) => {
  // Far more seen blocks than SCORM 1.2's 4,096 characters hold.
  const blocks = Array.from({ length: 1000 }, (_, i) =>
    paragraph(`t${String(i).padStart(9, "0")}`, `Paragraph ${i}`),
  );
  await write({
    course: course([lesson("lessonbig1", "Long lesson", ...blocks, continueBlock("cgatebig01"))]),
  });
  await open("#/lessons/lessonbig1");
  await expect(page.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await expectAccessible(page, "save-failed notice");
});

test("[rise:R15] the time-up dialog", async ({ write, open, page }) => {
  const start = Date.parse("2026-10-24T09:00:00Z");
  await page.clock.install({ time: start });
  await write({ course: course([quiz("quizone001", "Compost quiz", { timer: { minutes: 1 } })]) });
  await open("#/lessons/quizone001");
  await page.clock.pauseAt(start + 60_000);
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await page.clock.runFor(61_000);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.clock.resume(); // the checks wait for animation frames
  await expectAccessible(page, "time-up dialog");
});
