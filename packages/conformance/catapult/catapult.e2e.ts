// cmi5 in ADL CATAPULT's Content Test Suite (M2-21, STD-03, STD-07; standards.md T-2, C-1 to C-9):
// the cmi5 package of a quiz course, exported with the publish panel's settings, is imported into
// the CTS (compose.yaml), a conformance test is started, and its AU is launched through CATAPULT's
// cmi5 player, which checks every request against the cmi5 requirements; a learner passes the quiz,
// or fails it. The CTS's report of each test goes to reports/, which CI keeps as an artifact.
//
// The CTS counts an AU conformant when no request broke a cmi5 requirement and the AU is satisfied
// by its move-on rule. The course moves on when passed (its quiz decides), so a failed AU is never
// satisfied: the CTS leaves it pending, with no requirement broken.
//
// Start CATAPULT first: `pnpm --filter @course-suite/conformance catapult:up` (docs/ci.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { compost, failQuiz, passQuiz } from "../test/compost.js";
import { exportedZip } from "../test/hosts.js";
import { importCourse, launchAu, loggedUntil, report, sessionOf, startTest } from "./catapult.js";

const REPORTS = join(import.meta.dirname, "reports");
const course = compost("cmi5");
const VERBS = "http://adlnet.gov/expapi/verbs";

const RUNS = [
  {
    name: "passed",
    rules:
      "[standards:C-1] [standards:C-2] [standards:C-4] [standards:C-5] [standards:C-6] [standards:C-7] [standards:C-8] [standards:C-9] [standards:R14]",
    learner: passQuiz,
    /** Completed before passed, each once, then terminated (standards.md C-5, C-6). */
    verbs: ["initialized", "completed", "passed", "terminated"],
    result: "conformant",
  },
  {
    name: "failed",
    rules: "[standards:C-4] [standards:C-6] [standards:C-8]",
    learner: failQuiz,
    verbs: ["initialized", "failed", "terminated"],
    result: "pending",
  },
] as const;

for (const run of RUNS) {
  test(`[standards:T-2] ${run.rules} the CTS finds no broken cmi5 requirement in a launch whose learner ${run.name} the quiz, and reports the AU ${run.result}`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const { id: courseId } = await importCourse(await exportedZip(course, "cmi5"));
    const cmi5Test = await startTest(courseId);
    const session = await launchAu(cmi5Test.id);
    await page.goto(session.launchUrl);
    await run.learner(page);
    // Leaving the page is the learner closing the course: terminated goes out on page-hide.
    await page.goto("about:blank");
    const logged = await loggedUntil(session.id, "terminated");

    const testReport = await report(cmi5Test.id);
    mkdirSync(REPORTS, { recursive: true });
    writeFileSync(
      join(REPORTS, `catapult-cts-${run.name}-${cmi5Test.code}.json`),
      `${JSON.stringify(testReport, null, 2)}\n`,
    );

    expect(pageErrors).toEqual([]);
    expect((await sessionOf(session.id)).metadata.violatedReqIds).toEqual([]);
    expect(logged).not.toContain("Spec requirement violated");
    const recorded = logged
      .filter((summary) => summary?.startsWith("Statement recorded: "))
      .map((summary) => summary?.slice("Statement recorded: ".length));
    // The cmi5-defined statements, in order, among the allowed ones.
    expect(
      recorded.filter((verb) => run.verbs.some((name) => verb === `${VERBS}/${name}`)),
    ).toEqual(run.verbs.map((name) => `${VERBS}/${name}`));
    expect(testReport.metadata.aus.map((au) => au.result)).toEqual([run.result]);
    expect(testReport.metadata.result).toBe(run.result);
  });
}
