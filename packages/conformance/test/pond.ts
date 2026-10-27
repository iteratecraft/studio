// The quiz course's learner for the conformance and Moodle tests (M2-15, BLK-07): the format's quiz
// course published to a standard, and a learner who passes its quiz or fails it three times with
// falling scores, using the player's own controls.
import type { Course, LessonEntry, PublishSettings, QuizEntry } from "@course-suite/format";
import { quizCourse } from "@course-suite/format/test/courses";
import { expect, type Frame, type Page } from "@playwright/test";

export type Learner = Page | Frame;

/**
 * The quiz course published to `standard`: the quiz decides passed or failed (75 % to pass, two
 * retries, passing required), its checks are not required and its timer is off, so the path
 * depends on the answers alone.
 */
export function pond(standard: Exclude<PublishSettings["standard"], "web">): Course {
  const course = quizCourse();
  delete (course.entries[0] as LessonEntry).blocks[0]?.variantSettings;
  const quiz = course.entries[1] as QuizEntry;
  if (quiz.settings) delete quiz.settings.timer;
  course.publish = {
    standard,
    statusWording: { done: "passed", notDone: "failed" },
    tracking: { kind: "quiz", quiz: "quizpond01" },
  };
  return course;
}

/** Opens the quiz from the outline. */
export async function openQuiz(learner: Learner) {
  await learner
    .getByRole("navigation", { name: "Course contents" })
    .getByRole("link", { name: "Pond quiz" })
    .click();
  await expect(learner.getByRole("heading", { level: 1 })).toHaveText("Pond quiz");
}

/** The four questions, in order: what a right and a wrong learner does on each. */
export const ANSWERS: ((learner: Learner, right: boolean) => Promise<void>)[] = [
  (l, right) => l.getByRole("radio", { name: right ? "In water" : "In trees" }).check(),
  async (l, right) => {
    for (const name of right ? ["Dragonfly", "Water beetle"] : ["Newt"]) {
      await l.getByRole("checkbox", { name }).check();
    }
  },
  (l, right) => l.getByRole("textbox").fill(right ? "Lily pad" : "reed"),
  async (l, right) => {
    await l
      .getByRole("combobox", { name: "Tadpole" })
      .selectOption({ label: right ? "Frog" : "Dragonfly" });
    await l
      .getByRole("combobox", { name: "Nymph" })
      .selectOption({ label: right ? "Dragonfly" : "Frog" });
  },
];

/** Answers questions `from` onward of the attempt on show, right or wrong, then shows the result. */
export async function answer(learner: Learner, rights: boolean[], from = 0) {
  for (let i = from; i < ANSWERS.length; i++) {
    await expect(learner.getByRole("heading", { level: 2 })).toHaveText(`Question ${i + 1} of 4`);
    await ANSWERS[i]?.(learner, rights[i] === true);
    await learner.getByRole("button", { name: "Submit" }).click();
    await learner
      .getByRole("button", { name: i === 3 ? "See your result" : "Next question" })
      .click();
  }
}

/** Starts an attempt: the first one, or a retake from the results. */
export async function start(learner: Learner) {
  const retake = learner.getByRole("button", { name: "Retake quiz" });
  if (await retake.isVisible()) await retake.click();
  await learner
    .getByRole("button", { name: "Begin quiz" })
    .or(learner.getByRole("button", { name: "Retake quiz" }))
    .click();
}

export const RIGHT = [true, true, true, true];
/** Three attempts with falling scores: 50 %, 25 %, 0 %. */
export const FALLING = [
  [true, true, false, false],
  [true, false, false, false],
  [false, false, false, false],
];

/** The three failed attempts in one visit, ending on the results with no retake left. */
export async function failThrice(learner: Learner) {
  await learner.getByRole("link", { name: "Begin course" }).click();
  await openQuiz(learner);
  for (const [i, rights] of FALLING.entries()) {
    await start(learner);
    await answer(learner, rights);
    await expect(learner.locator(".quiz-score")).toHaveText(`Your score: ${[50, 25, 0][i]}%`);
  }
  await expectNoWayOn(learner);
}

/** UI-BLOCKS-R38: no retake, a must-pass notice and the next lesson locked. */
export async function expectNoWayOn(learner: Learner) {
  await expect(learner.getByText("No attempts left")).toBeVisible();
  await expect(learner.getByRole("button", { name: "Retake quiz" })).toHaveCount(0);
  await expect(learner.getByText("You need a passing score to go on")).toBeVisible();
  await expect(learner.locator(".page-link-next")).toHaveClass(/is-locked/);
}

export async function passOnce(learner: Learner) {
  await learner.getByRole("link", { name: "Begin course" }).click();
  await openQuiz(learner);
  await start(learner);
  await answer(learner, RIGHT);
  await expect(learner.locator(".quiz-score")).toHaveText("Your score: 100%");
}

/** The interaction ids of one attempt, by rule 11: title, question text and attempt number. */
export const ids = (attempt: number) => [
  `Pond_quiz_Where_do_frogs_lay_eggs?_${attempt}`,
  `Pond_quiz_Which_are_insects?_${attempt}`,
  `Pond_quiz_Name_the_plant_that_floats_with_round_leaves._${attempt}`,
  `Pond_quiz_Match_the_young_with_the_adult._${attempt}`,
];
