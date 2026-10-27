// Completion gating and navigation settings in the editor (M2-16, BLK-08) in Chromium against the
// in-memory host, under the desktop app's content security policy: the navigation section of the
// theme panel beside the real player, lessons in order turning search and mark-done off, a quiz
// with skip-ahead named as the cause, microlearning steps (UI-BLOCKS-EDITOR-R49), every menu in
// the preview at phone and desktop widths, the bottom arrow of a tall step (rule 17), and the
// continue block's requirement, explanation and look, by pointer and by keyboard, with axe on every
// new screen in both editor themes and on the player output in an exported web package.
/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import { type Block, type Course, type LessonEntry, SCHEMA_VERSION } from "@course-suite/format";
import { readZip } from "@course-suite/zip";
import { expect, type FrameLocator, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { button, courseIn, heading, launch, openFixture, status } from "./helpers.ts";

const FILE = "Compost.crs";
const FRAME = "iframe[title='Course preview']:not([data-pending])";

const paragraph = (id: string, text: string): Block => ({
  id,
  category: "text",
  variant: "paragraph",
  items: [{ id: `i${id.slice(1)}`, kind: "content", text: `<p>${text}</p>` }],
});
const gate = (id: string, settings?: Record<string, unknown>): Block => ({
  id,
  category: "divider",
  variant: "continue",
  ...(settings && { variantSettings: settings }),
});
const check = (id: string): Block => ({
  id,
  category: "knowledge-check",
  variant: "single-choice",
  question: {
    id: `q${id.slice(1)}`,
    kind: "single-choice",
    prompt: "<p>Do worms help?</p>",
    answers: [
      { id: `y${id.slice(1)}`, text: "Yes", correct: true },
      { id: `n${id.slice(1)}`, text: "No", correct: false },
    ],
  },
});
const attachment: Block = {
  id: "battach001",
  category: "multimedia",
  variant: "attachment",
  variantSettings: { fileName: "checklist.pdf", fileSize: 2048 },
};

/**
 * A checklist: a block learners finish by ticking each box. (A knowledge check cannot be answered
 * in the editor's preview: its sandboxed frame does not allow form submission; see the PR.)
 */
const checklist: Block = {
  id: "lchecks001",
  category: "list",
  variant: "checkbox",
  items: [
    { id: "ichecks001", kind: "content", text: "<p>The lid fits</p>" },
    { id: "ichecks002", kind: "content", text: "<p>The base drains</p>" },
  ],
};

/** Two section groups, a gated first lesson and a quiz. */
function compost(extra: Partial<Course> = {}): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "6c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    kind: "course",
    title: "Compost at home",
    entries: [
      { id: "sectready1", kind: "section", title: "Getting ready" },
      {
        id: "lessonbin1",
        kind: "lesson",
        title: "Choosing a bin",
        blocks: [
          paragraph("tbin000001", "A lid keeps pests out."),
          attachment,
          gate("cgateone01"),
          checklist,
          gate("cgatetwo01"),
          paragraph("tbin000002", "Well done."),
        ],
      },
      {
        id: "lessonspot",
        kind: "lesson",
        title: "Where to put it",
        blocks: [paragraph("tspot00001", "Pick a shady spot.")],
      },
      { id: "sectmake01", kind: "section", title: "Making compost" },
      {
        id: "lessonmix1",
        kind: "lesson",
        title: "Greens and browns",
        blocks: [paragraph("tmix000001", "Mix wet greens with dry browns.")],
      },
      {
        id: "quizend001",
        kind: "quiz",
        title: "Check yourself",
        questions: [(check("kquiz00001") as Block & { question: never }).question],
      },
    ],
    media: [],
    ...extra,
  } as Course;
}

/** A stepped microlearning whose second step is taller than the screen. */
function micro(navigation: NonNullable<Course["navigation"]> = { steps: true }): Course {
  const tall = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a tall step.`).join("<br>");
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "7d2f3e4a-5b6c-4d7e-8f90-ab1c2d3e4f50",
    kind: "microlearning",
    title: "Compost in five minutes",
    navigation,
    entries: [
      {
        id: "lessonmicr",
        kind: "lesson",
        title: "Compost in five minutes",
        blocks: [
          paragraph("tstep00001", "Compost is decayed plant matter."),
          paragraph("tstep00002", tall),
          paragraph("tstep00003", "You made it to the end."),
        ],
      },
    ],
    media: [],
  } as Course;
}

const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));
async function saved(page: Page, file = FILE): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, file);
}

const panel = (page: Page) => page.locator(".be-theme-panel");
const sectionButton = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Theme settings" })
    .getByRole("button", { name: new RegExp(`^${name}`) });
/** A select of the panel by its label; its button is named by its value, then its label. */
const select = (page: Page, label: string) =>
  panel(page).getByRole("button", { name: new RegExp(`${label}$`) });
const switchOf = (page: Page, name: string) => panel(page).getByRole("switch", { name });

async function openNavigation(page: Page): Promise<void> {
  await page
    .getByRole("toolbar", { name: "Course tools" })
    .getByRole("button", { name: "Theme" })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: "Theme" })).toBeFocused();
  await sectionButton(page, "Navigation").click();
  await expect(page.getByRole("heading", { level: 2, name: "Navigation" })).toBeFocused();
}

/** The player beside the panel, or in the preview, once it shows the course. */
async function player(page: Page): Promise<FrameLocator> {
  const frame = page.frameLocator(FRAME);
  await expect(frame.locator("#content")).toBeVisible();
  return frame;
}

/** Presses Tab (or `key`) until `target` has the focus, at most 40 times. */
async function tabTo(page: Page, target: Locator, key = "Tab"): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((element) => element === element.ownerDocument.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

/** Chooses `option` in the select `label` by keyboard: open it, arrow to the option, Enter. */
async function chooseByKeyboard(page: Page, label: string, option: string): Promise<void> {
  await tabTo(page, select(page, label));
  await page.keyboard.press("Enter");
  const target = page.getByRole("option", { name: new RegExp(`^${option}`) });
  await page.keyboard.press("Home");
  for (let i = 0; i < 12; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}

/** The axe violations in the frame on show. */
async function frameViolations(page: Page): Promise<string[]> {
  const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!frame) throw new Error("no preview frame on show");
  return violations(frame);
}

// The editor page runs under the desktop app's release content security policy.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { policyViolations: seen });
    document.addEventListener("securitypolicyviolation", (event) =>
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
  });
});
test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(() => (window as { policyViolations?: string[] }).policyViolations),
  ).toEqual([]);
});

test.describe("the navigation section", () => {
  test("[rise:3F] [rise:R14] blocks-editor T5 W20 BLK-08, keyboard only: each menu shows in the player beside the panel; lessons in order turn search and mark-done off in the panel; saving is one undo step", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, compost({ navigation: { learnerMarkDone: true } }));
    await openNavigation(page);
    const frame = await player(page);
    // The pane is narrower than the wide layout, so the sidebar starts behind its button.
    const shell = frame.locator(".player");
    await expect(shell).toHaveClass(/nav-sidebar/);
    await expect(frame.locator(".search-input")).toHaveCount(1);

    // The compact menu shows on selection; search goes, and the panel says why.
    await chooseByKeyboard(page, "Menu type", "Compact menu");
    await expect(frame.locator(".compact-card")).toBeVisible();
    await expect(frame.locator(".compact-card")).toContainText("Show contents");
    await expect(frame.locator(".search-input")).toHaveCount(0);
    await expect(switchOf(page, "Course search")).toBeDisabled();
    await expect(switchOf(page, "Course search")).not.toBeChecked();
    await expect(switchOf(page, "Course search")).toHaveAccessibleDescription(
      "Search is only in the sidebar menu.",
    );
    await chooseByKeyboard(page, "Menu type", "Overlay menu");
    // The overlay menu's groups never collapse.
    await expect(switchOf(page, "Section groups start expanded")).toHaveCount(0);
    await chooseByKeyboard(page, "Menu type", "Sidebar");
    await expect(switchOf(page, "Course search")).toBeEnabled();
    await expect(switchOf(page, "Course search")).toBeChecked();

    // Lessons in order: search and mark-done switch off, with the reason (BLK-08 done when).
    await expect(switchOf(page, "Learners can mark lessons done")).toBeChecked();
    await tabTo(page, switchOf(page, "Lessons open in order"));
    await page.keyboard.press("Space");
    await expect(switchOf(page, "Lessons open in order")).toBeChecked();
    await expect(switchOf(page, "Course search")).toBeDisabled();
    await expect(switchOf(page, "Course search")).toHaveAccessibleDescription(
      "Search is off while lessons open in order.",
    );
    await expect(switchOf(page, "Learners can mark lessons done")).toBeDisabled();
    await expect(switchOf(page, "Learners can mark lessons done")).not.toBeChecked();
    await expect(frame.locator(".search-input")).toHaveCount(0);

    // The buttons tab: floating and dark.
    await tabTo(page, panel(page).getByRole("tab", { name: "Menu" }), "Shift+Tab");
    await page.keyboard.press("ArrowRight");
    await expect(panel(page).getByRole("tab", { name: "Buttons" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await chooseByKeyboard(page, "Placement", "Floating");
    await chooseByKeyboard(page, "Button colour", "Dark");
    await tabTo(page, panel(page).getByRole("button", { name: "Save", exact: true }), "Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(sectionButton(page, "Navigation")).toBeFocused();
    await expect(sectionButton(page, "Navigation")).toContainText("Sidebar");
    const course = await saved(page);
    expect(course.navigation).toEqual({
      learnerMarkDone: true,
      restricted: true,
      pageButtons: "floating",
      pageButtonColor: "dark",
    });
    // One undo step.
    await page.getByRole("heading", { level: 2, name: "Theme" }).click();
    await page.keyboard.press("Control+Z");
    expect((await saved(page)).navigation).toEqual({ learnerMarkDone: true });
  });

  test("[rise:3F] BLK-08: navigation off hides every menu option, and cancel keeps the course as it was", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, compost());
    await openNavigation(page);
    const frame = await player(page);
    await panel(page).getByText("Course menu", { exact: true }).click();
    await expect(switchOf(page, "Course menu")).not.toBeChecked();
    await expect(select(page, "Menu type")).toHaveCount(0);
    await expect(switchOf(page, "Course search")).toBeDisabled();
    await expect(frame.locator("#outline")).toHaveCount(0);
    await expect(frame.locator(".player")).toHaveClass(/nav-none/);
    await panel(page).getByRole("button", { name: "Cancel" }).click();
    await expect(frame.locator("#outline")).toHaveCount(1);
    expect((await saved(page)).navigation).toBeUndefined();
  });

  test("[rise:R14] UI-BLOCKS-R41: a quiz with skip-ahead keeps lessons in order, and the panel names the quiz", async ({
    page,
  }) => {
    const course = compost();
    const quiz = course.entries.at(-1) as Course["entries"][number] & { kind: "quiz" };
    quiz.settings = { skipAhead: { entry: "lessonmix1" } };
    course.entries.splice(course.entries.length - 1, 1);
    course.entries.splice(1, 0, quiz);
    await launch(page);
    await openFixture(page, FILE, course);
    await openNavigation(page);
    const order = switchOf(page, "Lessons open in order");
    await expect(order).toBeChecked();
    await expect(order).toBeDisabled();
    await expect(order).toHaveAccessibleDescription(
      "The quiz Check yourself skips ahead when passed, so lessons open in order.",
    );
  });

  test("[rise:3F] W2 UI-BLOCKS-EDITOR-R49 D-38: a microlearning from a template starts in steps; its navigation offers scroll or steps with the step indicator; a blank one scrolls", async ({
    page,
  }) => {
    await launch(page);
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "From a template…" }).click();
    await page.getByRole("option", { name: /^One idea, explained/ }).click();
    await page
      .getByRole("dialog", { name: "Start from a template" })
      .getByRole("button", { name: "Use template" })
      .click();
    const dialog = page.getByRole("dialog", { name: "New microlearning" });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Moon phases");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(heading(page, "Moon phases")).toBeVisible();
    expect((await courseIn(page, "Moon phases.crs")).navigation).toEqual({ steps: true });

    await page
      .getByRole("toolbar", { name: "Course tools" })
      .getByRole("button", { name: "Theme" })
      .click();
    await expect(sectionButton(page, "Navigation")).toContainText("Steps");
    await sectionButton(page, "Navigation").click();
    await expect(select(page, "How learners move through it")).toContainText("Steps");
    await chooseByKeyboard(page, "Step indicator", "Numbered");
    const frame = await player(page);
    await frame.getByRole("link", { name: "Begin course" }).click();
    await expect(
      frame.getByRole("navigation", { name: "Steps" }).getByRole("button").first(),
    ).toHaveText("1");
    await chooseByKeyboard(page, "How learners move through it", "Continuous scroll");
    await expect(select(page, "Step indicator")).toHaveCount(0);
    await chooseByKeyboard(page, "How learners move through it", "Steps");
    await panel(page).getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved(page, "Moon phases.crs")).navigation).toEqual({
      steps: true,
      stepIndicator: "numbers",
    });

    // A blank microlearning scrolls (R49).
    await button(page, "Back to the course").click();
    await button(page, "Back to your courses").click();
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "Blank microlearning" }).click();
    const blank = page.getByRole("dialog", { name: "New microlearning" });
    await blank.getByRole("textbox", { name: "Title" }).fill("Blank one");
    await blank.getByRole("button", { name: "Create" }).click();
    await expect(heading(page, "Blank one")).toBeVisible();
    expect((await courseIn(page, "Blank one.crs")).navigation).toBeUndefined();
  });
});

test.describe("the preview", () => {
  const menus: [string, NonNullable<Course["navigation"]>][] = [
    ["sidebar", {}],
    ["compact", { menu: "compact" }],
    ["overlay", { menu: "overlay" }],
    ["off", { off: true }],
  ];
  for (const [name, navigation] of menus) {
    test(`[rise:3F] BLK-08: the preview honours the ${name} menu at phone and computer widths`, async ({
      page,
    }) => {
      await launch(page);
      await openFixture(page, FILE, compost({ navigation }));
      await button(page, "Preview").click();
      const pane = page.getByRole("region", { name: "Preview" });
      const frame = await player(page);
      const contents = frame.getByRole("navigation", { name: "Course contents" });
      const toggle = frame.getByRole("button", { name: /^(Show|Hide) contents$/ });
      for (const device of ["Computer", "Phone"] as const) {
        await pane
          .getByRole("radiogroup", { name: "Device" })
          .getByRole("radio", { name: device })
          .click();
        if (name === "off") {
          await expect(toggle).toHaveCount(0);
          await expect(contents).toHaveCount(0);
          continue;
        }
        if (name === "sidebar" && device === "Computer") {
          await expect(contents).toBeVisible();
          continue;
        }
        // Behind the button, in the top bar or the compact card.
        await expect(contents).toBeHidden();
        await expect(
          name === "compact" ? frame.locator(".compact-card") : frame.getByRole("banner"),
        ).toContainText("Show contents");
        await toggle.click();
        await expect(contents).toBeVisible();
        expect(await frameViolations(page), `${name} at ${device}`).toEqual([]);
        await toggle.click();
        await expect(contents).toBeHidden();
      }
    });
  }

  test("[rise:R17] BLK-08: in a stepped microlearning the bottom arrow first shows the rest of a tall step, then moves on", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await launch(page);
    await openFixture(page, FILE, micro());
    await button(page, "Preview").click();
    const frame = await player(page);
    const begin = frame.getByRole("link", { name: "Begin course" });
    if (await begin.isVisible()) await begin.click();
    await expect(frame.getByText("Compost is decayed plant matter.")).toBeVisible();
    const next = frame.getByRole("button", { name: /^(Next step|Show more of this step)$/ });
    await expect(next).toHaveText("Next step");
    await next.click();
    await expect(frame.getByRole("button", { name: "Step 2 of 3" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(next).toHaveText("Show more of this step");
    await next.click();
    await expect(frame.getByRole("button", { name: "Step 2 of 3" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    while ((await next.textContent()) === "Show more of this step") await next.click();
    await expect(frame.getByText("Line 40 of a tall step.")).toBeInViewport();
    await next.click();
    await expect(frame.getByText("You made it to the end.")).toBeVisible();
    expect(await frameViolations(page)).toEqual([]);
  });
});

test.describe("continue blocks", () => {
  const blocksOf = (page: Page) => page.getByRole("grid", { name: "Blocks of Choosing a bin" });
  const row = (page: Page, name: RegExp) => blocksOf(page).getByRole("row", { name });

  async function openBin(page: Page, query = ""): Promise<void> {
    await launch(page, query);
    await openFixture(page, FILE, compost());
    await page.getByRole("button", { name: "Open Choosing a bin" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Choosing a bin" })).toBeFocused();
  }

  test("[rise:3G] UI-BLOCKS-R19 UI-BLOCKS-R45 BLK-08: a continue block below an attachment cannot wait for it and says why; below a checklist it can, the checklist shows it, and the blocks waited for are listed", async ({
    page,
  }) => {
    await openBin(page);
    const rows = blocksOf(page).getByRole("row");
    // Only the checklist can be required (from what its type declares).
    await expect(rows.filter({ hasText: "Can be required" })).toHaveCount(1);
    await expect(row(page, /^Checklist/)).toContainText("Can be required");
    await expect(row(page, /^File to download/)).not.toContainText("Can be required");

    const first = rows.nth(2);
    const requirement = first.getByRole("button", { name: /Learners can go on$/ });
    await expect(requirement).toHaveAccessibleDescription(
      "File to download, directly above, has nothing for learners to finish, so it cannot be required.",
    );
    await requirement.click();
    const above = page.getByRole("option", { name: /^When the block directly above is done/ });
    await expect(above).toHaveAttribute("aria-disabled", "true");
    await expect(above).toContainText("has nothing for learners to finish");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);

    // The second continue block waits for the check: by keyboard.
    const second = rows.nth(4);
    await second.focus();
    await second.getByRole("button", { name: /Learners can go on$/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: /^When the block directly above is done/ }).focus();
    await page.keyboard.press("Enter");
    await expect(second.getByRole("list", { name: "Learners must finish:" })).toHaveText(
      "Checklist: The lid fits",
    );
    // All above counts only the blocks since the previous continue block (rule 13).
    await second.getByRole("button", { name: /Learners can go on$/ }).click();
    await page.getByRole("option", { name: /^When every block since/ }).click();
    await expect(second.getByRole("list", { name: "Learners must finish:" })).toHaveText(
      "Checklist: The lid fits",
    );
    const blocks = ((await saved(page)).entries[1] as LessonEntry).blocks;
    expect(blocks[4]?.variantSettings).toEqual({ completionType: "all-above" });

    // In the player the gate waits for the check.
    await button(page, "Preview").click();
    const frame = await player(page);
    await frame.getByRole("button", { name: "Continue" }).first().click();
    const waiting = frame.locator("[data-block=cgatetwo01] .continue");
    await expect(waiting).toHaveAttribute("aria-disabled", "true");
    await frame.getByRole("checkbox", { name: "The lid fits" }).check();
    await expect(waiting).toHaveAttribute("aria-disabled", "true");
    await frame.getByRole("checkbox", { name: "The base drains" }).check();
    await expect(waiting).not.toHaveAttribute("aria-disabled");
  });

  test("blocks-interactions 2.11 W9 A13, keyboard only: the continue button's colour with a contrast check, width and corners, in the block's preview and the player", async ({
    page,
  }) => {
    await openBin(page);
    const first = blocksOf(page).getByRole("row").nth(2);
    // The row first, so the list keeps focus on its tool (as the editor does).
    await first.focus();
    await first.getByRole("button", { name: "Format", exact: true }).focus();
    await page.keyboard.press("Enter");
    const format = page.getByRole("dialog", { name: "Format" });
    const colour = format.getByRole("textbox", { name: "Button colour" });
    await colour.focus();
    await page.keyboard.type("#ffd166");
    await page.keyboard.press("Enter");
    // Automatic text is readable; forced light text is not, and the menu says so.
    await chooseIn(page, format, "Text colour", "Light");
    await expect(format).toContainText("below the 4.5:1 that WCAG AA asks for");
    await chooseIn(page, format, "Text colour", "Automatic, always readable");
    await expect(format).not.toContainText("below the 4.5:1");
    await page.keyboard.press("Escape");
    const preview = first.locator(".be-block-preview .continue");
    await expect(preview).toHaveCSS("background-color", "rgb(255, 209, 102)");
    await expect(preview).toHaveCSS("color", "rgb(0, 0, 0)");
    const blocks = ((await saved(page)).entries[1] as LessonEntry).blocks;
    expect(blocks[2]?.variantSettings).toEqual({ color: "#ffd166" });
  });

  for (const editorTheme of ["light", "dark"] as const) {
    test(`UI-ACCESSIBILITY: no axe violation on the continue block's settings, the navigation section and its buttons tab, or a microlearning's, in the ${editorTheme} theme`, async ({
      page,
    }) => {
      const check = async (state: string) =>
        expect(await violations(page), `${editorTheme}: ${state}`).toEqual([]);
      await openBin(page, `?theme=${editorTheme}`);
      await check("continue blocks and the requirable tag");
      await blocksOf(page)
        .getByRole("row")
        .nth(2)
        .getByRole("button", { name: "Format", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Format" })
        .getByRole("textbox", { name: "Button colour" })
        .fill("#2f6f9f");
      await page.keyboard.press("Enter");
      await check("continue format menu with its own colour");
      await page.keyboard.press("Escape");
      await openNavigation(page);
      await check("navigation, menu tab");
      await panel(page).getByRole("tab", { name: "Buttons" }).click();
      await check("navigation, buttons tab");
      await launch(page, `?theme=${editorTheme}`);
      await openFixture(page, "Micro.crs", micro());
      await page
        .getByRole("toolbar", { name: "Course tools" })
        .getByRole("button", { name: "Theme" })
        .click();
      await sectionButton(page, "Navigation").click();
      await check("navigation of a microlearning");
    });
  }
});

/** Chooses `option` in the select `label` of `scope` by keyboard. */
async function chooseIn(page: Page, scope: Locator, label: string, option: string): Promise<void> {
  await scope.getByRole("button", { name: new RegExp(`${label}$`) }).focus();
  await page.keyboard.press("Enter");
  const target = page.getByRole("option", { name: option, exact: true });
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
}

test("[rise:3F] [rise:R18] BLK-08: an exported web package honours the menu, search, buttons, a styled continue button and steps from disk, with no network and no axe violation", async ({
  page,
}) => {
  const dirs: string[] = [];
  const exported = async (course: Course) => {
    const built = await buildPackage({
      course,
      player: blocksPlayer({ language: "en" }),
      exporter: webExporter(),
      media: () => undefined,
      fonts: nodeFonts,
      packageVersion: 1,
    });
    if (!built.ok) throw new Error(JSON.stringify(built.problems));
    const zip = await readZip(built.value.zip);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
    const dir = mkdtempSync(join(tmpdir(), "navigation-export-"));
    dirs.push(dir);
    for (const name of zip.value.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
    }
    return pathToFileURL(join(dir, "index.html")).href;
  };
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("file:")) requests.push(request.url());
  });
  try {
    const course = compost({
      navigation: { menu: "compact", pageButtons: "floating", pageButtonColor: "theme" },
      theme: { color: "#25bb64" },
    });
    const bin = course.entries[1] as LessonEntry;
    bin.blocks[2] = gate("cgateone01", { color: "#2f6f9f", width: 60, cornerRadius: 16 });
    await page.goto(`${await exported(course)}#/lessons/lessonbin1`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choosing a bin");
    await expect(page.locator(".compact-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCSS(
      "background-color",
      "rgb(47, 111, 159)",
    );
    expect(await violations(page)).toEqual([]);
    await page.getByRole("button", { name: "Show contents" }).click();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    await page.goto(await exported(micro({ steps: true, stepIndicator: "numbers" })));
    await page.getByRole("link", { name: "Begin course" }).click();
    await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("button")).toHaveText([
      "1",
      "2",
      "3",
    ]);
    expect(await violations(page)).toEqual([]);
    expect(requests).toEqual([]);
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});
