// Progress engine in the player, from file:// (M1-11, ENG-05): lesson and course percentages, continue
// gates, required checks, restricted navigation, deep links and learner mark-done (rise.md §3 F and
// G, rules 5, 13 and 14; blocks-interactions.md UI-BLOCKS-R25, R26, R43 and R44).
import { check, continueBlock, course, lesson, paragraph, quiz } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const outline = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Course contents" });

test("[rise:R5] the outline shows each lesson's share done and the course's; a lesson without gates is done when viewed", async ({
  write,
  open,
  page,
}) => {
  await write();
  const visit = await open("#/lessons/lessonwhat");
  const nav = outline(page);
  // Heading, paragraph and image are seen; the continue block and the check below it are not.
  await expect(nav.getByRole("link", { name: "What compost is" })).toHaveAccessibleDescription(
    "60% done",
  );
  await expect(nav.locator(".outline-progress")).toHaveText("0% done");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(nav.getByRole("link", { name: "What compost is" })).toHaveAccessibleDescription(
    "Done",
  );
  await expect(nav.locator(".outline-progress")).toHaveText("25% done");
  await expect(page.locator(".player > [role=status]")).toHaveText("Lesson done");

  await nav.getByRole("link", { name: "Greens and browns" }).click();
  await expect(nav.getByRole("link", { name: "Greens and browns" })).toHaveAccessibleDescription(
    "Done",
  );
  await expect(nav.locator(".outline-progress")).toHaveText("50% done");
  expect(visit.errors).toEqual([]);
  expect(visit.badRequests).toEqual([]);
});

test("UI-BLOCKS-R43: a continue block hides what is below it until pressed, then focus moves on", async ({
  write,
  open,
  page,
}) => {
  await write();
  await open("#/lessons/lessonwhat");
  const group = page.getByRole("group", { name: "What does a compost heap need to work well?" });
  await expect(group).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(group).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeHidden();
  await expect(page.locator(".block:has(.check)")).toBeFocused();
});

test("UI-BLOCKS-R43: a continue block that ends a lesson finishes it and opens the next one", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course([
      lesson("lessonone1", "First", paragraph("tparaone01", "One"), continueBlock("cendone001")),
      lesson("lessontwo1", "Second", paragraph("tparatwo01", "Two")),
    ]),
  });
  await open("#/lessons/lessonone1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/#\/lessons\/lessontwo1$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(outline(page).getByRole("link", { name: "First" })).toHaveAccessibleDescription(
    "Done",
  );
});

test("UI-BLOCKS-R44 R55 GL7: a continue block with a requirement shows its hint as plain text in place of the button until it is met", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course([
      lesson(
        "lessonone1",
        "First",
        check("kcheckone1", "Is a heap alive?"),
        continueBlock("cgateone01", "block-above"),
        paragraph("tparaone01", "Behind the gate"),
      ),
    ]),
  });
  await open("#/lessons/lessonone1");
  const gate = page.getByRole("button", { name: "Continue" });
  const hint = page.locator("[data-block=cgateone01] .continue-hint");
  // The hint line stands in the button's place: plain text with a decorative icon, no button yet.
  await expect(hint).toHaveText("Finish the activities above to go on");
  await expect(hint).toBeVisible();
  await expect(hint.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("[data-block=cgateone01] button")).toBeHidden();
  await expect(gate).toHaveCount(0);
  await expect(page.getByText("Behind the gate")).toBeHidden();

  // Met: the button takes the hint's spot at once, without a reload (UI-BLOCKS-R55).
  await page.getByRole("radio", { name: "No" }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(gate).toBeVisible();
  await expect(hint).toBeHidden();
  await gate.click();
  await expect(page.getByText("Behind the gate")).toBeVisible();
});

test("[rise:R13] UI-BLOCKS-R44: the author's button label and hint text replace the label set's", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course([
      lesson(
        "lessonone1",
        "First",
        check("kcheckone1", "Is a heap alive?"),
        continueBlock("cgateone01", "block-above", {
          buttonLabel: "On to the heap",
          hintText: "Answer the question above first.",
        }),
        paragraph("tparaone01", "Behind the gate"),
      ),
    ]),
  });
  await open("#/lessons/lessonone1");
  const gate = page.getByRole("button", { name: "On to the heap" });
  await expect(page.getByText("Answer the question above first.")).toBeVisible();
  await expect(gate).toHaveCount(0);
  await expect(page.getByText("Finish the activities above to go on")).toHaveCount(0);
  await page.getByRole("radio", { name: "Yes" }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(gate).toBeVisible();
  await expect(page.getByText("Answer the question above first.")).toBeHidden();
});

test.describe("required knowledge checks", () => {
  test.beforeEach(async ({ write }) => {
    await write({
      course: course([
        lesson(
          "lessonone1",
          "First",
          check("kcheckone1", "Is a heap alive?", true),
          paragraph("tparaone01", "After the check"),
        ),
        lesson("lessontwo1", "Second", paragraph("tparatwo01", "Two")),
        lesson("lessonthr1", "Third", paragraph("tparathr01", "Three")),
      ]),
    });
  });

  test("UI-BLOCKS-R25: a required check says so and hides everything below until answered right", async ({
    open,
    page,
  }) => {
    await open("#/lessons/lessonone1");
    await expect(
      page.getByText("Answer this question correctly to see the rest of the lesson"),
    ).toBeVisible();
    await expect(page.getByText("After the check")).toBeHidden();
    await page.getByRole("radio", { name: "No" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("After the check")).toBeHidden();
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("After the check")).toBeVisible();
  });

  test("UI-BLOCKS-R26: until then later lessons and the next link are unavailable; a deep link shows the lesson locked", async ({
    open,
    page,
  }) => {
    await open("#/lessons/lessonone1");
    const nav = outline(page);
    await expect(nav.getByRole("link", { name: "Second" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(nav.locator("[data-status=locked]")).toHaveText([
      "SecondLocked until the earlier lessons are done",
      "ThirdLocked until the earlier lessons are done",
    ]);
    const lessonNav = page.getByRole("navigation", { name: "Previous and next lesson" });
    await expect(lessonNav.getByRole("link")).toHaveCount(0);
    await expect(lessonNav).toContainText("Locked until the earlier lessons are done");

    await page.goto(page.url().replace(/#.*$/, "#/lessons/lessonthr1"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Third");
    await expect(page.getByText("Three")).toHaveCount(0);
    await page.getByRole("link", { name: "Finish First first" }).click();
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(nav.getByRole("link", { name: "Third" })).toBeVisible();
    await lessonNav.getByRole("link", { name: "Next lesson Second" }).click();
    await expect(page.getByText("Two")).toBeVisible();
  });
});

test("[rise:R14] restricted navigation opens lessons in order and offers no mark-done", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course(
      [
        lesson("lessonone1", "First", paragraph("tparaone01", "One"), continueBlock("cgateone01")),
        lesson("lessontwo1", "Second", paragraph("tparatwo01", "Two")),
        lesson("lessonthr1", "Third", paragraph("tparathr01", "Three")),
      ],
      { navigation: { restricted: true, learnerMarkDone: true } },
    ),
  });
  await open("#/lessons/lessonone1");
  const nav = outline(page);
  await expect(nav.getByRole("link", { disabled: false })).toHaveText(["First"]);
  await expect(page.getByRole("button", { name: "Mark this lesson done" })).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Second");
  await expect(nav.getByRole("link")).toHaveText(["First", "Second", "Third"]);
});

test("a learner may mark an unfinished lesson done when the author allows it, but never a quiz", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course(
      [
        lesson(
          "lessonone1",
          "First",
          paragraph("tparaone01", "One"),
          continueBlock("cgateone01"),
          paragraph("tparaone02", "Later"),
        ),
        quiz("quizone001", "Quiz"),
      ],
      { navigation: { learnerMarkDone: true } },
    ),
  });
  await open("#/lessons/lessonone1");
  const nav = outline(page);
  await expect(nav.getByRole("link", { name: "First" })).toHaveAccessibleDescription("33% done");
  await page.getByRole("button", { name: "Mark this lesson done" }).click();
  await expect(nav.getByRole("link", { name: "First" })).toHaveAccessibleDescription("Done");
  await expect(page.getByRole("button", { name: "Mark this lesson done" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await nav.getByRole("link", { name: "Quiz" }).click();
  await expect(page.getByRole("button", { name: "Begin quiz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark this lesson done" })).toHaveCount(0);
});
