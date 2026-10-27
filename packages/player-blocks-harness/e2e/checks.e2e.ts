// Knowledge-check options and quiz extras in the published player, from file:// (M2-15, BLK-07;
// rise.md 3C, 3I; blocks-interactions.md 2.12, 2.13, UI-BLOCKS-R20 to R25, R59): the retry limit
// kept across a visit, reveal off, the author's answer colours where they stay readable, feedback
// for any answer, a case-sensitive fill-in, media on questions, a timed quiz's limit on its start
// screen and the skip button's own label.
import type { Block, Course, LessonEntry, QuizEntry } from "@course-suite/format";
import { quizCourse } from "@course-suite/format/test/courses";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { adapterCalls, expect, test, useHooks } from "./fixture.ts";

/** The quiz course with its checks' settings and its quiz's settings changed. */
function pond(edit: (checks: Block[], quiz: QuizEntry) => void = () => {}): Course {
  const course = quizCourse();
  edit((course.entries[0] as LessonEntry).blocks, course.entries[1] as QuizEntry);
  return course;
}

const firstCheck = (page: Page) => page.locator("form.check").first();
const color = (page: Page, selector: string, name: string) =>
  page.locator(selector).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test("UI-BLOCKS-R20, R24, R25: one retry, then no tries left; reveal off marks only the learner's answer; the tries survive a new visit", async ({
  write,
  open,
  page,
}) => {
  await write({ course: pond() });
  await useHooks(page, { keep: true });
  await open("#/lessons/lesschecks");
  const check = firstCheck(page);
  await expect(check.locator(".check-notice")).toBeVisible();
  await expect(check.locator(".question-media img")).toHaveAttribute(
    "alt",
    "A green frog on a lily pad",
  );
  await check.getByRole("radio", { name: "A duck" }).check();
  await check.getByRole("radio", { name: "A duck" }).press("Enter");
  await expect(check.locator(".feedback p")).toHaveText(["Incorrect", "No: ducks hatch."]);
  await expect(check.locator(".choice.is-wrong")).toHaveCount(1);
  await expect(check.locator(".choice.is-correct")).toHaveCount(0);
  await expectAccessible(page, "a required check answered wrong, with a retry");
  await check.getByRole("button", { name: "Try again" }).click();
  await check.getByRole("radio", { name: "A snail" }).check();
  await check.getByRole("button", { name: "Check answer" }).click();
  await expect(check.locator(".check-spent")).toHaveText(
    "You have no tries left for this question",
  );
  await expect(check.getByRole("button", { name: "Try again" })).toBeHidden();
  await expect(page.getByText("Frogs lay their eggs in spring.")).toBeHidden();
  await expectAccessible(page, "a required check with no tries left");
  await expect
    .poll(async () => (await adapterCalls(page)).some((c) => c.method === "writeResume"))
    .toBe(true);

  // A new visit: the answer and the spent tries come back.
  await page.reload();
  await expect(check.getByRole("radio", { name: "A snail" })).toBeChecked();
  await expect(check.locator(".check-spent")).toBeVisible();
  await expect(check.getByRole("button", { name: "Try again" })).toBeHidden();
});

test("UI-BLOCKS-R22, R23, blocks-interactions 2.12: a case-sensitive fill-in, feedback for any answer, and the author's colours only where readable", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: pond((checks) => {
      delete checks[0]?.variantSettings;
      // A wrong-answer colour far too light for text on white: the player keeps its own.
      (checks[3] as Block).variantSettings = {
        retries: 0,
        incorrectColor: "#ffd0d0",
        correctColor: "#0b6e2e",
      };
    }),
  });
  await open("#/lessons/lesschecks");
  await expect(page.locator(".question-media audio")).toHaveCount(1);
  await expect(page.locator(".question-media video")).toHaveCount(1);
  const fill = page.locator("form.check").nth(2);
  expect(await color(page, "form.check >> nth=2", "--correct")).toBe("#0b6e2e");
  expect(await color(page, "form.check >> nth=2", "--wrong")).toBe("#b42318");
  await fill.getByRole("textbox").fill("tadpole");
  await fill.getByRole("textbox").press("Enter");
  await expect(fill.locator(".feedback p")).toHaveText([
    "Incorrect",
    "Tadpoles grow legs after a few weeks.",
  ]);
  await expect(fill.getByRole("button", { name: "Try again" })).toBeHidden();
  await expect(fill.locator(".check-spent")).toBeVisible();
  const multi = page.locator("form.check").nth(1);
  expect(await color(page, "form.check >> nth=1", "--correct")).toBe("#0b6e2e");
  await multi.getByRole("checkbox", { name: "A stickleback" }).check();
  await multi.getByRole("checkbox", { name: "A dragonfly larva" }).check();
  await multi.getByRole("button", { name: "Check answer" }).click();
  await expect(multi.locator(".feedback p")).toHaveText([
    "Correct",
    "Right: both breathe under water.",
  ]);
  await expectAccessible(page, "checks with media, colours and feedback");
});

test("UI-BLOCKS-R59, GI-O2: a timed quiz shows its limit before it starts; a passed quiz offers skip ahead under the author's label", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: pond((checks, quiz) => {
      delete checks[0]?.variantSettings;
      quiz.settings = {
        timer: { minutes: 5 },
        skipAhead: { entry: "lessafter1", learnerChooses: true, buttonLabel: "Jump to the end" },
      };
      quiz.questions = quiz.questions.slice(0, 1);
    }),
  });
  // Skip ahead makes navigation restricted (rise.md rule 14): the lesson before comes first.
  await open("#/lessons/lesschecks");
  await page.evaluate(() => {
    location.hash = "#/lessons/quizpond01";
  });
  await expect(page.locator(".quiz-limit")).toHaveText("Time limit: 5 min");
  await expectAccessible(page, "a timed quiz's start screen");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await expect(page.locator(".quiz-limit")).toHaveCount(0);
  await page.getByRole("radio", { name: "In water" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "See your result" }).click();
  await page.getByRole("link", { name: "Jump to the end" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("After the quiz");
});
