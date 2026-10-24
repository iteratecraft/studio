// Moodle end to end (M1-21, STD-04; standards.md T-4): SCORM 1.2 packages built by our exporters
// are uploaded to a real Moodle (compose.yaml) and taken by a learner in Chromium: launch, a lesson
// completed, the course closed with Moodle's exit button, relaunched, resumed at the right lesson
// and finished. Then the test reads what Moodle recorded in its SCORM tables. SCORM 1.2 only:
// Moodle does not implement SCORM 2004 sequencing fully, nor xAPI or cmi5 without plugins
// (standards.md T-4); those standards are verified in the conformance hosts (standards.e2e.ts).
//
// Start Moodle first: `pnpm --filter @course-suite/conformance moodle:up` (docs/ci.md).
import { scorm12Exporter } from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { english } from "@course-suite/labels";
import { pageHash, pagesOf } from "@course-suite/player-blocks";
import { expect, type Frame, test } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import type { CmiData } from "../src/test-lms.js";
import { blocksZip, corpusCourses, fixtureCourses } from "../test/blocks.js";
import { walkPages } from "../test/learner.js";
import { exitActivity, launch, logIn, type Tracks, trackedVisit, upload } from "./moodle.js";

const label = english.labels;

/** The first two pages of `course`; every course here has at least two. */
function firstTwo(course: Course) {
  const [first, second, ...rest] = pagesOf(course);
  if (!first || !second) throw new Error(`${course.title} has fewer than two pages`);
  return { first, second, rest };
}

/** First visit: begin, work through the first page, then open the second. */
async function firstVisit(sco: Frame, course: Course) {
  const { first, second } = firstTwo(course);
  await sco.getByRole("link", { name: label["course.begin"] }).click();
  await walkPages(sco, [first]);
  await sco.evaluate(`location.hash = ${JSON.stringify(pageHash(second.id))}`);
  await expect(sco.locator("h1")).toHaveText(second.title);
}

/** Second visit: the cover offers to resume at the second page; from there to the end. */
async function secondVisit(sco: Frame, course: Course) {
  const { second, rest } = firstTwo(course);
  const resume = sco.getByRole("link", { name: label["course.resume"] });
  await expect(resume).toHaveAttribute("href", pageHash(second.id));
  await resume.click();
  await expect(sco.locator("h1")).toHaveText(second.title);
  await walkPages(sco, [second, ...rest]);
}

/** A SCORM 1.2 time span (HHHH:MM:SS.SS) in seconds. */
const seconds = (time = "") =>
  time.split(":").reduce((total, part) => total * 60 + Number(part), 0);

const totalTime = (tracks: Tracks) => seconds(tracks.elements["cmi.core.total_time"]);

/** Status, bookmark and score as Moodle keeps them; it stores an element only once it is set. */
const kept = ({ elements }: Tracks) => ({
  status: elements["cmi.core.lesson_status"],
  location: elements["cmi.core.lesson_location"] ?? "",
  score: elements["cmi.core.score.raw"] ?? "",
});

/** The same from the test LMS's CMI data. */
const keptByTestLms = (cmi: CmiData) => {
  const core = cmi.core as {
    lesson_status: string;
    lesson_location: string;
    score: { raw: string };
  };
  return { status: core.lesson_status, location: core.lesson_location, score: core.score.raw };
};

// The format's fixtures, and the corpus when a test-courses checkout is present.
for (const { name, media, ...fixture } of [...fixtureCourses(), ...(corpusCourses() ?? [])]) {
  const course: Course = {
    ...fixture.course,
    publish: { ...fixture.course.publish, standard: "scorm12" },
  };
  test(`[standards:T-4] [standards:P-7] [standards:R9] [rise:R1] [rise:R2] ${name}: Moodle keeps what the test LMS keeps across a closed and resumed visit`, async ({
    browser,
    page,
  }) => {
    const zip = await blocksZip(course, scorm12Exporter(), media);
    const pkg = readPackage(zip);
    if (!pkg.ok) throw new Error(JSON.stringify(pkg.problems));

    // The same two visits in the test LMS give what Moodle should keep.
    const reference = await runPackage(pkg.value, {
      browser,
      drive: async (sco, host) => {
        await firstVisit(sco, course);
        await closeSco(host);
      },
    });
    const referenceEnd = await runPackage(pkg.value, {
      browser,
      cmi: relaunchCmi(reference.cmi),
      drive: async (sco, host) => {
        await secondVisit(sco, course);
        await closeSco(host);
      },
    });

    const activity = upload(zip, name);
    await logIn(page);
    await firstVisit(await launch(page, activity), course);
    await exitActivity(page);
    const left = await trackedVisit(activity);
    expect(kept(left)).toEqual(keptByTestLms(reference.cmi));
    expect(left.elements["cmi.suspend_data"]).toMatch(/^1\./);
    expect(totalTime(left)).toBeGreaterThan(0);

    await secondVisit(await launch(page, activity), course);
    await exitActivity(page);
    const ended = await trackedVisit(activity, left);
    expect(kept(ended)).toEqual(keptByTestLms(referenceEnd.cmi));
    // Resuming continues the attempt.
    expect(ended.attempts).toBe(1);
    expect(ended.elements["cmi.suspend_data"]).toMatch(/^1\./);
    expect(totalTime(ended)).toBeGreaterThan(totalTime(left));
  });
}

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Two lessons and a one-question quiz without retakes that decides passed or failed. */
const compost: Course = {
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en",
  publish: {
    standard: "scorm12",
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

test("[standards:T-4] [standards:R2] [standards:R8] [standards:R9] [standards:R11] [standards:R12] [standards:P-7] [rise:R1] [rise:R2] [rise:R7] a learner completes a lesson, closes, relaunches, resumes at the next lesson and passes: Moodle records passed with the score", async ({
  page,
}) => {
  const activity = upload(await blocksZip(compost, scorm12Exporter()), "Compost basics, passed");
  await logIn(page);

  await firstVisit(await launch(page, activity), compost);
  await exitActivity(page);
  const left = await trackedVisit(activity);
  expect(left.elements).toMatchObject({
    "cmi.core.lesson_status": "incomplete",
    "cmi.core.lesson_location": "#/lessons/lessontwo1",
    "cmi.core.exit": "suspend",
  });
  expect(left.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(left)).toBeGreaterThan(0);

  const sco = await launch(page, activity);
  await secondVisit(sco, compost);
  await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
  await exitActivity(page);
  const ended = await trackedVisit(activity, left);
  expect(ended.elements).toMatchObject({
    "cmi.core.lesson_status": "passed",
    "cmi.core.score.raw": "100",
    "cmi.core.score.min": "0",
    "cmi.core.score.max": "100",
  });
  expect(ended.attempts).toBe(1);
  expect(ended.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(ended)).toBeGreaterThan(totalTime(left));
});

test("[standards:T-4] [standards:R11] [standards:R12] [rise:R7] a learner who fails the quiz: Moodle records failed with the score", async ({
  page,
}) => {
  const activity = upload(await blocksZip(compost, scorm12Exporter()), "Compost basics, failed");
  await logIn(page);

  const sco = await launch(page, activity);
  await sco.getByRole("link", { name: label["course.begin"] }).click();
  await sco.evaluate(`location.hash = ${JSON.stringify(pageHash("quizfinal1"))}`);
  await sco.getByRole("button", { name: label["quiz.begin"] }).click();
  await sco.getByRole("radio", { name: "Green" }).check();
  await sco.getByRole("button", { name: label["quiz.submit"] }).click();
  await sco.getByRole("button", { name: label["quiz.showResults"] }).click();
  await expect(sco.locator(".quiz-outcome")).toHaveText(label["quiz.failed"]);
  await exitActivity(page);

  const ended = await trackedVisit(activity);
  expect(ended.elements).toMatchObject({
    "cmi.core.lesson_status": "failed",
    "cmi.core.score.raw": "0",
  });
  expect(ended.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(ended)).toBeGreaterThan(0);
});
