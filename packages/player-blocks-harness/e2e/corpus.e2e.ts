// The player on the reference courses of the Blocks conformance corpus (M1-28), from file://. They
// live in the private iteratecraft/test-courses repository, checked out at `test-courses/` in the
// root of studio; without a checkout these tests skip.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openCourse } from "@course-suite/format";
import { expect, test } from "./fixture.ts";

const corpusCourse = (name: string) =>
  join(import.meta.dirname, "..", "..", "..", "test-courses", "blocks", name, "course.json");

test.describe("gated-continue", () => {
  const file = corpusCourse("gated-continue");
  test.skip(!existsSync(file), `No test-courses checkout at ${file}`);

  test.beforeEach(async ({ write }) => {
    const opened = openCourse(readFileSync(file, "utf8"));
    if (opened.status !== "ok") throw new Error(`gated-continue does not open: ${opened.status}`);
    await write({ course: opened.document });
  });

  test("[rise:R13] UI-BLOCKS-R43 UI-BLOCKS-R44: each continue button has the author's label, or the label set's", async ({
    open,
    page,
  }) => {
    const visit = await open("#/lessons/spvbz6j2yy");
    await expect(page.locator("button.continue")).toHaveText([
      "Continue",
      "I have read all three",
      "Continue",
      "On to raising the tent",
    ]);
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
  });

  test("[rise:R13] UI-BLOCKS-R44 R55 GL7: completion type none works at once; block-above shows its hint in place of the button", async ({
    open,
    page,
  }) => {
    await open("#/lessons/spvbz6j2yy");
    const first = page.getByRole("button", { name: "Continue" });
    await expect(first).toBeVisible();
    await expect(page.getByText("Open each panel above to carry on.")).toBeHidden();
    await first.click();

    // The accordion above is not opened, so the requirement is not met.
    await expect(page.getByText("Open each panel above to carry on.")).toBeVisible();
    await expect(page.getByRole("button", { name: "I have read all three" })).toHaveCount(0);
    await expect(page.getByRole("img", { name: /A ridge tent/ })).toBeHidden();
  });

  test("UI-BLOCKS-R44 R55: all-above shows its hint in place of the button while the blocks since the last continue are not done", async ({
    open,
    page,
  }) => {
    await open("#/lessons/bojq736j6e");
    await expect(page.getByText("Go through every step above to carry on.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByText("Packing away")).toBeHidden();
  });
});
