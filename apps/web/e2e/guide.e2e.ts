// The user guide (M2-22, ENG-40; docs/guide): its "first course in ten steps" walked as the guide
// tells it, against the in-memory host, by pointer and by keyboard alone, so a change to the app
// that makes the guide wrong fails here. The pointer walk also takes the guide's pictures, from
// sample content of our own in the light theme, when GUIDE_SCREENSHOTS is set (PowerShell:
// `$env:GUIDE_SCREENSHOTS=1; pnpm --filter @course-suite/web exec playwright test guide.e2e.ts`, after
// `pnpm build`). They are PNGs as Chromium writes them: recompressing them gained under 3 %.
/// <reference types="node" />
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { button, files, heading, status } from "./helpers.ts";

const IMAGES = join(import.meta.dirname, "..", "..", "..", "docs", "guide", "images");
const FRAME = "iframe[title='Course preview']:not([data-pending])";

/** The sample course's cover: a drawing of our own, boxes stacked on a pallet. */
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
<rect width="960" height="540" fill="#e8eef3"/><rect y="430" width="960" height="110" fill="#c9d3dc"/>
<rect x="300" y="410" width="360" height="24" fill="#8a6a4a"/>
<rect x="320" y="290" width="150" height="120" fill="#d9a066"/><rect x="490" y="290" width="150" height="120" fill="#c98f55"/>
<rect x="405" y="170" width="150" height="120" fill="#e2b07a"/>
<path d="M320 350h150M490 350h150M405 230h150" stroke="#a8743f" stroke-width="6"/></svg>`;

/** Takes one of the guide's pictures, when asked to. */
async function picture(target: Page | Locator, name: string): Promise<void> {
  if (!process.env.GUIDE_SCREENSHOTS) return;
  await target.screenshot({
    path: join(IMAGES, `${name}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

/** Steps 2 and 3: New, Blank course, a title, Create; the file takes the title's name. */
async function newCourse(page: Page, title: string): Promise<void> {
  await button(page, "New").click();
  await page.getByRole("menuitem", { name: "Blank course" }).click();
  const dialog = page.getByRole("dialog", { name: "New course" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(heading(page, title)).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
  expect(await files(page)).toContain(`${title}.crs`);
}

/** Adds a block of `type` from the block library, by its search. */
async function addFromLibrary(page: Page, type: string): Promise<void> {
  await button(page, "All blocks").click();
  const library = page.getByRole("dialog", { name: "Block library" });
  await library.getByRole("searchbox", { name: "Search block types" }).fill(type);
  await library.getByRole("option", { name: type, exact: true }).click();
  await expect(library).toHaveCount(0);
}

test("[rise:3A] blocks-editor W1, W4, W7, W20, W23, UI-PUBCOLLAB-R1: the guide's first course, step by step by pointer, with the guide's pictures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // `updates` gives the memory host an updater, so the dashboard has Settings, as on desktop.
  await page.goto("/editor.html?theme=light&updates&version=0.1.0");
  await expect(heading(page, "Your courses")).toBeVisible();

  // Steps 2 to 4: a course with a cover picture, its outline by Enter and Shift+Enter, a quiz.
  await newCourse(page, "Lifting safely");
  await page.evaluate((svg) => {
    window.editorTest.host.disk.set("cover.svg", new TextEncoder().encode(svg));
    window.editorTest.open = ["cover.svg"];
  }, COVER);
  const cover = page.getByRole("group", { name: "Cover image" });
  await cover.getByRole("button", { name: "Choose an image" }).click();
  await cover.getByRole("textbox", { name: /^Alt text/ }).fill("Boxes stacked on a pallet");
  await cover.getByRole("textbox", { name: /^Alt text/ }).press("Enter");
  const title = page.getByRole("textbox", { name: "New lesson or section" });
  for (const lesson of ["Before you lift", "Lift and carry"]) {
    await title.fill(lesson);
    await title.press("Enter");
  }
  await title.fill("Check yourself");
  await title.press("Shift+Enter");
  await button(page, "Add").click();
  await page.getByRole("menuitem", { name: "Quiz" }).click();
  const outline = page.getByRole("grid", { name: "Outline" });
  await expect(outline.getByRole("row")).toHaveCount(4);
  await outline.getByRole("textbox", { name: "Quiz title" }).fill("Quick check");

  // Steps 5 and 6: open a lesson, a block from the bar and more from the library.
  await button(page, "Open Before you lift").click();
  await button(page, "Paragraph with heading").click();
  const blocks = page.getByRole("grid", { name: "Blocks of Before you lift" });
  const first = blocks.getByRole("row").first();
  await first.getByRole("textbox", { name: "Heading" }).fill("Plan the lift");
  await first
    .getByRole("textbox", { name: "Text" })
    .fill("Check the load, the route and where you will put it down before you lift.");
  await addFromLibrary(page, "Checklist");
  await addFromLibrary(page, "Single choice");
  await addFromLibrary(page, "Continue");
  await expect(blocks.getByRole("row")).toHaveCount(4);
  // The top bar, the lesson and its first block in one picture.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.setViewportSize({ width: 1280, height: 1180 });
  await page.mouse.move(0, 0);
  await picture(page, "editor-lesson");
  await page.setViewportSize({ width: 1280, height: 800 });

  await button(page, "All blocks").click();
  const library = page.getByRole("dialog", { name: "Block library" });
  await expect(library.getByRole("option", { name: "Timeline" })).toContainText(
    "Not available yet",
  );
  await picture(library, "block-library");
  await page.keyboard.press("Escape");
  await expect(library).toHaveCount(0);

  // Step 7: Theme, a suggested colour, Save, Back to the course.
  await button(page, "Theme").click();
  await page.getByRole("button", { name: /^Colours/ }).click();
  const start = page.frameLocator(FRAME).getByRole("link", { name: "Begin course" });
  const orange = await start.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "#285f9f" }).click();
  // The preview beside the panel shows the new colour.
  await expect(start).not.toHaveCSS("background-color", orange);
  await page.mouse.move(0, 0);
  await picture(page, "theme");
  await page
    .getByRole("complementary", { name: "Colours" })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Colours #285f9f/ })).toBeVisible();
  // Back to the course overview; from a lesson, the preview opens at that lesson.
  await button(page, "Back to the course").click();
  await button(page, "Open Before you lift").click();

  // Step 8: Preview at phone width, then Edit at the lesson on show.
  await button(page, "Preview").click();
  const pane = page.getByRole("region", { name: "Preview" });
  const frame = page.frameLocator(FRAME);
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Before you lift");
  await pane.getByRole("radio", { name: "Phone" }).click();
  await expect(page.locator(".cs-Preview-device")).toHaveCSS("width", "375px");
  await expect(frame.getByRole("heading", { level: 2, name: "Plan the lift" })).toBeVisible();
  await page.mouse.move(0, 0);
  await picture(page, "preview");
  await pane.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Before you lift" })).toBeFocused();

  // Step 9: Ctrl+S writes the course file.
  await expect(status(page)).toHaveText("Unsaved changes");
  await page.keyboard.press("Control+S");
  await expect(status(page)).toHaveText("Saved");

  // Step 10: Publish, SCORM 1.2 by default, Export to the suggested name, then what to do next.
  await button(page, "Publish").click();
  await expect(page.getByRole("button", { name: "SCORM 1.2 Output" })).toBeVisible();
  await page.mouse.move(0, 0);
  await picture(page, "publish");
  await button(page, "Export").click();
  const check = page.getByRole("alertdialog", { name: "Check the course before exporting" });
  await expect(check).toContainText("“Lift and carry” is empty.");
  await check.getByRole("button", { name: "Export anyway" }).click();
  const done = page.getByRole("dialog", { name: "Package saved" });
  await expect(done).toContainText("Upload the zip to your learning system.");
  expect(await files(page)).toContain("Lifting-safely-scorm12.zip");
  await done.getByRole("button", { name: "OK" }).click();
  // The package's version is kept in the course, which the guide says to save after exporting.
  await expect(status(page)).toHaveText("Unsaved changes");
  await page.keyboard.press("Control+S");
  await expect(status(page)).toHaveText("Saved");

  // The dashboard of the guide's first picture: a second course, a microlearning from a template.
  await button(page, "Back to your courses").click();
  await expect(heading(page, "Your courses")).toBeVisible();
  await button(page, "New").click();
  await page.getByRole("menuitem", { name: "From a template…" }).click();
  const templates = page.getByRole("dialog", { name: "Start from a template" });
  await templates.getByRole("option", { name: /^One idea, explained/ }).click();
  await templates.getByRole("button", { name: "Use template" }).click();
  const named = page.getByRole("dialog", { name: "New microlearning" });
  await named.getByRole("textbox", { name: "Title" }).fill("Five-minute desk stretch");
  await named.getByRole("button", { name: "Create" }).click();
  await expect(heading(page, "Five-minute desk stretch")).toBeVisible();
  await button(page, "Back to your courses").click();
  const cards = page.getByRole("grid", { name: "Courses" }).getByRole("row");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Lifting safely" })).toContainText("Course · 3 lessons");
  await page.mouse.move(0, 0);
  await picture(page, "dashboard");
});

test("[rise:3A] blocks-editor W1, W4, W7, W23, 5.1: the guide's first course by keyboard alone", async ({
  page,
}) => {
  await page.goto("/editor.html");
  await expect(heading(page, "Your courses")).toBeVisible();

  // Step 2: New opens its menu on Enter; Blank course is its first item.
  await button(page, "New").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Blank course" })).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New course" });
  await expect(dialog.getByRole("textbox", { name: "Title" })).toBeFocused();
  await page.keyboard.type("Lifting safely");
  await page.keyboard.press("Enter");
  // Step 3: the save dialog takes the suggested name, and the course opens.
  await expect(heading(page, "Lifting safely")).toBeVisible();
  expect(await files(page)).toContain("Lifting safely.crs");

  // Step 4: Shift+Enter adds a section header, Enter a lesson under it.
  const title = page.getByRole("textbox", { name: "New lesson or section" });
  await title.focus();
  await page.keyboard.type("Getting ready");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Before you lift");
  await page.keyboard.press("Enter");
  const outline = page.getByRole("grid", { name: "Outline" });
  await expect(outline.getByRole("textbox", { name: "Section header title" })).toHaveValue(
    "Getting ready",
  );
  await expect(outline.getByRole("textbox", { name: "Lesson title" })).toHaveValue(
    "Before you lift",
  );

  // Step 5: the lesson's Actions, then Open. Step 6: a block from the bar at the lesson's end.
  await page.keyboard.press("Shift+Tab");
  await expect(button(page, "Actions for Before you lift")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Open" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Before you lift" })).toBeFocused();
  await button(page, "Paragraph with heading").focus();
  await page.keyboard.press("Enter");
  const row = page.getByRole("grid", { name: "Blocks of Before you lift" }).getByRole("row");
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("textbox", { name: "Heading" })).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Plan the lift");
  await page.keyboard.press("Enter");
  await expect(row).toHaveAccessibleName("Paragraph with heading: Plan the lift");

  // Step 8: Preview, then Edit.
  await button(page, "Preview").focus();
  await page.keyboard.press("Enter");
  const frame = page.frameLocator(FRAME);
  await expect(frame.getByRole("heading", { level: 2, name: "Plan the lift" })).toBeVisible();
  const edit = page.getByRole("region", { name: "Preview" }).getByRole("button", { name: "Edit" });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Before you lift" })).toBeFocused();

  // Step 9: Ctrl+S saves.
  await page.keyboard.press("Control+S");
  await expect(status(page)).toHaveText("Saved");

  // Step 10: Publish, Export anyway past the check, then the package.
  await button(page, "Publish").focus();
  await page.keyboard.press("Enter");
  await button(page, "Export").focus();
  await page.keyboard.press("Enter");
  const done = page.getByRole("dialog", { name: "Package saved" });
  await expect(done).toBeVisible();
  expect(await files(page)).toContain("Lifting-safely-scorm12.zip");
});
