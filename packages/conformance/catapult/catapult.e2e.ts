// cmi5 in ADL CATAPULT's Content Test Suite (M2-21, STD-03, STD-07; standards.md T-2, C-1 to C-9):
// the cmi5 package of a quiz course, exported with the publish panel's settings, is imported into
// the CTS (compose.yaml), a conformance test is started, and its AU is launched through CATAPULT's
// cmi5 player, which checks every request against the cmi5 requirements. One learner completes a
// lesson, closes the course, is launched again in the same registration, resumes where they stopped
// and passes the quiz; another fails it. The CTS's report of each test goes to reports/, which CI
// keeps as an artifact, and the score the course sent is read back from the player's LRS.
//
// The CTS counts an AU conformant when no request broke a cmi5 requirement and the AU is satisfied
// by its move-on rule. The course moves on when passed (its quiz decides), so a failed AU is never
// satisfied: the CTS leaves it pending, with no requirement broken.
//
// Start CATAPULT first: `pnpm --filter @course-suite/conformance catapult:up` (docs/ci.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { statementsOf } from "../lrs/lrs.js";
import { compost, failQuiz, firstVisit, secondVisit } from "../test/compost.js";
import { exportedZip } from "../test/hosts.js";
import {
  CATAPULT_LRS,
  importCourse,
  launchAu,
  loggedUntil,
  registrationOf,
  report,
  sessionOf,
  startTest,
} from "./catapult.js";

const REPORTS = join(import.meta.dirname, "reports");
const course = compost("cmi5");
const VERBS = "http://adlnet.gov/expapi/verbs";
/** The cmi5-defined verbs (cmi5 section 9.3), the ones each session's order is checked for. */
const DEFINED = ["initialized", "completed", "passed", "failed", "terminated"];

/** One launch of the AU: what the learner does, and the cmi5-defined verbs it sends, in order. */
interface Visit {
  learner: (page: Page) => Promise<void>;
  verbs: readonly string[];
}

interface Run {
  name: string;
  rules: string;
  title: string;
  visits: Visit[];
  /** The verdict statement the LRS holds once, and its result. */
  verdict: { verb: string; result: Record<string, unknown> };
  /** The CTS's result for the AU and the test. */
  result: string;
}

const RUNS: Run[] = [
  {
    name: "passed",
    rules:
      "[standards:C-1] [standards:C-2] [standards:C-3] [standards:C-4] [standards:C-5] [standards:C-6] [standards:C-7] [standards:C-8] [standards:C-9] [standards:R14]",
    title:
      "completes a lesson, closes the course, is launched again, resumes where they stopped and passes the quiz",
    visits: [
      // Nothing decided yet: no completed, passed or failed (standards.md C-3).
      { learner: (page) => firstVisit(page, course), verbs: ["initialized", "terminated"] },
      {
        // secondVisit checks that the cover's resume link goes to the lesson the first launch left
        // open, read from the AU's state (standards.md C-2, C-9), then works through the quiz.
        learner: async (page) => {
          await secondVisit(page, course);
          await expect(page.locator(".quiz-score")).toHaveText("Your score: 100%");
        },
        // Completed before passed, each once, then terminated (standards.md C-5, C-6).
        verbs: ["initialized", "completed", "passed", "terminated"],
      },
    ],
    verdict: {
      verb: "passed",
      result: { success: true, score: { scaled: 1, raw: 100, min: 0, max: 100 } },
    },
    result: "conformant",
  },
  {
    name: "failed",
    rules: "[standards:C-4] [standards:C-6] [standards:C-8]",
    title: "fails the quiz",
    visits: [{ learner: failQuiz, verbs: ["initialized", "failed", "terminated"] }],
    verdict: { verb: "failed", result: { success: false, score: { scaled: 0, raw: 0 } } },
    result: "pending",
  },
];

for (const run of RUNS) {
  test(`[standards:T-2] ${run.rules} the CTS finds no broken cmi5 requirement when a learner ${run.title}; the LRS holds ${run.verdict.verb} with the score, and the CTS reports the AU ${run.result}`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const { id: courseId } = await importCourse(await exportedZip(course, "cmi5"));
    const cmi5Test = await startTest(courseId);
    let registration: string | undefined;
    try {
      for (const [i, visit] of run.visits.entries()) {
        await test.step(`launch ${i + 1}`, async () => {
          // Each launch is a new session of the test's one registration (cmi5 section 8.1).
          const session = await launchAu(cmi5Test.id);
          registration ??= registrationOf(session.launchUrl);
          expect(registrationOf(session.launchUrl)).toBe(registration);
          await page.goto(session.launchUrl);
          await visit.learner(page);
          // Leaving the page is the learner closing the course: terminated goes out on page-hide.
          await page.goto("about:blank");
          const logged = await loggedUntil(session.id, "terminated");

          expect(pageErrors).toEqual([]);
          expect((await sessionOf(session.id)).metadata.violatedReqIds).toEqual([]);
          expect(logged).not.toContain("Spec requirement violated");
          const recorded = logged
            .filter((summary) => summary?.startsWith("Statement recorded: "))
            .map((summary) => summary?.slice("Statement recorded: ".length));
          expect(
            recorded.filter((verb) => DEFINED.some((name) => verb === `${VERBS}/${name}`)),
          ).toEqual(visit.verbs.map((name) => `${VERBS}/${name}`));
        });
      }
    } finally {
      // The report is kept whether or not the checks above held.
      const testReport = await report(cmi5Test.id);
      mkdirSync(REPORTS, { recursive: true });
      writeFileSync(
        join(REPORTS, `catapult-cts-${run.name}-${cmi5Test.code}.json`),
        `${JSON.stringify(testReport, null, 2)}\n`,
      );
    }

    // What reached the LRS through the CTS and the player: the verdict once, with the quiz's score
    // (standards.md C-4, X-2). The CTS logged it as recorded, so the LRS already holds it.
    const statements = await statementsOf(CATAPULT_LRS, registration ?? "");
    const verdicts = statements.filter((s) => s.verb.id === `${VERBS}/${run.verdict.verb}`);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ result: run.verdict.result });

    const { metadata } = await report(cmi5Test.id);
    expect(metadata.aus.map((au) => au.result)).toEqual([run.result]);
    expect(metadata.result).toBe(run.result);
  });
}
