// Walking-skeleton blocks from file:// (M1-10): text, headings, image with alt text, continue button
// and the choice knowledge checks (blocks-interactions.md UI-BLOCKS-R20, R23, R24).

import type { Course, LessonEntry } from "@course-suite/format";
import { fullCourse, sampleCourse } from "@course-suite/format/test/courses";
import { expect, test } from "./fixture.ts";

test.beforeEach(async ({ write }) => {
  await write();
});

test("text and heading blocks keep their heading levels under the lesson title", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonwhat");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2 })).toHaveText([
    "Waste becomes soil",
    "Living helpers",
  ]);
  await expect(main.locator("em")).toHaveText(["air", "water"]);
  await page.getByRole("link", { name: "Next lesson Greens and browns" }).click();
  await expect(main.getByRole("heading", { level: 3 })).toHaveText("Two kinds of material");
  await expect(main.getByRole("listitem")).toHaveText([
    "Greens: peelings, grass",
    "Browns: cardboard, leaves",
  ]);
});

test("an image block shows its image with the author's alt text", async ({ open, page }) => {
  const visit = await open("#/lessons/lessonwhat");
  const image = page.getByRole("img", { name: "A compost bin cut away to show its layers" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", "media/compost-bin.svg");
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(visit.badRequests).toEqual([]);
});

test("an image without alt text is decorative", async ({ write, open, page }) => {
  const course = sampleCourse();
  const lesson = course.entries[1] as LessonEntry;
  lesson.blocks = [
    {
      id: "blkimage02",
      category: "image",
      variant: "full-width",
      media: [{ key: "compost-bin.svg" }],
    },
  ];
  await write({ course });
  await open("#/lessons/lessonwhat");
  await expect(page.locator(".image")).toHaveAttribute("alt", "");
  await expect(page.getByRole("img")).toHaveCount(0);
});

test("a continue block renders a full-width button labelled from the label set", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonwhat");
  const button = page.getByRole("button", { name: "Continue" });
  await expect(button).toBeVisible();
  const [box, column] = [
    await button.boundingBox(),
    await page.locator(".block-divider .block-inner").boundingBox(),
  ];
  expect(box?.width).toBe(column?.width);
});

test.describe("single-choice knowledge check", () => {
  test.beforeEach(async ({ open, page }) => {
    await open("#/lessons/lessonwhat");
    // The check sits below a continue block, which holds it back until pressed.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("group", { name: "What does a compost heap need to work well?" }),
    ).toBeVisible();
  });

  test("UI-BLOCKS-R20, R23, R24: a wrong answer locks the choices, marks them, gives feedback and offers a retry", async ({
    page,
  }) => {
    const group = page.getByRole("group", { name: "What does a compost heap need to work well?" });
    await expect(group).toHaveAccessibleDescription("Choose one answer");
    await group.getByRole("radio", { name: "A sealed lid and no water" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();

    const feedback = page.locator(".feedback");
    await expect(feedback).toBeFocused();
    await expect(feedback.locator("p")).toHaveText([
      "Incorrect",
      "Without air and water the helpers stop working.",
    ]);
    for (const radio of await group.getByRole("radio").all()) await expect(radio).toBeDisabled();
    await expect(group.locator(".is-wrong")).toContainText("A sealed lid and no water");
    await expect(group.locator(".is-wrong .mark")).toHaveText("Your answer");
    await expect(group.locator(".is-correct .mark")).toHaveText("Correct answer");
    await expect(page.getByRole("button", { name: "Check answer" })).toBeHidden();

    await page.getByRole("button", { name: "Try again" }).click();
    const first = group.getByRole("radio", { name: "Air, water and mixed materials" });
    await expect(first).toBeFocused();
    await expect(first).toBeEnabled();
    await expect(group.getByRole("radio", { name: "A sealed lid and no water" })).not.toBeChecked();
    await expect(feedback).toBeHidden();
    await expect(page.locator(".mark")).toHaveCount(0);
  });

  test("UI-BLOCKS-R24: a right answer shows its feedback and no retry", async ({ page }) => {
    await page.getByRole("radio", { name: "Air, water and mixed materials" }).check();
    await page.keyboard.press("Enter"); // Enter on a choice submits
    await expect(page.locator(".feedback p")).toHaveText([
      "Correct",
      "Yes: the helpers need all three.",
    ]);
    await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();
  });

  test("checking with nothing chosen scores nothing and points to the instruction", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.locator(".feedback")).toBeHidden();
    await expect(page.getByRole("radio").first()).toBeFocused();
    await expect(page.locator(".hint")).toHaveClass(/is-needed/);
  });
});

test("multiple-response knowledge check: every right box is needed, with correct or incorrect feedback", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonmix1");
  const group = page.getByRole("group", { name: "Which of these are greens?" });
  await expect(group).toHaveAccessibleDescription("Choose every answer that applies");
  await group.getByRole("checkbox", { name: "Vegetable peelings" }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator(".feedback p")).toHaveText([
    "Incorrect",
    "Look for the wet, fresh materials.",
  ]);
  await page.getByRole("button", { name: "Try again" }).click();
  await group.getByRole("checkbox", { name: "Vegetable peelings" }).check();
  await group.getByRole("checkbox", { name: "Grass cuttings" }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator(".feedback p")).toHaveText([
    "Correct",
    "Right: both are wet and fresh.",
  ]);
});

test("rich text keeps formatting and links but never runs script or loads anything", async ({
  write,
  open,
  page,
}) => {
  const course: Course = {
    ...sampleCourse(),
    description:
      '<p onclick="window.hit=1">Safe <strong>bold</strong> <a href="https://example.com/page">link</a> ' +
      '<a href="javascript:window.hit=2">bad link</a></p><script>window.hit=3</script>' +
      '<img src="x" onerror="window.hit=4"><style>body{display:none}</style><svg><script>window.hit=5</script></svg>' +
      '<iframe src="https://example.com"></iframe><div>wrapped <em>text</em></div>',
  };
  await write({ course });
  const visit = await open();
  const description = page.locator(".cover-description");
  await expect(description).toContainText("Safe bold");
  await expect(description).toContainText("wrapped text");
  await expect(description.locator("strong")).toHaveText("bold");
  const link = description.getByRole("link", { name: "link (opens in a new tab)" });
  await expect(link).toHaveAttribute("href", "https://example.com/page");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(description.locator("a", { hasText: "bad link" })).not.toHaveAttribute("href");
  await expect(description.locator("script, img, style, svg, iframe, div, [onclick]")).toHaveCount(
    0,
  );
  await description.getByText("Safe").click();
  expect(await page.evaluate(() => (window as { hit?: number }).hit)).toBeUndefined();
  expect(visit.badRequests).toEqual([]);
});

test("the full format fixture opens; blocks this player does not show yet are left out", async ({
  write,
  open,
  page,
}) => {
  await write({ course: fullCourse() });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open("#/lessons/lesson0001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Before you start");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Checks");
  await expect(page.getByRole("group", { name: "When do you fit the guard?" })).toBeVisible();
  await expect(page.locator(".block")).toHaveCount(2);
  expect(errors).toEqual([]);
});
