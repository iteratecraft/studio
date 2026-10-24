// Keyboard-only journeys, reduced motion and the learner-side accessibility rules of the Blocks
// player (M1-29, ENG-04; accessibility.md UI-ACCESSIBILITY-R34, R35 and R37 to R40, R46; WCAG 2.2
// 2.1.1, 2.4.3, 2.4.11 and 1.4.10). Every step here uses the keyboard: no clicks, no form filling.
import type { Locator, Page } from "@playwright/test";
import {
  check,
  continueBlock,
  course,
  everyBlockCourse,
  lesson,
  paragraph,
  quiz,
} from "./courses.ts";
import { expect, test } from "./fixture.ts";

/** Presses Tab (or Shift+Tab) until `target` has focus; fails if it never gets there. */
async function tabTo(page: Page, target: Locator, key = "Tab"): Promise<void> {
  for (let presses = 0; presses < 80; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const outline = (page: Page) => page.getByRole("navigation", { name: "Course contents" });

test.describe("keyboard-only journeys", () => {
  test("UI-ACCESSIBILITY-R38: skip link, then the contents button, the outline and the lesson, in that order", async ({
    write,
    open,
    page,
  }) => {
    await write();
    await page.setViewportSize({ width: 1280, height: 800 });
    await open("#/lessons/lessonwhat");
    await expect(h1(page)).toHaveText("What compost is");
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          const region = element.closest("main")
            ? "main"
            : element.closest(".outline")
              ? "outline"
              : element.closest("header")
                ? "header"
                : "page";
          return `${region}: ${element.textContent?.trim()}`;
        }),
      );
    }
    expect(order).toEqual([
      "page: Skip to the course content",
      "header: Hide contents",
      "outline: What compost is",
      "outline: Greens and browns",
      "outline: Check what you know",
      "outline: Looking after the heap",
      "main: Continue",
      "main: Next lesson Greens and browns",
    ]);
  });

  test("UI-ACCESSIBILITY-R39: on a phone the contents open, choose a lesson and close by keyboard", async ({
    write,
    open,
    page,
  }) => {
    await write();
    await page.setViewportSize({ width: 320, height: 640 });
    await open();
    await expect(h1(page)).toHaveText("Composting at home");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to the course content" })).toBeFocused();
    await page.keyboard.press("Tab");
    const toggle = page.getByRole("button", { name: /^(Show|Hide) contents$/ });
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(outline(page)).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Escape closes the contents and returns to the button.
    await page.keyboard.press("Tab");
    await expect(outline(page).getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(outline(page)).toBeHidden();
    await expect(toggle).toBeFocused();

    // Choosing a lesson closes the contents and puts focus on the lesson's title.
    await page.keyboard.press("Enter");
    await tabTo(page, outline(page).getByRole("link", { name: "Greens and browns" }));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toHaveText("Greens and browns");
    await expect(h1(page)).toBeFocused();
    await expect(outline(page)).toBeHidden();
  });

  test("UI-ACCESSIBILITY-R39: on a phone, tabbing out of the open contents closes them, so focus is never hidden behind them", async ({
    write,
    open,
    page,
  }) => {
    await write();
    await page.setViewportSize({ width: 768, height: 1024 });
    await open("#/lessons/lessonwhat");
    await expect(h1(page)).toHaveText("What compost is");
    const toggle = page.getByRole("button", { name: /^(Show|Hide) contents$/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await tabTo(page, outline(page).getByRole("link", { name: "Looking after the heap" }));
    await page.keyboard.press("Tab");
    await expect(outline(page)).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();

    // Shift+Tab out of the contents, back to the button, leaves them open.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    await expect(outline(page)).toBeVisible();
  });

  test("UI-ACCESSIBILITY-R39: choosing the open lesson in the contents on a phone keeps focus on the page", async ({
    write,
    open,
    page,
  }) => {
    await write();
    await page.setViewportSize({ width: 320, height: 640 });
    await open("#/lessons/lessonwhat");
    await expect(h1(page)).toHaveText("What compost is");
    const toggle = page.getByRole("button", { name: /^(Show|Hide) contents$/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await tabTo(page, outline(page).getByRole("link", { name: "What compost is" }));
    await page.keyboard.press("Enter");
    await expect(outline(page)).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("next and previous lesson links work by keyboard and focus the new lesson's title", async ({
    write,
    open,
    page,
  }) => {
    await write();
    await open("#/lessons/lessonwhat");
    await expect(h1(page)).toHaveText("What compost is");
    const nav = page.getByRole("navigation", { name: "Previous and next lesson" });
    await tabTo(page, nav.getByRole("link", { name: "Next lesson Greens and browns" }));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toHaveText("Greens and browns");
    await expect(h1(page)).toBeFocused();
    await tabTo(page, nav.getByRole("link", { name: "Previous lesson What compost is" }));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toHaveText("What compost is");
    await expect(h1(page)).toBeFocused();
  });

  test("UI-ACCESSIBILITY-R46: a continue gate, a knowledge check and its retry, all by keyboard", async ({
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
    await expect(h1(page)).toHaveText("First");
    const gate = page.getByRole("button", { name: "Continue" });
    await tabTo(page, gate);
    await page.keyboard.press("Enter"); // inactive until the check is answered
    await expect(page.getByText("Behind the gate")).toBeHidden();

    // Choices: Tab reaches the group, arrows choose, Enter checks.
    await tabTo(page, page.getByRole("radio", { name: "Yes" }), "Shift+Tab");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "No" })).toBeChecked();
    await page.keyboard.press("Enter");
    const feedback = page.locator(".feedback");
    await expect(feedback).toBeFocused();
    await expect(feedback).toContainText("Incorrect");

    // Retry puts focus back on the first choice, cleared.
    await tabTo(page, page.getByRole("button", { name: "Try again" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("radio", { name: "Yes" })).toBeFocused();
    await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("button", { name: "Check answer" }));
    await page.keyboard.press("Enter");
    await expect(feedback).toContainText("Correct");

    // The gate is ready: pressing it reveals the next block and moves focus there.
    await tabTo(page, gate);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Behind the gate")).toBeVisible();
    await expect(page.locator(".block", { hasText: "Behind the gate" })).toBeFocused();
  });

  test("UI-BLOCKS-R28 UI-BLOCKS-R29: a quiz from start to results and a retake, by keyboard", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: course([quiz("quizone001", "Compost quiz", { passingScore: 60 })]) });
    await open("#/lessons/quizone001");
    await expect(h1(page)).toHaveText("Compost quiz");
    const heading = page.getByRole("heading", { level: 2 });
    const submit = page.getByRole("button", { name: "Submit" });
    const next = page.getByRole("button", { name: "Next question" });

    await tabTo(page, page.getByRole("button", { name: "Begin quiz" }));
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Question 1 of 3");
    await expect(heading).toBeFocused();

    // Single choice: arrows choose, Space on Submit submits.
    await tabTo(page, page.getByRole("radio", { name: "Brown" }));
    await page.keyboard.press("Space");
    await tabTo(page, submit);
    await page.keyboard.press("Space");
    await expect(page.locator(".feedback")).toBeFocused();
    await tabTo(page, next);
    await page.keyboard.press("Enter");

    // Fill-in: type, then Enter submits.
    await expect(heading).toBeFocused();
    await tabTo(page, page.getByRole("textbox", { name: "Keep the lid ___ when it rains." }));
    await page.keyboard.type("on");
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback .outcome")).toHaveText("Correct");
    await tabTo(page, next);
    await page.keyboard.press("Enter");

    // Matching: each drop-down takes typed letters.
    await tabTo(page, page.getByRole("combobox", { name: "Grass cuttings" }));
    await page.keyboard.type("Green");
    await expect(page.getByRole("combobox", { name: "Grass cuttings" })).toHaveValue("pgrass0001");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Brown");
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    await tabTo(page, page.getByRole("button", { name: "See your result" }));
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Your result");
    await expect(heading).toBeFocused();
    await expect(page.locator(".quiz-score")).toHaveText("Your score: 100%");

    // Retake: back to the start screen, then a fresh first question.
    await tabTo(page, page.getByRole("button", { name: "Retake quiz" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Retake quiz" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText("Question 1 of 3");
    await expect(heading).toBeFocused();
  });

  test("WCAG 2.4.11: the sticky top bar never covers the focused control, tabbing forward or back", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: everyBlockCourse() });
    await page.setViewportSize({ width: 320, height: 480 });
    await open("#/lessons/lessonall1");
    await expect(h1(page)).toHaveText("Every block");
    const covered = () =>
      page.evaluate(() => {
        const bar = document.querySelector(".topbar")?.getBoundingClientRect();
        const box = (document.activeElement as HTMLElement).getBoundingClientRect();
        return bar !== undefined && box.top < bar.bottom - 1 && box.bottom > bar.top;
      });
    await tabTo(page, page.getByRole("button", { name: "Continue" }));
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Shift+Tab");
      if (await page.evaluate(() => document.activeElement?.closest(".topbar") !== null)) break;
      expect(await covered(), await page.evaluate(() => document.activeElement?.outerHTML)).toBe(
        false,
      );
    }
  });
});

test.describe("learner-side rules", () => {
  test("UI-ACCESSIBILITY-R37: a locked lesson stays in the contents as a disabled link named with the reason", async ({
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
            continueBlock("cgate00001"),
          ),
          lesson("lessontwo1", "Second", paragraph("tparatwo01", "Two")),
        ],
        { navigation: { restricted: true } },
      ),
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await open("#/lessons/lessonone1");
    const locked = outline(page).getByRole("link", {
      name: "Second Locked until the earlier lessons are done",
      exact: true,
    });
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await expect(locked).not.toHaveAttribute("href");
    // Not a tab stop: Tab goes from the open lesson's link to the content.
    await tabTo(page, outline(page).getByRole("link", { name: "First" }));
    await page.keyboard.press("Tab");
    await expect(locked).not.toBeFocused();

    await page.getByRole("button", { name: "Continue" }).press("Enter");
    await expect(h1(page)).toHaveText("Second");
    const open2 = outline(page).getByRole("link", { name: "Second", exact: true });
    await expect(open2).not.toHaveAttribute("aria-disabled");
    await expect(open2).toHaveAttribute("href", "#/lessons/lessontwo1");
  });

  test("UI-ACCESSIBILITY-R35: one h1 per page, the page title; heading blocks are h2, subheadings h3, quiz screens h2", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: everyBlockCourse() });
    const levels = () =>
      page
        .locator("h1:visible, h2:visible, h3:visible, h4:visible, h5:visible, h6:visible")
        .evaluateAll((headings) => headings.map((h) => `${h.localName} ${h.textContent}`));
    await open();
    await expect(h1(page)).toBeVisible();
    expect(await levels()).toEqual(["h1 Compost check"]);

    await open("#/lessons/lessonall1");
    await page.getByRole("button", { name: "Continue" }).waitFor();
    expect(await levels()).toEqual([
      "h1 Every block",
      "h2 Before you start",
      "h3 What you need",
      "h2 Greens",
      "h3 Browns",
    ]);

    await page.evaluate(() => {
      location.hash = "#/lessons/quizall001";
    });
    await page.getByRole("button", { name: "Begin quiz" }).press("Enter");
    expect(await levels()).toEqual(["h1 Every question", "h2 Question 1 of 3"]);
  });

  test("UI-ACCESSIBILITY-R34: an image without alt text is decorative and hidden from screen readers", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: everyBlockCourse({ cover: { key: "leaf.svg" } }) });
    await open();
    await expect(h1(page)).toBeVisible();
    await expect(page.locator(".cover-image")).toHaveAttribute("alt", "");
    await expect(page.getByRole("img")).toHaveCount(0);

    await open("#/lessons/lessonall1");
    await expect(page.locator(".width-full .image")).toHaveAttribute("alt", "");
    await expect(page.getByRole("img")).toHaveCount(1);
    await expect(page.getByRole("img")).toHaveAccessibleName("A compost bin with its lid open");
  });

  test("UI-ACCESSIBILITY-R39: at 320 px the contents sit behind a button and the blocks fill one column", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: everyBlockCourse() });
    await page.setViewportSize({ width: 320, height: 640 });
    await open("#/lessons/lessonall1");
    await expect(outline(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Show contents" })).toBeVisible();
    const lefts = await page
      .locator(".block:visible .block-inner")
      .evaluateAll((blocks) => blocks.map((b) => Math.round(b.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });

  test("UI-ACCESSIBILITY-R40: with reduced motion nothing on the player animates", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: everyBlockCourse() });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 640 });
    await open("#/lessons/lessonall1");
    const animations = () => page.evaluate(() => document.getAnimations().length);
    await page.getByRole("button", { name: "Show contents" }).press("Enter");
    expect(await animations()).toBe(0);
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "Yes" }).press("Enter");
    expect(await animations()).toBe(0);
    await page.evaluate(() => {
      location.hash = "#/lessons/quizall001";
    });
    await page.getByRole("button", { name: "Begin quiz" }).press("Enter");
    expect(await animations()).toBe(0);

    // Without the preference the contents slide in.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Show contents" }).press("Enter");
    expect(await animations()).toBe(1);
  });
});
