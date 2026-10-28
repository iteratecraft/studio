// Moodle end to end (M1-21, STD-04; standards.md T-4): SCORM 1.2 packages built by our exporters
// are uploaded to a real Moodle (compose.yaml) and taken by a learner in Chromium: launch, a lesson
// completed, the course closed with Moodle's exit button, relaunched, resumed at the right lesson
// and finished. Then the test reads what Moodle recorded in its SCORM tables. SCORM 1.2 only:
// Moodle does not implement SCORM 2004 sequencing fully, nor xAPI or cmi5 without plugins
// (standards.md T-4); those standards are verified in the conformance hosts (standards.e2e.ts).
//
// Start Moodle first: `pnpm --filter @course-suite/conformance moodle:up` (docs/ci.md).
import { scorm12Exporter } from "@course-suite/exporters";
import { type Course, publishSettingsOf } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { english } from "@course-suite/labels";
import { pageHash, pagesOf } from "@course-suite/player-blocks";
import { type Browser, expect, type Frame, test } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import type { CmiData } from "../src/test-lms.js";
import { blocksZip, corpusCourses, fixtureCourses } from "../test/blocks.js";
import { walkPages } from "../test/learner.js";
import { FALLING, failThrice, ids, pond } from "../test/pond.js";
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

/**
 * What the test LMS keeps after each of `visits`, each one a launch that resumes where the last
 * left off and ends with the learner closing the course. Moodle overrides the status word when the
 * manifest has a mastery score, so this reference, not Moodle, shows what our package reported.
 */
async function keptByTestLmsAfter(
  browser: Browser,
  zip: Uint8Array,
  visits: ((sco: Frame) => Promise<void>)[],
) {
  const pkg = await readPackage(zip);
  if (!pkg.ok) throw new Error(JSON.stringify(pkg.problems));
  const kept = [];
  let cmi: CmiData | undefined;
  for (const visit of visits) {
    const run = await runPackage(pkg.value, {
      browser,
      ...(cmi && { cmi: relaunchCmi(cmi) }),
      drive: async (sco, host) => {
        await visit(sco);
        await closeSco(host);
      },
    });
    cmi = run.cmi;
    kept.push(keptByTestLms(cmi));
  }
  return kept;
}

// The format's fixtures, and the corpus when a test-courses checkout is present, each with the
// settings the publish panel saves for it (M2-18): its own over the panel's defaults, LMS-only
// launch included.
for (const { name, media, ...fixture } of [...fixtureCourses(), ...(corpusCourses() ?? [])]) {
  const course: Course = {
    ...fixture.course,
    publish: { ...publishSettingsOf(fixture.course), standard: "scorm12" },
  };
  test(`[standards:T-4] [standards:P-7] [standards:R9] [rise:R1] [rise:R2] ${name}: Moodle keeps what the test LMS keeps across a closed and resumed visit`, async ({
    browser,
    page,
  }) => {
    const zip = await blocksZip(course, scorm12Exporter(), media);
    // The same two visits in the test LMS give what Moodle should keep.
    const [reference, referenceEnd] = await keptByTestLmsAfter(browser, zip, [
      (sco) => firstVisit(sco, course),
      (sco) => secondVisit(sco, course),
    ]);

    const activity = upload(zip, name);
    await logIn(page);
    await firstVisit(await launch(page, activity), course);
    await exitActivity(page);
    const left = await trackedVisit(activity);
    expect(kept(left)).toEqual(reference);
    expect(left.elements["cmi.suspend_data"]).toMatch(/^1\./);
    expect(totalTime(left)).toBeGreaterThan(0);

    await secondVisit(await launch(page, activity), course);
    await exitActivity(page);
    const ended = await trackedVisit(activity, left);
    expect(kept(ended)).toEqual(referenceEnd);
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

/** Fails the one-question quiz on the first visit; the quiz allows no retake. */
async function failQuiz(sco: Frame) {
  await sco.getByRole("link", { name: label["course.begin"] }).click();
  await sco.evaluate(`location.hash = ${JSON.stringify(pageHash("quizfinal1"))}`);
  await sco.getByRole("button", { name: label["quiz.begin"] }).click();
  await sco.getByRole("radio", { name: "Green" }).check();
  await sco.getByRole("button", { name: label["quiz.submit"] }).click();
  await sco.getByRole("button", { name: label["quiz.showResults"] }).click();
  await expect(sco.locator(".quiz-outcome")).toHaveText(label["quiz.failed"]);
}

test("[standards:T-4] [standards:R2] [standards:R8] [standards:R9] [standards:R11] [standards:R12] [standards:P-7] [rise:R1] [rise:R2] [rise:R7] a learner completes a lesson, closes, relaunches, resumes at the next lesson and passes: our package reports passed with the score and Moodle keeps it", async ({
  browser,
  page,
}) => {
  const zip = await blocksZip(compost, scorm12Exporter());
  // What our package reports, in the test LMS: the manifest's mastery score lets Moodle derive
  // passed from the score whatever status word the course sent.
  const [reference, referenceEnd] = await keptByTestLmsAfter(browser, zip, [
    (sco) => firstVisit(sco, compost),
    async (sco) => {
      await secondVisit(sco, compost);
      await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
    },
  ]);
  expect(reference).toEqual({ status: "incomplete", location: "#/lessons/lessontwo1", score: "" });
  expect(referenceEnd).toMatchObject({ status: "passed", score: "100" });

  const activity = upload(zip, "Compost basics, passed");
  await logIn(page);

  await firstVisit(await launch(page, activity), compost);
  await exitActivity(page);
  const left = await trackedVisit(activity);
  expect(kept(left)).toEqual(reference);
  expect(left.elements).toMatchObject({ "cmi.core.exit": "suspend" });
  expect(left.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(left)).toBeGreaterThan(0);

  const sco = await launch(page, activity);
  await secondVisit(sco, compost);
  await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
  await exitActivity(page);
  const ended = await trackedVisit(activity, left);
  expect(kept(ended)).toEqual(referenceEnd);
  expect(ended.elements).toMatchObject({
    "cmi.core.score.min": "0",
    "cmi.core.score.max": "100",
  });
  expect(ended.attempts).toBe(1);
  expect(ended.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(ended)).toBeGreaterThan(totalTime(left));
});

test("[standards:T-4] [standards:R11] [standards:R12] [rise:R7] a learner who fails the quiz: our package reports failed with the score and Moodle keeps it", async ({
  browser,
  page,
}) => {
  const zip = await blocksZip(compost, scorm12Exporter());
  // What our package reports, in the test LMS (see the passed case).
  const [reference] = await keptByTestLmsAfter(browser, zip, [failQuiz]);
  expect(reference).toMatchObject({ status: "failed", score: "0" });

  const activity = upload(zip, "Compost basics, failed");
  await logIn(page);
  await failQuiz(await launch(page, activity));
  await exitActivity(page);

  const ended = await trackedVisit(activity);
  expect(kept(ended)).toEqual(reference);
  expect(ended.elements["cmi.suspend_data"]).toMatch(/^1\./);
  expect(totalTime(ended)).toBeGreaterThan(0);
});

/** Every interaction Moodle keeps, by its number: its id, type and result. */
function keptInteractions(elements: Record<string, string>) {
  const found = new Map<number, Record<string, string>>();
  for (const [element, value] of Object.entries(elements)) {
    // Moodle may write the index with a dot or an underscore (cmi.interactions_0.id).
    const match = /^cmi\.interactions[._](\d+)\.(id|type|result)$/.exec(element);
    if (!match) continue;
    const n = Number(match[1]);
    found.set(n, { ...found.get(n), [match[2] as string]: value });
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, fields]) => fields);
}

test("[standards:T-4] [rise:R8] [rise:R10] [rise:R11] BLK-07: three failed attempts at a quiz of every question type, with falling scores and passing required: Moodle keeps the best score and failed, and an interaction per answer named by rule 11", async ({
  browser,
  page,
}) => {
  const zip = await blocksZip(pond("scorm12"), scorm12Exporter());
  const [reference] = await keptByTestLmsAfter(browser, zip, [failThrice]);
  expect(reference).toMatchObject({ status: "failed", score: "50" });

  const activity = upload(zip, "Pond life, three attempts");
  await logIn(page);
  await failThrice(await launch(page, activity));
  await exitActivity(page);
  const ended = await trackedVisit(activity);
  expect(kept(ended)).toEqual(reference);
  const kept12 = keptInteractions(ended.elements);
  expect(kept12.map((interaction) => interaction.id)).toEqual([...ids(1), ...ids(2), ...ids(3)]);
  expect(kept12.slice(0, 4).map((interaction) => interaction.type)).toEqual([
    "choice",
    "choice",
    "fill-in",
    "matching",
  ]);
  expect(kept12.map((interaction) => interaction.result === "correct")).toEqual(FALLING.flat());
});
