// The exit course link without a course menu (M2-16, BLK-08; rise.md 3F; blocks-publish-collab.md
// L1, UI-PUBCOLLAB-R48): a stepped microlearning has no menu, so its exit link sits in the top bar,
// and it still ends the session through the LMS, in SCORM 1.2 and SCORM 2004 packages built by the
// exporters and run in the test LMS. (The xAPI and cmi5 exits, from the same button, are in their
// own files.)
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { expect, test } from "@playwright/test";
import { runPackage } from "../src/run-package.js";
import { scorm12Package, scorm2004Package } from "../test/blocks.js";

const course = (standard: "scorm12" | "scorm2004"): Course => ({
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "microlearning",
  title: "Compost in five minutes",
  sourceLanguage: "en",
  navigation: { steps: true, stepIndicator: "numbers" },
  publish: { standard, exitLink: true },
  entries: [
    {
      id: "lessonmicr",
      kind: "lesson",
      title: "Compost in five minutes",
      blocks: [
        {
          id: "tstep00001",
          category: "text",
          variant: "paragraph",
          items: [{ id: "istep00001", kind: "content", text: "<p>Compost feeds the soil.</p>" }],
        },
        {
          id: "tstep00002",
          category: "text",
          variant: "paragraph",
          items: [{ id: "istep00002", kind: "content", text: "<p>Turn it every week.</p>" }],
        },
      ],
    },
  ],
  media: [],
});

for (const [standard, build, finish, exit] of [
  ["scorm12", scorm12Package, "LMSFinish", "cmi.core.exit"],
  ["scorm2004", scorm2004Package, "Terminate", "cmi.exit"],
] as const) {
  test(`[rise:3F] UI-PUBCOLLAB-R48 BLK-08: in ${standard}, a stepped microlearning's exit link sits in the top bar and ends the session through the LMS`, async ({
    browser,
  }) => {
    const run = await runPackage(await build(course(standard)), {
      browser,
      drive: async (sco) => {
        await sco.getByRole("link", { name: "Begin course" }).click();
        await expect(sco.getByRole("navigation", { name: "Steps" })).toBeVisible();
        await expect(sco.getByRole("navigation", { name: "Course contents" })).toHaveCount(0);
        await sco.getByRole("banner").getByRole("button", { name: "Exit course" }).click();
        await expect(sco.getByRole("main")).toContainText("You have left the course.");
      },
    });
    expect(run.pageErrors).toEqual([]);
    expect(run.finished).toBe(true);
    const methods = run.trace.map((call) => call.method);
    expect(methods.at(-1)).toBe(finish);
    // Only the first step was seen, so the learner can come back to it (standards.md rule 8).
    expect(run.trace.filter((call) => call.args[0] === exit).map((call) => call.args[1])).toContain(
      "suspend",
    );
    expect(run.trace.every((call) => call.errorCode === "0")).toBe(true);
  });
}
