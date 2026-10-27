// A quiz lesson with every question type in every standard (M2-15, BLK-07; rise.md 3I, rules 7, 8,
// 10 and 11; standards.md §4.1 to §4.4; blocks-interactions.md UI-BLOCKS-R32 to R38): a pass, and
// a fail over three attempts with falling scores where passing is required and the retries run
// out. Each answered question is an interaction (SCORM) or an answered statement (xAPI, cmi5), the
// LMS keeps the best score, a failed learner never completes the course, and a closed attempt
// resumes with its answers and the attempts used.
import type { Course } from "@course-suite/format";
import { expect, test } from "@playwright/test";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import { runXapiPackage } from "../src/run-xapi.js";
import type { ScormCall } from "../src/test-lms.js";
import { statementProblems } from "../src/xapi-statement.js";
import { cmi5Package, scorm12Package, scorm2004Package, xapiPackage } from "../test/blocks.js";
import {
  ANSWERS,
  answer,
  expectNoWayOn,
  FALLING,
  failThrice,
  ids,
  openQuiz,
  passOnce,
  pond,
  start,
} from "../test/pond.js";

const sets = (trace: ScormCall[], element: string) =>
  trace
    .filter((call) => call.method.endsWith("SetValue") && call.args[0] === element)
    .map((call) => call.args[1]);
/** Values set for `field` of every interaction, in order. */
const interactions = (trace: ScormCall[], field: string) =>
  trace
    .filter(
      (call) =>
        call.method.endsWith("SetValue") &&
        new RegExp(`^cmi\\.interactions\\.\\d+\\.${field}$`).test(String(call.args[0])),
    )
    .map((call) => call.args[1]);

test.describe("SCORM 1.2", () => {
  test("[rise:R7] [rise:R8] [rise:R10] [rise:R11] [standards:R11] UI-BLOCKS-R38, BLK-07: three failed attempts with falling scores, over a closed and resumed visit: the LMS keeps the best score and failed, every answer is an interaction, and the course never completes", async ({
    browser,
  }) => {
    const pkg = await scorm12Package(pond("scorm12"));
    // First visit: attempt 1 at 50 %, then attempt 2 closed after its first answer.
    const first = await runPackage(pkg, {
      browser,
      drive: async (sco, host) => {
        await sco.getByRole("link", { name: "Begin course" }).click();
        await openQuiz(sco);
        await start(sco);
        await answer(sco, FALLING[0] as boolean[]);
        await start(sco);
        await ANSWERS[0]?.(sco, true);
        await sco.getByRole("button", { name: "Submit" }).click();
        await closeSco(host);
      },
    });
    expect(first.pageErrors).toEqual([]);
    expect(first.cmi.core).toMatchObject({
      lesson_status: "failed",
      score: { raw: "50", min: "0", max: "100" },
    });

    // Second visit: the attempt resumes at its second question with its first answer kept.
    const second = await runPackage(pkg, {
      browser,
      cmi: relaunchCmi(first.cmi),
      drive: async (sco, host) => {
        await sco.getByRole("link", { name: "Resume where you stopped" }).click();
        await expect(sco.getByRole("heading", { level: 2 })).toHaveText("Question 2 of 4");
        await answer(sco, FALLING[1] as boolean[], 1);
        await expect(sco.locator(".quiz-score")).toHaveText("Your score: 25%");
        await expect(sco.getByText("Attempts left: 1")).toBeVisible();
        await start(sco);
        await answer(sco, FALLING[2] as boolean[]);
        await expect(sco.locator(".quiz-score")).toHaveText("Your score: 0%");
        await expectNoWayOn(sco);
        await closeSco(host);
      },
    });
    expect(second.pageErrors).toEqual([]);
    // rise.md rule 8: the best score, never a lower later one.
    expect(
      new Set([
        ...sets(first.trace, "cmi.core.score.raw"),
        ...sets(second.trace, "cmi.core.score.raw"),
      ]),
    ).toEqual(new Set(["50"]));
    expect(second.cmi.core).toMatchObject({
      lesson_status: "failed",
      score: { raw: "50", min: "0", max: "100" },
      exit: "suspend",
    });
    // Rules 10 and 11: one interaction per answer, named by quiz title, question text and attempt.
    expect([...interactions(first.trace, "id"), ...interactions(second.trace, "id")]).toEqual([
      ...ids(1),
      ids(2)[0],
      ...ids(2).slice(1),
      ...ids(3),
    ]);
    expect(interactions(second.trace, "type")).toEqual([
      "choice",
      "fill-in",
      "matching",
      ...["choice", "choice", "fill-in", "matching"],
    ]);
    expect(interactions(first.trace, "result")).toEqual([
      "correct",
      "correct",
      "wrong",
      "wrong",
      "correct",
    ]);
    expect(interactions(first.trace, "weighting")).toEqual(["1", "1", "1", "1", "1"]);
    expect(interactions(first.trace, "student_response").slice(0, 4)).toEqual([
      "In-water",
      "Dragonfly,Water-beetle",
      "reed",
      "Tadpole.Dragonfly,Nymph.Frog",
    ]);
  });

  test("[rise:R7] [rise:R8] [standards:R11] a pass on the first attempt is reported passed with its score", async ({
    browser,
  }) => {
    const run = await runPackage(await scorm12Package(pond("scorm12")), {
      browser,
      drive: async (sco, host) => {
        await passOnce(sco);
        await closeSco(host);
      },
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.cmi.core).toMatchObject({
      lesson_status: "passed",
      score: { raw: "100", min: "0", max: "100" },
    });
    expect(interactions(run.trace, "result")).toEqual(["correct", "correct", "correct", "correct"]);
  });
});

test.describe("SCORM 2004", () => {
  test("[rise:R8] [rise:R10] [standards:R12] three failed attempts keep the best scaled score and failed, with an interaction per answer; a pass is passed and completed", async ({
    browser,
  }) => {
    const pkg = await scorm2004Package(pond("scorm2004"));
    const failed = await runPackage(pkg, {
      browser,
      drive: async (sco, host) => {
        await failThrice(sco);
        await closeSco(host);
      },
    });
    expect(failed.pageErrors).toEqual([]);
    // standards.md rule 10: in SCORM 2004 failed also sets completion; success stays failed.
    expect(failed.cmi).toMatchObject({
      success_status: "failed",
      score: { scaled: "0.5", raw: "50", min: "0", max: "100" },
    });
    expect(new Set(sets(failed.trace, "cmi.score.scaled"))).toEqual(new Set(["0.5"]));
    expect(interactions(failed.trace, "id")).toEqual([...ids(1), ...ids(2), ...ids(3)]);
    expect(interactions(failed.trace, "type").slice(0, 4)).toEqual([
      "choice",
      "choice",
      "fill-in",
      "matching",
    ]);

    const passed = await runPackage(pkg, {
      browser,
      drive: async (sco, host) => {
        await passOnce(sco);
        await closeSco(host);
      },
    });
    expect(passed.cmi).toMatchObject({
      success_status: "passed",
      completion_status: "completed",
      score: { scaled: "1", raw: "100" },
    });
  });
});

type Statement = {
  verb: { id: string };
  object: { id: string };
  result?: { score?: { scaled?: number }; success?: boolean } & Record<string, unknown>;
};
const verbs = (statements: unknown[], verb: string) =>
  (statements as Statement[]).filter((s) => s.verb.id.endsWith(`/${verb}`));

for (const standard of ["xapi", "cmi5"] as const) {
  const build = (course: Course) =>
    standard === "xapi" ? xapiPackage(course) : cmi5Package(course);
  test.describe(standard, () => {
    test(`[rise:R8] [rise:R10] [standards:X-2] ${standard}: every answer is an answered statement, each attempt failed with its score, the course failed with the best one; a pass is passed with its score`, async ({
      browser,
    }) => {
      const pkg = await build(pond(standard));
      const failed = await runXapiPackage(pkg, { browser, drive: failThrice });
      expect(failed.pageErrors).toEqual([]);
      const statements = failed.lrs.statements;
      for (const statement of statements) expect(statementProblems(statement, "1.0")).toEqual([]);
      const answered = verbs(statements, "answered");
      expect(answered).toHaveLength(12);
      expect(answered.map((s) => s.result?.success)).toEqual(FALLING.flat());
      const quiz = verbs(statements, "failed").filter((s) => s.object.id.endsWith("/quizpond01"));
      // xAPI reports each attempt; cmi5 sends its defined verbs once a session, for the course only
      // (standards.md C-6).
      expect(quiz.map((s) => s.result?.score?.scaled)).toEqual(
        standard === "xapi" ? [0.5, 0.25, 0] : [],
      );
      const course = verbs(statements, "failed").filter(
        (s) => !s.object.id.endsWith("/quizpond01"),
      );
      expect(course.at(-1)?.result?.score?.scaled).toBe(0.5);
      expect(verbs(statements, "passed")).toEqual([]);
      expect(verbs(statements, "completed")).toEqual([]);

      const passed = await runXapiPackage(pkg, { browser, drive: passOnce });
      expect(passed.pageErrors).toEqual([]);
      const won = verbs(passed.lrs.statements, "passed");
      expect(won.map((s) => s.result?.score?.scaled)).toEqual(standard === "xapi" ? [1, 1] : [1]);
    });
  });
}
