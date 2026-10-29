// The short quiz course and the learner paths the real-LMS tests share (Moodle, M1-21; ILIAS, M2-21):
// a first visit that completes a lesson and opens the next, a second that resumes there and passes
// the quiz, and a visit that fails it; plus what the conformance test LMS keeps after the same
// visits, the reference a real LMS is held to.
import type { Course, PublishSettings } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { english } from "@course-suite/labels";
import { pageHash, pagesOf } from "@course-suite/player-blocks";
import { type Browser, expect, type Frame } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { closeSco, relaunchCmi, relaunchCmi2004, runPackage } from "../src/run-package.js";
import type { CmiData } from "../src/test-lms.js";
import { type CourseFrame, walkPages } from "./learner.js";

const label = english.labels;

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Two lessons and a one-question quiz without retakes that decides passed or failed (passing score 80). */
export function compost(standard: Exclude<PublishSettings["standard"], "web">): Course {
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "Compost basics",
    sourceLanguage: "en",
    publish: {
      standard,
      statusWording: { done: "passed", notDone: "failed" },
      passingScore: 80,
      tracking: { kind: "quiz", quiz: "quizfinal1" },
    },
    entries: [
      {
        id: "lessonone1",
        kind: "lesson",
        title: "Why compost",
        blocks: [paragraph("tpara00001", "Compost feeds the soil.")],
      },
      {
        id: "lessontwo1",
        kind: "lesson",
        title: "Greens and browns",
        blocks: [paragraph("tpara00002", "Mix wet greens with dry browns.")],
      },
      {
        id: "quizfinal1",
        kind: "quiz",
        title: "Final check",
        settings: { retries: 0 },
        questions: [
          {
            id: "qbrown0001",
            kind: "single-choice",
            prompt: "<p>Is cardboard a green or a brown?</p>",
            answers: [
              { id: "abrown0001", text: "Brown", correct: true },
              { id: "agreen0001", text: "Green", correct: false },
            ],
          },
        ],
      },
    ],
    media: [],
  };
}

/** The first two pages of `course`; every course here has at least two. */
function firstTwo(course: Course) {
  const [first, second, ...rest] = pagesOf(course);
  if (!first || !second) throw new Error(`${course.title} has fewer than two pages`);
  return { first, second, rest };
}

/** First visit: begin, work through the first page, then open the second. */
export async function firstVisit(sco: CourseFrame, course: Course) {
  const { first, second } = firstTwo(course);
  await sco.getByRole("link", { name: label["course.begin"] }).click();
  await walkPages(sco, [first]);
  await sco.evaluate(`location.hash = ${JSON.stringify(pageHash(second.id))}`);
  await expect(sco.locator("h1")).toHaveText(second.title);
}

/** Second visit: the cover offers to resume at the second page; from there to the end. */
export async function secondVisit(sco: CourseFrame, course: Course) {
  const { second, rest } = firstTwo(course);
  const resume = sco.getByRole("link", { name: label["course.resume"] });
  await expect(resume).toHaveAttribute("href", pageHash(second.id));
  await resume.click();
  await expect(sco.locator("h1")).toHaveText(second.title);
  await walkPages(sco, [second, ...rest]);
}

/** Opens the compost course's quiz from the cover and answers its one question; no retake. */
async function takeQuiz(sco: CourseFrame, answer: "Brown" | "Green") {
  await sco.getByRole("link", { name: label["course.begin"] }).click();
  await sco.evaluate(`location.hash = ${JSON.stringify(pageHash("quizfinal1"))}`);
  await sco.getByRole("button", { name: label["quiz.begin"] }).click();
  await sco.getByRole("radio", { name: answer }).check();
  await sco.getByRole("button", { name: label["quiz.submit"] }).click();
  await sco.getByRole("button", { name: label["quiz.showResults"] }).click();
}

/** Fails the compost course's quiz on the first visit. */
export async function failQuiz(sco: CourseFrame) {
  await takeQuiz(sco, "Green");
  await expect(sco.locator(".quiz-outcome")).toHaveText(label["quiz.failed"]);
}

/** Passes the compost course's quiz on the first visit, without the lessons. */
export async function passQuiz(sco: CourseFrame) {
  await takeQuiz(sco, "Brown");
  await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
}

/**
 * The CMI data the conformance test LMS keeps after each of `visits`, each one a launch that
 * resumes where the last left off and ends with the learner closing the course. An LMS may override
 * the status word when the manifest has a mastery score, so this reference, not the LMS, shows what
 * our package reported.
 */
export async function testLmsVisits(
  browser: Browser,
  zip: Uint8Array,
  visits: ((sco: Frame) => Promise<void>)[],
): Promise<CmiData[]> {
  const pkg = await readPackage(zip);
  if (!pkg.ok) throw new Error(JSON.stringify(pkg.problems));
  const descriptor = pkg.value.descriptor;
  const relaunch =
    descriptor.kind === "scorm" && descriptor.manifest.version === "scorm2004"
      ? relaunchCmi2004
      : relaunchCmi;
  const kept: CmiData[] = [];
  let cmi: CmiData | undefined;
  for (const visit of visits) {
    const run = await runPackage(pkg.value, {
      browser,
      ...(cmi && { cmi: relaunch(cmi) }),
      drive: async (sco, host) => {
        await visit(sco);
        await closeSco(host);
      },
    });
    cmi = run.cmi;
    kept.push(cmi);
  }
  return kept;
}
