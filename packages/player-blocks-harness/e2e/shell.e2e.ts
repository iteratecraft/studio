// The Blocks player shell from file://: cover, outline, lesson addresses, previous and next, focus,
// landmarks, responsive layout and reduced motion (rise.md §3 B, E, F and N; blocks-editor.md
// UI-BLOCKS-EDITOR-R53 and R55).
import { sampleCourse } from "@course-suite/format/test/courses";
import { expect, test } from "./fixture.ts";

test.beforeEach(async ({ write }) => {
  await write();
});

test("the cover has the root address: title, description, cover image with alt text and a begin link", async ({
  open,
  page,
}) => {
  const visit = await open();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
  await expect(main.getByRole("img")).toHaveAttribute(
    "alt",
    "A garden compost bin beside a vegetable bed",
  );
  await expect(main).toContainText("Turn kitchen and garden waste into rich soil.");
  await expect(main).toContainText("Sam Example");
  await expect(page).toHaveTitle("Composting at home");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await main.getByRole("link", { name: "Begin course" }).click();
  await expect(page).toHaveURL(/#\/lessons\/lessonwhat$/);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("What compost is");
  await expect(main.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle("What compost is - Composting at home");
  expect(visit.errors).toEqual([]);
  expect(visit.badRequests).toEqual([]);
});

test("landmarks: a banner, a labelled outline, a labelled lesson navigation and the main content", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonmix1");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Course contents" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Previous and next lesson" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Course content" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Greens and browns" })).toBeVisible();
});

test("the skip link is the first stop and moves focus to the content without changing the address", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonmix1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to the course content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveURL(/#\/lessons\/lessonmix1$/);
});

test("the outline groups lessons under their sections and marks the current one", async ({
  open,
  page,
}) => {
  await open("#/lessons/quizcheck1");
  const outline = page.getByRole("navigation", { name: "Course contents" });
  await expect(outline.getByRole("list", { name: "The basics" }).getByRole("link")).toHaveText([
    "What compost is",
    "Greens and browns",
  ]);
  await expect(outline.getByRole("list", { name: "In practice" }).getByRole("link")).toHaveText([
    "Check what you know",
    "Looking after the heap",
  ]);
  await expect(outline.locator("[aria-current=page]")).toHaveText("Check what you know");
  await outline.getByRole("link", { name: "Looking after the heap" }).click();
  await expect(outline.locator("[aria-current=page]")).toHaveText("Looking after the heap");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("a deep link opens its lesson, with its number among the lessons", async ({ open, page }) => {
  await open("#/lessons/lessoncare");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Looking after the heap");
  await expect(page.getByRole("main")).toContainText("Lesson 4 of 4");
  await expect(page.getByRole("main")).toContainText("Turn the heap every few weeks");
});

test("an address that names no lesson opens the cover", async ({ open, page }) => {
  await open("#/lessons/removed001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
  await expect(page).toHaveURL(/#\/$/);
});

test("previous and next links name the adjacent lessons; focus moves to each new lesson", async ({
  open,
  page,
}) => {
  await open("#/lessons/lessonwhat");
  const nav = page.getByRole("navigation", { name: "Previous and next lesson" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await nav.getByRole("link", { name: "Next lesson Greens and browns" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByRole("main")).toContainText("Lesson 2 of 4");

  // The header holds the previous link, reached with Shift+Tab from the title.
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.locator(".lesson-header").getByRole("link", { name: "Previous lesson What compost is" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What compost is");

  await page.goto(page.url().replace(/#.*$/, "#/lessons/lessoncare"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Looking after the heap");
  await expect(nav.getByRole("link")).toHaveText(["Previous lesson Check what you know"]);
});

test("a quiz entry is a page of its own; the quiz runtime fills it later", async ({
  open,
  page,
}) => {
  await open("#/lessons/quizcheck1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check what you know");
  await expect(page.getByRole("main")).toContainText("Lesson 3 of 4");
});

test("learner text comes from the course's label set", async ({ write, open, page }) => {
  await write({
    course: sampleCourse(),
    labels: {
      language: "en",
      labels: {
        "course.begin": "Start here",
        "lesson.next": "Onward",
        "outline.hide": "Close menu",
      },
    },
  });
  await open();
  await expect(page.getByRole("link", { name: "Start here" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  await page.getByRole("link", { name: "Start here" }).click();
  await expect(page.getByRole("link", { name: "Onward Greens and browns" })).toBeVisible();
});

test("a course without lessons shows its cover without a begin link", async ({
  write,
  open,
  page,
}) => {
  await write({ course: { ...sampleCourse(), entries: [] } });
  const visit = await open();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
  await expect(page.getByRole("link", { name: "Begin course" })).toHaveCount(0);
  expect(visit.errors).toEqual([]);
});

test.describe("responsive layout", () => {
  test("desktop: the outline is open beside one centred column, and can be closed", async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open("#/lessons/lessonwhat");
    const toggle = page.getByRole("button", { name: "Hide contents" });
    const outline = page.getByRole("navigation", { name: "Course contents" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const nav = await outline.boundingBox();
    const article = await page.getByRole("article").boundingBox();
    expect(nav && article && nav.x + nav.width <= article.x).toBe(true);
    await toggle.click();
    await expect(outline).toBeHidden();
    await expect(page.getByRole("button", { name: "Show contents" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("UI-BLOCKS-EDITOR-R53: at tablet portrait (768 px) the outline starts closed behind the contents button", async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open("#/lessons/lessonwhat");
    const toggle = page.getByRole("button", { name: "Show contents" });
    const outline = page.getByRole("navigation", { name: "Course contents" });
    await expect(outline).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(outline).toBeVisible();
    await outline.getByRole("link", { name: "Greens and browns" }).click();
    await expect(outline).toBeHidden(); // choosing a lesson closes it on a narrow screen
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");

    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(outline).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("phone: blocks fill the width with no sideways scrolling, and the lesson links stack", async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open("#/lessons/lessonmix1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const links = page
      .getByRole("navigation", { name: "Previous and next lesson" })
      .getByRole("link");
    const [previous, next] = [await links.nth(0).boundingBox(), await links.nth(1).boundingBox()];
    expect(previous && next && next.y >= previous.y + previous.height).toBe(true);
    const choice = await page.locator(".choice").first().boundingBox();
    expect(choice?.width).toBeGreaterThan(300);
  });
});

test.describe("motion and focus", () => {
  test("the outline slides in only when the learner has not asked for reduced motion", async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open();
    await page.getByRole("button", { name: "Show contents" }).click();
    const outline = page.getByRole("navigation", { name: "Course contents" });
    await expect(outline).toHaveCSS("animation-name", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(outline).toHaveCSS("animation-name", "outline-in");
  });

  test("keyboard focus is visible on links and buttons", async ({ open, page }) => {
    await open("#/lessons/lessonwhat");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // contents button
    const toggle = page.getByRole("button", { name: "Hide contents" });
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveCSS("outline-style", "solid");
    await expect(toggle).toHaveCSS("outline-width", "3px");
  });
});
