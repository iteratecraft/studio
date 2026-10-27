// Navigation settings in the player, from file:// (M2-16, BLK-08; rise.md 3F, rules 14, 16 and
// 17; blocks-editor.md 2.18 navigation, UI-BLOCKS-EDITOR-R53; blocks-interactions.md GL9,
// UI-BLOCKS-R58; accessibility.md D4, UI-ACCESSIBILITY-R37 to R39): the sidebar, compact and
// overlay menus and navigation off, section groups, course search, lessons in order that nothing
// bypasses, the previous and next lesson buttons, the continue button's look, and stepped
// microlearning, by pointer and by keyboard, with axe at phone, tablet and desktop widths.
import { type Block, type Course, contrastOf, type Theme, themeColors } from "@course-suite/format";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { check, continueBlock, course, lesson, paragraph, quiz } from "./courses.ts";
import { expect, playerEvents, test, useHooks } from "./fixture.ts";

/** Two section groups of two lessons each, then a quiz. */
function compost(
  navigation: NonNullable<Course["navigation"]> = {},
  extra: Partial<Course> = {},
): Course {
  return course(
    [
      { id: "sectready1", kind: "section", title: "Getting ready" },
      lesson("lessonbin1", "Choosing a bin", paragraph("tbin000001", "A lid keeps pests out.")),
      lesson("lessonspot", "Where to put it", paragraph("tspot00001", "Pick a shady spot.")),
      { id: "sectmake01", kind: "section", title: "Making compost" },
      lesson(
        "lessonmix1",
        "Greens and browns",
        paragraph("tmix000001", "Coffee grounds from the café are greens."),
      ),
      lesson("lessonturn", "Turning the heap", paragraph("tturn00001", "Turn it every week.")),
      quiz("quizend001", "Check yourself"),
    ],
    { navigation, ...extra },
  );
}

const contents = (page: Page) => page.getByRole("navigation", { name: "Course contents" });
const toggle = (page: Page) => page.getByRole("button", { name: /^(Show|Hide) contents$/ });
const search = (page: Page) => page.getByRole("searchbox", { name: "Search this course" });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const status = (page: Page) => page.locator(".player > [role=status]");

test.describe("course menus", () => {
  test("[rise:3F] UI-BLOCKS-EDITOR-R53: the sidebar starts open beside the content on a wide screen, closed when the author chooses, and always closed on a phone", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: compost() });
    await open("#/lessons/lessonbin1");
    await expect(contents(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(contents(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

    await page.setViewportSize({ width: 1280, height: 800 });
    await write({ course: compost({ menuClosed: true }) });
    await page.reload();
    await expect(heading(page)).toHaveText("Choosing a bin");
    await expect(contents(page)).toBeHidden();
    await toggle(page).click();
    await expect(contents(page)).toBeVisible();
    // Beside the content, not over it.
    const nav = await contents(page).boundingBox();
    const main = await page.getByRole("main").boundingBox();
    expect((nav?.x ?? 0) + (nav?.width ?? 0)).toBeLessThanOrEqual((main?.x ?? 0) + 1);
    await expectAccessible(page, "sidebar open");
  });

  for (const width of [375, 1280]) {
    test(`[rise:3F] the compact menu is a card at the bottom left that opens the contents above it, by keyboard, at ${width} px`, async ({
      write,
      open,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await write({ course: compost({ menu: "compact" }) });
      const visit = await open("#/lessons/lessonbin1");
      await expect(heading(page)).toHaveText("Choosing a bin");
      await expect(contents(page)).toBeHidden();
      const card = page.locator(".compact-card");
      const box = await card.boundingBox();
      expect(box?.x).toBeLessThan(40);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(800 - 40);
      await expect(card.getByRole("button", { name: "Show contents" })).toBeVisible();
      // No search without the sidebar (rise.md 3F).
      await toggle(page).focus();
      await page.keyboard.press("Enter");
      await expect(contents(page)).toBeVisible();
      await expect(search(page)).toHaveCount(0);
      const nav = await contents(page).boundingBox();
      expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(box?.y ?? 0);
      expect(visit.errors).toEqual([]);
      await expectAccessible(page, "compact menu open", [width]);
      await page.keyboard.press("Escape");
      await expect(contents(page)).toBeHidden();
      await expect(toggle(page)).toBeFocused();
      // A lesson chosen from the menu opens, and the menu closes over it.
      await toggle(page).click();
      await contents(page).getByRole("link", { name: "Turning the heap" }).click();
      await expect(heading(page)).toHaveText("Turning the heap");
      await expect(contents(page)).toBeHidden();
    });

    test(`[rise:3F] the overlay menu is a large card at the top, its section groups always open, at ${width} px`, async ({
      write,
      open,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await write({ course: compost({ menu: "overlay", sectionsClosed: true }) });
      await open("#/lessons/lessonbin1");
      await expect(heading(page)).toHaveText("Choosing a bin");
      await expect(contents(page)).toBeHidden();
      await toggle(page).click();
      await expect(contents(page)).toBeVisible();
      const nav = await contents(page).boundingBox();
      expect(nav?.y).toBeLessThan(100);
      expect(nav?.width).toBeGreaterThan(Math.min(width - 40, 600));
      // Sections are titles here, not buttons, and their lessons show.
      await expect(contents(page).getByRole("button")).toHaveCount(0);
      await expect(contents(page).getByRole("link", { name: "Greens and browns" })).toBeVisible();
      await expect(search(page)).toHaveCount(0);
      await expectAccessible(page, "overlay menu open", [width]);
      // Tabbing out of the open card closes it, so it never hides the focused control.
      await contents(page).getByRole("link", { name: "Check yourself" }).focus();
      await page.keyboard.press("Tab");
      await expect(contents(page)).toBeHidden();
    });
  }

  test("[rise:3F] with navigation off learners start from the cover and go on lesson by lesson: no menu, no search, the exit in the top bar", async ({
    write,
    open,
    page,
  }) => {
    await write({
      course: compost({ off: true }, { publish: { standard: "web", exitLink: true } }),
    });
    await open();
    await expect(contents(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);
    await expect(search(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Begin course" }).click();
    await expect(heading(page)).toHaveText("Choosing a bin");
    await page
      .getByRole("navigation", { name: "Previous and next lesson" })
      .getByRole("link", { name: /Next lesson/ })
      .click();
    await expect(heading(page)).toHaveText("Where to put it");
    await expectAccessible(page, "navigation off");
    await page.getByRole("banner").getByRole("button", { name: "Exit course" }).click();
    await expect(page.getByRole("main")).toContainText("You have left the course.");
  });
});

test.describe("section groups", () => {
  test("[rise:3F] blocks-editor 2.18: groups start collapsed when the author chooses; the group of the lesson open shows, by pointer and keyboard", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: compost({ sectionsClosed: true }) });
    await open("#/lessons/lessonbin1");
    const ready = contents(page).getByRole("button", { name: "Getting ready" });
    const making = contents(page).getByRole("button", { name: "Making compost" });
    // The lesson open is in the first group, so that one opened.
    await expect(ready).toHaveAttribute("aria-expanded", "true");
    await expect(making).toHaveAttribute("aria-expanded", "false");
    await expect(contents(page).getByRole("link", { name: "Greens and browns" })).toBeHidden();
    await making.focus();
    await page.keyboard.press("Enter");
    await expect(making).toHaveAttribute("aria-expanded", "true");
    await expect(contents(page).getByRole("link", { name: "Greens and browns" })).toBeVisible();
    await ready.click();
    await expect(ready).toHaveAttribute("aria-expanded", "false");
    await expect(contents(page).getByRole("link", { name: "Choosing a bin" })).toBeHidden();
    await expectAccessible(page, "a group collapsed");
  });
});

test.describe("course search", () => {
  test("[rise:3F] UI-ACCESSIBILITY-R38: search narrows the contents to the lessons whose title or content holds every word, by keyboard", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: compost({ sectionsClosed: true }) });
    const visit = await open("#/lessons/lessonbin1");
    await expect(heading(page)).toHaveText("Choosing a bin");
    // Tab order: skip link, menu button, then search (D4).
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(search(page)).toBeFocused();
    await page.keyboard.type("shady");
    const links = contents(page).getByRole("link");
    await expect(links.filter({ visible: true })).toHaveText(["Where to put it"]);
    await expect(status(page)).toHaveText("Lessons found: 1");
    // Without accents and case, in a collapsed group.
    await search(page).fill("CAFE");
    await expect(links.filter({ visible: true })).toHaveText(["Greens and browns"]);
    await search(page).fill("turn heap");
    await expect(links.filter({ visible: true })).toHaveText(["Turning the heap"]);
    await search(page).fill("glass");
    await expect(links.filter({ visible: true })).toHaveCount(0);
    await expect(contents(page)).toContainText("No lesson matches your search");
    await expect(status(page)).toHaveText("Lessons found: 0");
    expect(visit.errors).toEqual([]);
    await expectAccessible(page, "no lesson found", [320, 1280]);
    await search(page).fill("");
    await expect(links.filter({ visible: true })).toHaveText(["Choosing a bin", "Where to put it"]);
    await search(page).fill("pests");
    await links.filter({ visible: true }).first().click();
    await expect(heading(page)).toHaveText("Choosing a bin");
  });

  test("[rise:3F] the author can turn search off", async ({ write, open, page }) => {
    await write({ course: compost({ search: false }) });
    await open("#/lessons/lessonbin1");
    await expect(contents(page)).toBeVisible();
    await expect(search(page)).toHaveCount(0);
  });
});

test.describe("lessons in order", () => {
  /** The first lesson waits on a check; the others follow. */
  const ordered = (navigation: NonNullable<Course["navigation"]>) =>
    course(
      [
        lesson(
          "lessonone1",
          "First steps",
          check("kfirst0001", "Is compost alive?"),
          continueBlock("cgate00001", "block-above"),
        ),
        lesson("lessontwo1", "Second steps", paragraph("tsecond001", "Worms help.")),
        lesson("lessonthre", "Third steps", paragraph("tthird0001", "Done soon.")),
      ],
      { navigation },
    );

  test("[rise:R14] the menu, the search, the next button and the address cannot open a lesson early", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: ordered({ restricted: true, search: true, learnerMarkDone: true }) });
    await open("#/lessons/lessonone1");
    await expect(heading(page)).toHaveText("First steps");
    // No search and no mark-done while lessons open in order.
    await expect(search(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark this lesson done" })).toHaveCount(0);
    // The menu: later lessons are disabled links that say why (UI-ACCESSIBILITY-R37).
    const later = contents(page).getByRole("link", { name: /Third steps/ });
    await expect(later).toHaveAttribute("aria-disabled", "true");
    await expect(later).not.toHaveAttribute("href");
    await later.click({ force: true });
    await expect(heading(page)).toHaveText("First steps");
    // The next button names the lesson as locked, with no link.
    const next = page.getByRole("navigation", { name: "Previous and next lesson" });
    await expect(next.getByRole("link")).toHaveCount(0);
    await expect(next).toContainText("Locked until the earlier lessons are done");
    // The address shows the lesson locked, with the way back.
    await page.goto(page.url().replace("lessonone1", "lessonthre"));
    await expect(page.getByRole("main")).toContainText("Locked until the earlier lessons are done");
    await expect(page.getByRole("main").locator(".blocks")).toHaveCount(0);
    await page.getByRole("link", { name: "Finish First steps first" }).click();
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page)).toHaveText("Second steps");
    await expect(later).toHaveAttribute("href", "#/lessons/lessonthre");
  });
});

test.describe("previous and next lesson buttons", () => {
  /** A long first lesson, so its foot is out of sight. */
  const long = (navigation: NonNullable<Course["navigation"]>, theme?: Theme) =>
    compost(navigation, {
      entries: [
        lesson(
          "lessonlong",
          "A long lesson",
          ...Array.from({ length: 12 }, (_, i) =>
            paragraph(`tlong0000${i.toString(16)}`, `Part ${i + 1} of a long read.`),
          ),
        ),
        ...compost().entries,
      ],
      ...(theme && { theme }),
    });
  const lessonNav = (page: Page) =>
    page.getByRole("navigation", { name: "Previous and next lesson" });

  test("[rise:3F] floating buttons stay at the bottom of the screen and name their lessons; there are none at the top", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: long({ pageButtons: "floating" }) });
    await open("#/lessons/lessonbin1");
    await expect(heading(page)).toHaveText("Choosing a bin");
    await expect(page.locator(".lesson-header .page-link")).toHaveCount(0);
    await page.goto(page.url().replace("lessonbin1", "lessonlong"));
    await expect(heading(page)).toHaveText("A long lesson");
    const next = lessonNav(page).getByRole("link", { name: "Next lesson Choosing a bin" });
    await expect(next).toBeInViewport();
    const box = await next.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(720 - 40);
    await expectAccessible(page, "floating buttons");
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(heading(page)).toHaveText("Choosing a bin");
  });

  test("[rise:3F] branching courses turn them off: no buttons at the top or the foot", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: compost({ pageButtons: "off" }) });
    await open("#/lessons/lessonspot");
    await expect(heading(page)).toHaveText("Where to put it");
    await expect(lessonNav(page)).toHaveCount(0);
    await expect(page.locator(".page-link")).toHaveCount(0);
  });

  for (const color of ["#ff631e", "#25bb64", "#4baaf4", "#7837a8"]) {
    test(`[rise:R18] dark and theme buttons keep their text at 4.5:1 and theme buttons at 3:1 on the page, theme ${color}`, async ({
      write,
      open,
      page,
    }) => {
      const theme: Theme = { color };
      const expected = themeColors(theme);
      for (const scheme of ["dark", "theme"] as const) {
        await write({ course: compost({ pageButtonColor: scheme }, { theme }) });
        if (scheme === "dark") await open("#/lessons/lessonspot");
        else await page.reload();
        await expect(heading(page)).toHaveText("Where to put it");
        const link = lessonNav(page).getByRole("link", { name: /Next lesson/ });
        const [background, text] = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.backgroundColor, style.color];
        });
        if (scheme === "theme") {
          expect(background).toBe(rgb(expected.button));
          expect(text).toBe(rgb(expected.buttonText));
          expect(contrastOf(expected.button, "#ffffff")).toBeGreaterThanOrEqual(3);
          expect(contrastOf(expected.buttonText, expected.button)).toBeGreaterThanOrEqual(4.5);
        } else {
          expect(background).toBe("rgb(43, 48, 56)");
          expect(text).toBe("rgb(255, 255, 255)");
        }
        await expectAccessible(page, `${scheme} buttons`, [320, 1280]);
      }
    });
  }
});

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(", ")})`;

test.describe("continue button look", () => {
  test("blocks-interactions 2.11, W9: the author's colour with its text, width and corners, readable on the theme", async ({
    write,
    open,
    page,
  }) => {
    const styled = (id: string, settings: Record<string, unknown>): Block => ({
      ...continueBlock(id),
      variantSettings: settings,
    });
    await write({
      course: course(
        [
          lesson(
            "lessongate",
            "Gates",
            paragraph("tgate00001", "Read this first."),
            styled("cgatestyl1", { color: "#2f6f9f", width: 50, cornerRadius: 20 }),
            paragraph("tgate00002", "Then this."),
            styled("cgatestyl2", { color: "#ffd166", contrast: "auto" }),
            paragraph("tgate00003", "The end."),
          ),
        ],
        { theme: { color: "#25bb64", buttons: "square" } },
      ),
    });
    await open("#/lessons/lessongate");
    const first = page.getByRole("button", { name: "Continue" });
    const look = await first.evaluate((element) => {
      const style = getComputedStyle(element);
      const column = (element.closest(".block-inner") as HTMLElement).clientWidth;
      return {
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderTopLeftRadius,
        share: element.getBoundingClientRect().width / column,
      };
    });
    expect(look).toMatchObject({
      background: "rgb(47, 111, 159)",
      color: "rgb(255, 255, 255)",
      radius: "20px",
    });
    expect(look.share).toBeCloseTo(0.5, 1);
    await expectAccessible(page, "styled continue button");
    await first.click();
    const second = page.getByRole("button", { name: "Continue" });
    // Automatic text on a light colour is dark; the theme's square buttons stay square.
    await expect(second).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(second).toHaveCSS("border-top-left-radius", "0px");
  });
});

test.describe("stepped microlearning", () => {
  const tall = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a tall step.`).join("<br>");
  const micro = (navigation: NonNullable<Course["navigation"]>): Course =>
    course(
      [
        lesson(
          "lessonmicr",
          "Compost in five minutes",
          paragraph("tstep00001", "Compost is decayed plant matter."),
          {
            ...paragraph("tstep00002", "Here is how it happens."),
            settings: { connectToNext: true },
          },
          paragraph("tstep00003", tall),
          check("kstep00001", "Do worms help?", true),
          paragraph("tstep00004", "You made it to the end."),
        ),
      ],
      { kind: "microlearning", title: "Compost in five minutes", navigation },
    );
  const step = (page: Page, n: number) => page.getByRole("button", { name: `Step ${n} of 4` });
  const nextArrow = (page: Page) =>
    page.getByRole("button", { name: /^(Next step|Show more of this step)$/ });

  test("[rise:R17] [rise:R16] UI-BLOCKS-R58 GL9: one step at a time; the bottom arrow first shows the rest of a tall step, then moves on; a step after an unanswered required check is locked", async ({
    write,
    open,
    page,
  }) => {
    await useHooks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await write({ course: micro({ steps: true, stepIndicator: "numbers" }) });
    const visit = await open();
    await page.getByRole("link", { name: "Begin course" }).click();
    await expect(heading(page)).toHaveText("Compost in five minutes");
    // No menu and no lesson buttons in a microlearning (rise.md 3A).
    await expect(contents(page)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Previous and next lesson" })).toHaveCount(0);
    const steps = page.getByRole("navigation", { name: "Steps" });
    await expect(steps.getByRole("button")).toHaveText(["1", "2", "3", "4"]);
    await expect(step(page, 1)).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("Compost is decayed plant matter.")).toBeVisible();
    await expect(page.getByText("Here is how it happens.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Previous step" })).toBeDisabled();
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
    await expectAccessible(page, "first step");

    await nextArrow(page).click();
    await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
    // The connected blocks show together; the step is taller than the screen.
    await expect(page.getByText("Here is how it happens.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show more of this step" })).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Show more of this step" }).click();
    await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    while ((await nextArrow(page).textContent()) === "Show more of this step") {
      await nextArrow(page).click();
    }
    await expect(page.getByText("Line 40 of a tall step.")).toBeInViewport();
    await expect(nextArrow(page)).toHaveText("Next step");
    await nextArrow(page).click();
    await expect(step(page, 3)).toHaveAttribute("aria-current", "step");

    // Step 4 waits for the right answer (UI-BLOCKS-R58).
    await expect(step(page, 4)).toHaveAttribute("aria-disabled", "true");
    await expect(step(page, 4)).toHaveAccessibleDescription(
      "Locked until the step before it is done",
    );
    await expect(nextArrow(page)).toBeDisabled();
    expect((await playerEvents(page)).map((event) => event.type)).not.toContain("course-finished");
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(step(page, 4)).not.toHaveAttribute("aria-disabled");
    await step(page, 4).click();
    await expect(page.getByText("You made it to the end.")).toBeVisible();
    // Every step reached: the microlearning is done (rule 16).
    await expect
      .poll(async () => (await playerEvents(page)).map((event) => event.type))
      .toContain("course-finished");
    await expect(nextArrow(page)).toBeDisabled();
  });

  test("[rise:3F] the up and down arrow keys move between short steps; the plain bar names each step for screen readers", async ({
    write,
    open,
    page,
  }) => {
    await write({
      course: course(
        [
          lesson(
            "lessonkeys",
            "Keys",
            paragraph("tkeys00001", "First."),
            paragraph("tkeys00002", "Second."),
            paragraph("tkeys00003", "Third."),
          ),
        ],
        { kind: "microlearning", title: "Keys", navigation: { steps: true } },
      ),
    });
    await open("#/lessons/lessonkeys");
    const steps = page.getByRole("navigation", { name: "Steps" });
    await expect(steps.getByRole("button")).toHaveCount(3);
    await expect(steps.getByRole("button", { name: "Step 1 of 3" })).toHaveText("");
    await expect(page.getByText("First.")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Second.")).toBeVisible();
    await expect(page.getByText("First.")).toBeHidden();
    await expect(page.locator(".player > [role=status]")).toHaveText("Step 2 of 3");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Third.")).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText("Second.")).toBeVisible();
    await expectAccessible(page, "plain bar");
    // Hidden indicator: only the arrows.
    await write({
      course: course([lesson("lessonkeys", "Keys", paragraph("tkeys00001", "First."))], {
        kind: "microlearning",
        navigation: { steps: true, stepIndicator: "none" },
      }),
    });
    await page.reload();
    await expect(page.getByText("First.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Steps" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  });

  test("[rise:3A] a microlearning that scrolls shows the whole lesson, with no menu and no lesson buttons", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: micro({}) });
    await open("#/lessons/lessonmicr");
    await expect(page.getByText("Here is how it happens.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Steps" })).toHaveCount(0);
    await expect(contents(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);
  });
});
