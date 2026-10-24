// Quiz lesson runtime from file:// (M1-12, ENG-05): start screen, one question per screen, results,
// retakes, require-passing, skip-ahead, the timer and random draws (rise.md §3 I, rules 8 and 15;
// blocks-interactions.md W12, UI-BLOCKS-R22 and R29 to R41).
import type { Page } from "@playwright/test";
import { course, lesson, paragraph, quiz, quizQuestions } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const outlineLink = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Course contents" }).getByRole("link", { name });

/** Answers the three test questions: right, right, wrong, unless told otherwise. */
async function answerAll(page: Page, right = [true, true, false]) {
  await page.getByRole("radio", { name: right[0] ? "Brown" : "Green" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page
    .getByRole("textbox", { name: "Keep the lid ___ when it rains." })
    .fill(right[1] ? "ON " : "off");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  const match = right[2] ? ["Green", "Brown"] : ["Brown", "Green"];
  await page
    .getByRole("combobox", { name: "Grass cuttings" })
    .selectOption({ label: match[0] as string });
  await page
    .getByRole("combobox", { name: "Dry leaves" })
    .selectOption({ label: match[1] as string });
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "See your result" }).click();
}

const twoLessons = (settings = {}) =>
  course([
    quiz("quizone001", "Compost quiz", settings),
    lesson("lessonafter", "After the quiz", paragraph("tafter0001", "Well done")),
    lesson("lessonlast1", "Last", paragraph("tlast00001", "The end")),
  ]);

test("UI-BLOCKS-R29 to R34: a quiz from start screen to results, one question per screen", async ({
  write,
  open,
  page,
}) => {
  await write({ course: twoLessons() });
  const visit = await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Question 1 of 3");
  await expect(page.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(page.getByRole("group")).toHaveCount(1);

  // UI-BLOCKS-R29: submitting nothing is not scored.
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".hint")).toHaveClass(/is-needed/);
  await expect(page.locator(".feedback")).toBeHidden();

  // UI-BLOCKS-R30: marks and feedback straight away, then next.
  await page.getByRole("radio", { name: "Green" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".feedback p")).toHaveText([
    "Incorrect",
    "Cardboard is dry, so it is a brown.",
  ]);
  await expect(page.locator(".is-correct .mark")).toHaveText("Correct answer");
  await expect(page.getByRole("radio", { name: "Brown" })).toBeDisabled();
  // UI-BLOCKS-R31: the lesson's status rises by one question in three.
  await expect(outlineLink(page, "Compost quiz")).toHaveAccessibleDescription("33% done");
  await page.getByRole("button", { name: "Next question" }).click();

  // UI-BLOCKS-R22: typed answers ignore case; a right one shows the accepted answers.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Question 2 of 3");
  await page.getByRole("textbox", { name: "Keep the lid ___ when it rains." }).fill("ON");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback .outcome")).toHaveText("Correct");
  await expect(page.locator(".accepted li")).toHaveText(["on", "closed"]);
  await page.getByRole("button", { name: "Next question" }).click();

  // UI-BLOCKS-R28: matching by drop-downs; a wrong row is marked and its match revealed.
  await page.getByRole("combobox", { name: "Grass cuttings" }).selectOption({ label: "Brown" });
  await page.getByRole("combobox", { name: "Dry leaves" }).selectOption({ label: "Brown" });
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".match.is-wrong")).toContainText("Correct answer: Green");
  await expect(page.locator(".match.is-correct")).toContainText("Dry leaves");

  // UI-BLOCKS-R33: pass or fail is set at the last submit, before the results.
  await expect(outlineLink(page, "Compost quiz")).toHaveAccessibleDescription("Not passed");
  await page.getByRole("button", { name: "See your result" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Your result");
  await expect(page.locator(".quiz")).toContainText("Needed to pass: 80%");
  await expect(page.locator(".quiz-score")).toHaveText("Your score: 33%");
  await expect(page.locator(".quiz-outcome")).toHaveText("Not passed");
  // UI-BLOCKS-R36: without require-passing a failed quiz still counts toward the course.
  await expect(page.locator(".outline-progress")).toHaveText("33% done");
  await expect(page.getByRole("button", { name: "Retake quiz" })).toBeVisible();
  expect(visit.errors).toEqual([]);
  expect(visit.badRequests).toEqual([]);
});

test("UI-BLOCKS-R34, R35: retake is offered even after a pass and goes back to the start screen", async ({
  write,
  open,
  page,
}) => {
  await write({ course: twoLessons({ passingScore: 60 }) });
  await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await answerAll(page);
  await expect(page.locator(".quiz-outcome")).toHaveText("Passed");
  await expect(outlineLink(page, "Compost quiz")).toHaveAccessibleDescription("Done");
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(page.getByRole("button", { name: "Retake quiz" })).toBeFocused();
  await expect(outlineLink(page, "Compost quiz")).toHaveAccessibleDescription("");
  await expect(page.locator(".outline-progress")).toHaveText("0% done");
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Question 1 of 3");
  // The previous answers are gone.
  await expect(page.getByRole("radio", { name: "Brown" })).not.toBeChecked();
});

test("UI-BLOCKS-R37, R38: with require-passing and no retakes left, the course cannot go on", async ({
  write,
  open,
  page,
}) => {
  await write({ course: twoLessons({ requirePassing: true, retries: 1 }) });
  await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await answerAll(page);
  await expect(page.locator(".quiz")).toContainText("Attempts left: 1");
  await expect(page.locator(".quiz-must-pass")).toHaveText("You need a passing score to go on");
  await expect(page.locator(".outline-progress")).toHaveText("0% done");
  await expect(outlineLink(page, "After the quiz")).toHaveCount(0);
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await answerAll(page, [false, false, false]);
  await expect(page.locator(".quiz-score")).toHaveText("Your score: 0%");
  await expect(page.locator(".quiz")).toContainText("No attempts left");
  await expect(page.getByRole("button", { name: "Retake quiz" })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Previous and next lesson" }).getByRole("link"),
  ).toHaveCount(0);
});

test("reveal answers off: no marks or feedback after a submit", async ({ write, open, page }) => {
  await write({ course: twoLessons({ revealAnswers: "none" }) });
  await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await page.getByRole("radio", { name: "Green" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".feedback")).toBeHidden();
  await expect(page.locator(".mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next question" })).toBeFocused();
});

test("[rise:R15] UI-BLOCKS-R39: the timer submits at zero with unanswered questions wrong, and restarts on retake", async ({
  write,
  open,
  page,
}) => {
  const start = Date.parse("2026-10-24T09:00:00Z");
  await page.clock.install({ time: start });
  await write({ course: twoLessons({ timer: { minutes: 1, learnerCanHide: true } }) });
  await open("#/lessons/quizone001");
  // The installed clock runs in real time until paused; a busy machine must not move the timer.
  await page.clock.pauseAt(start + 60_000);
  await page.getByRole("button", { name: "Begin quiz" }).click();
  const timer = page.getByRole("timer", { name: "Quiz timer" });
  await expect(timer).toContainText("Time left: 1:00");
  await page.getByRole("radio", { name: "Brown" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.clock.runFor(30_000);
  await expect(timer).toContainText("Time left: 0:30");
  await page.getByRole("button", { name: "Hide timer" }).click();
  await expect(timer.locator(".timer-time")).toBeHidden();
  await page.getByRole("button", { name: "Show timer" }).click();

  await page.clock.runFor(31_000);
  const dialog = page.getByRole("dialog", { name: "Time is up. Your answers were submitted." });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "See your result" }).click();
  await expect(page.locator(".quiz-score")).toHaveText("Your score: 33%");

  await page.getByRole("button", { name: "Retake quiz" }).click();
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(timer).toContainText("Time left: 1:00");
});

test("random draws: an attempt asks the drawn number of bank questions, shuffled", async ({
  write,
  open,
  page,
}) => {
  const pool = Array.from({ length: 5 }, (_, i) => ({
    bankQuestion: `bankques0${i}`,
    question: {
      id: `qpooled00${i}`,
      kind: "single-choice" as const,
      prompt: `<p>Pool question ${i}</p>`,
      answers: [
        { id: `apoolyes0${i}`, text: "Yes", correct: true },
        { id: `apoolno00${i}`, text: "No", correct: false },
      ],
    },
  }));
  const [first] = quizQuestions();
  await write({
    course: course([
      quiz("quizone001", "Drawn quiz", { shuffleQuestions: true }, [
        first as never,
        {
          id: "drawbank01",
          kind: "draw",
          bank: { containerId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", id: "bank000001" },
          count: 2,
          pool,
        },
      ]),
    ]),
  });
  await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Question 1 of 3");
});

test("UI-BLOCKS-R41: after a pass the learner may skip ahead; skipped lessons count as done", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course([
      quiz("quizone001", "Compost quiz", {
        passingScore: 60,
        skipAhead: { entry: "lessonlast1", learnerChooses: true },
      }),
      lesson("lessonafter", "After the quiz", paragraph("tafter0001", "Well done")),
      lesson("lessonlast1", "Last", paragraph("tlast00001", "The end")),
    ]),
  });
  await open("#/lessons/quizone001");
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await answerAll(page);
  await page.getByRole("link", { name: "Skip ahead to Last" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Last");
  await expect(outlineLink(page, "After the quiz")).toHaveAccessibleDescription("Done");
  await expect(page.locator(".outline-progress")).toHaveText("100% done");
});
