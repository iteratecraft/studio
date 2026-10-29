// ILIAS end to end (M2-21, STD-19; standards.md T-5): SCORM 1.2 and SCORM 2004 4th edition packages,
// exported with the publish panel's settings, are uploaded to a real ILIAS (compose.yaml) as learning
// modules and taken by a learner in Chromium: a lesson completed, the player left, relaunched,
// resumed at the right lesson and the quiz passed; and a quiz failed. Then the test reads what ILIAS
// recorded in its tracking tables and holds it to what the conformance test LMS keeps after the same
// visits.
//
// Start ILIAS first: `pnpm --filter @course-suite/conformance ilias:up` (docs/ci.md).
import { expect, test } from "@playwright/test";
import type { CmiData } from "../src/test-lms.js";
import { compost, failQuiz, firstVisit, secondVisit, testLmsVisits } from "../test/compost.js";
import { exportedZip } from "../test/hosts.js";
import { launch, leave, logIn, type Tracks, trackedVisit, upload } from "./ilias.js";

/** Status, bookmark, score and resume data, the same way for ILIAS and the test LMS. */
interface Kept {
  completion: string;
  success: string;
  location: string;
  /** Raw score, or NaN when none is kept. */
  raw: number;
  suspend: string;
}

/** Numbers as numbers: ILIAS keeps 2004 scores in number columns, which print as "100" or "100.0". */
const number = (value: unknown) =>
  value === undefined || value === "" ? Number.NaN : Number(value);

const VERSIONS = {
  scorm12: {
    name: "SCORM 1.2",
    /** One status in 1.2: both fields show it. */
    ilias: ({ elements }: Tracks): Kept => ({
      completion: elements["cmi.core.lesson_status"] ?? "",
      success: elements["cmi.core.lesson_status"] ?? "",
      location: elements["cmi.core.lesson_location"] ?? "",
      raw: number(elements["cmi.core.score.raw"]),
      suspend: elements["cmi.suspend_data"] ?? "",
    }),
    testLms: (cmi: CmiData): Kept => {
      const core = cmi.core as {
        lesson_status: string;
        lesson_location: string;
        score: { raw: string };
      };
      return {
        completion: core.lesson_status,
        success: core.lesson_status,
        location: core.lesson_location,
        raw: number(core.score.raw),
        suspend: String(cmi.suspend_data ?? ""),
      };
    },
  },
  scorm2004: {
    name: "SCORM 2004",
    ilias: ({ elements }: Tracks): Kept => ({
      completion: elements.completion_status ?? "",
      success: elements.success_status ?? "",
      location: elements.location ?? "",
      raw: number(elements.c_raw),
      suspend: elements.suspend_data ?? "",
    }),
    testLms: (cmi: CmiData): Kept => {
      const score = cmi.score as { raw: string };
      return {
        completion: String(cmi.completion_status),
        success: String(cmi.success_status),
        location: String(cmi.location ?? ""),
        raw: number(score.raw),
        suspend: String(cmi.suspend_data ?? ""),
      };
    },
  },
} as const;

/** NaN never equals itself: compare kept values with scores as text. */
const comparable = (kept: Kept) => ({ ...kept, raw: String(kept.raw) });

for (const [standard, version] of Object.entries(VERSIONS) as [
  keyof typeof VERSIONS,
  (typeof VERSIONS)[keyof typeof VERSIONS],
][]) {
  const course = compost(standard);

  test(`[standards:T-5] [standards:P-7] [standards:R10] [standards:R11] [standards:R12] [rise:R1] [rise:R2] [rise:R7] ${version.name}: a learner completes a lesson, leaves, relaunches, resumes at the next lesson and passes; ILIAS keeps the status, bookmark, score and resume data the test LMS keeps`, async ({
    browser,
    page,
  }) => {
    const zip = await exportedZip(course, standard);
    const [reference, referenceEnd] = (
      await testLmsVisits(browser, zip, [
        (sco) => firstVisit(sco, course),
        (sco) => secondVisit(sco, course),
      ])
    ).map(version.testLms);
    expect(reference?.location).toBe("#/lessons/lessontwo1");
    expect(referenceEnd?.raw).toBe(100);

    const module = upload(zip, `Compost basics, ${version.name}, passed`, standard);
    await logIn(page);

    await firstVisit(await launch(page, module), course);
    await leave(page);
    const left = await trackedVisit(module);
    expect(comparable(version.ilias(left))).toEqual(comparable(reference as Kept));
    expect(version.ilias(left).suspend).toMatch(/^1\./);

    const sco = await launch(page, module);
    await secondVisit(sco, course);
    await expect(sco.locator(".quiz-score")).toHaveText("Your score: 100%");
    await leave(page);
    const ended = await trackedVisit(module, left);
    expect(comparable(version.ilias(ended))).toEqual(comparable(referenceEnd as Kept));
  });

  test(`[standards:T-5] [standards:R10] [standards:R11] [standards:R12] [rise:R7] ${version.name}: a learner who fails the quiz; ILIAS keeps the failed status and score the test LMS keeps`, async ({
    browser,
    page,
  }) => {
    const zip = await exportedZip(course, standard);
    const [reference] = (await testLmsVisits(browser, zip, [failQuiz])).map(version.testLms);
    expect(reference).toMatchObject({ success: "failed", raw: 0 });

    const module = upload(zip, `Compost basics, ${version.name}, failed`, standard);
    await logIn(page);
    await failQuiz(await launch(page, module));
    await leave(page);
    const ended = await trackedVisit(module);
    expect(comparable(version.ilias(ended))).toEqual(comparable(reference as Kept));
  });
}
