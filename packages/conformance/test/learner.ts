// A learner who goes through a whole Blocks course with the player's own controls: every lesson and
// quiz in order, each knowledge check answered, each ready continue button pressed, the images
// scrolled into view, and each quiz failed once and then passed where its retakes allow. The right
// and wrong answers come from the course document.
import type { Course, LessonEntry, Question, QuizEntry } from "@course-suite/format";
import { plainText } from "@course-suite/format";
import { english } from "@course-suite/labels";
import { pageHash, pagesOf } from "@course-suite/player-blocks";
import { expect, type Frame, type Locator, type Page } from "@playwright/test";

/** The page or the LMS frame the course runs in. */
export type CourseFrame = Page | Frame;

const label = english.labels;
const QUESTION_KINDS = new Set(["single-choice", "multiple-response", "fill-in", "matching"]);
/** More steps than any lesson needs; a lesson that never settles fails instead of hanging. */
const MAX_STEPS = 200;

/** Every question in `value`: a quiz's own, the pools of its draws and the knowledge checks of a lesson. */
function questionsIn(value: unknown): Question[] {
  if (typeof value !== "object" || value === null) return [];
  const kind = (value as { kind?: unknown }).kind;
  const own = typeof kind === "string" && QUESTION_KINDS.has(kind) ? [value as Question] : [];
  return [...own, ...Object.values(value).flatMap(questionsIn)];
}

const squash = (text: string) => text.replace(/\s+/g, "");

/** Answers the question shown in `fieldset`, right or wrong, the way a learner would. */
async function answer(fieldset: Locator, questions: readonly Question[], right: boolean) {
  const choices = fieldset.locator("input[type=radio], input[type=checkbox]");
  const values = await choices.evaluateAll((inputs) =>
    inputs.map((input) => (input as unknown as { value: string }).value),
  );
  if (values.length > 0) {
    // A choice input's value is the answer id.
    const correct = new Set(
      questions.flatMap((q) => ("answers" in q ? q.answers : []).filter((a) => a.correct)),
    );
    const ids = new Set([...correct].map((a) => a.id));
    const picks = values.flatMap((value, i) => (ids.has(value) === right ? [i] : []));
    const single = (await choices.first().getAttribute("type")) === "radio";
    // Every choice right and a wrong answer wanted: one of several right answers is still wrong.
    for (const i of (picks.length > 0 ? picks : [0]).slice(0, single ? 1 : undefined)) {
      await choices.nth(i).check();
    }
    return;
  }

  const selects = fieldset.locator("select");
  const rows = await selects.count();
  if (rows > 0) {
    // One drop-down per pair, in the question's order; each option's value is a pair id.
    const offered = await selects
      .first()
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as unknown as { value: string }).value),
      );
    const question = questions.find(
      (q) =>
        q.kind === "matching" &&
        q.pairs.length === rows &&
        q.pairs.every((pair) => offered.includes(pair.id)),
    );
    if (question?.kind !== "matching") throw new Error(`No matching question offers ${offered}`);
    for (let i = 0; i < rows; i++) {
      const pair = question.pairs[right ? i : (i + 1) % rows];
      await selects.nth(i).selectOption(pair?.id ?? "");
    }
    return;
  }

  const prompt = squash((await fieldset.locator(".prompt").textContent()) ?? "");
  const question = questions.find(
    (q) => q.kind === "fill-in" && squash(plainText(q.prompt)) === prompt,
  );
  if (question?.kind !== "fill-in") throw new Error(`No fill-in question asks '${prompt}'`);
  await fieldset
    .getByRole("textbox")
    .fill(right ? (question.acceptedAnswers[0] ?? "") : "not one of the accepted answers");
}

/** Lets every visible image load, including lazy ones further down the page. */
async function loadImages(frame: CourseFrame) {
  const images = frame.locator("main img:visible");
  for (let i = 0, count = await images.count(); i < count; i++) {
    await images.nth(i).scrollIntoViewIfNeeded();
  }
  await frame.waitForFunction(
    "[...document.images].every((image) => image.complete || !image.checkVisibility())",
  );
}

/** Answers the knowledge checks and presses continue until the lesson shows everything it can. */
async function workThrough(frame: CourseFrame, lesson: LessonEntry) {
  const questions = questionsIn(lesson);
  for (let step = 0; step < MAX_STEPS; step++) {
    // Pressing the last continue button opens the next lesson.
    if ((await frame.locator("h1").textContent()) !== lesson.title) return;
    await loadImages(frame);
    const check = frame
      .locator("form.check")
      .filter({ has: frame.locator("button[type=submit]:visible") })
      .first();
    if ((await check.count()) > 0) {
      await answer(check.locator("fieldset"), questions, true);
      await check.locator("button[type=submit]").click();
      continue;
    }
    const next = frame.locator("button.continue:visible:not([aria-disabled])").first();
    if ((await next.count()) > 0) {
      await next.click();
      continue;
    }
    const done = frame.locator("button.mark-done:visible");
    if ((await done.count()) > 0) {
      await done.click();
      continue;
    }
    return;
  }
  throw new Error(`Lesson '${lesson.title}' still had something to do after ${MAX_STEPS} steps`);
}

/** Fails the quiz, then passes it; only passes when it allows a single attempt. */
async function takeQuiz(frame: CourseFrame, quiz: QuizEntry) {
  if (quiz.questions.length === 0) return;
  const questions = questionsIn(quiz);
  const shown = frame.locator("fieldset.question");
  const results = frame.getByRole("heading", { name: label["quiz.results"] });
  for (const right of quiz.settings?.retries === 0 ? [true] : [false, true]) {
    // The start screen, or the results of the attempt before, which lead back to the start screen.
    for (let step = 0; !(await shown.isVisible()); step++) {
      if (step === 3) throw new Error(`Quiz '${quiz.title}' does not start`);
      await frame
        .getByRole("button", { name: label["quiz.begin"] })
        .or(frame.getByRole("button", { name: label["quiz.retake"] }))
        .click();
    }
    for (let step = 0; !(await results.isVisible()); step++) {
      if (step === MAX_STEPS) throw new Error(`Quiz '${quiz.title}' never shows its result`);
      await answer(shown, questions, right);
      await frame.getByRole("button", { name: label["quiz.submit"] }).click();
      await frame
        .getByRole("button", { name: label["quiz.next"] })
        .or(frame.getByRole("button", { name: label["quiz.showResults"] }))
        .click();
    }
    await expect(frame.locator(".quiz-outcome")).toHaveText(
      label[right ? "quiz.passed" : "quiz.failed"],
    );
  }
}

/** A first visit: begin, then every lesson and quiz in course order. */
export async function walkCourse(frame: CourseFrame, course: Course): Promise<void> {
  await frame.getByRole("link", { name: label["course.begin"] }).click();
  for (const page of pagesOf(course)) {
    await frame.evaluate(`location.hash = ${JSON.stringify(pageHash(page.id))}`);
    await expect(frame.locator("h1")).toHaveText(page.title);
    // A lesson still locked by a quiz says so; the learner moves on.
    if (await frame.locator(".locked-notice").isVisible()) continue;
    if (page.kind === "quiz") await takeQuiz(frame, page);
    else await workThrough(frame, page);
  }
}

/** A later visit: resume where the course left off, or begin again where nothing was kept. */
export async function revisit(frame: CourseFrame): Promise<void> {
  await frame
    .getByRole("link", { name: label["course.resume"] })
    .or(frame.getByRole("link", { name: label["course.begin"] }))
    .first()
    .click();
  await expect(frame.locator("article.lesson h1")).toBeVisible();
}
