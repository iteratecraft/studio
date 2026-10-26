// The text and static blocks in the real player (M2-12, BLK-04; rise.md 3C; blocks-editor.md 2.5,
// 2.7 to 2.11, 2.14; blocks-interactions.md 4, UI-BLOCKS-R45, R51, R52): every variant shows, with
// no WCAG 2.2 A or AA violation and no sideways scrolling at 320, 768 and 1280 px, also on a dark
// block colour; carousels, the checklist and image zoom work by keyboard, announce where they are
// and finish the way a continue block waits for.
import type { Block, Course, LessonEntry } from "@course-suite/format";
import { staticBlocksCourse } from "@course-suite/format/test/courses";
import { expectAccessible } from "./axe.ts";
import { continueBlock, course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const read = () => staticBlocksCourse();
/** The widths BLK-04 names (375, 768, 1280) and the narrowest reflow width (320, WCAG 1.4.10). */
const WIDTHS = [320, 375, 768, 1280] as const;
const lessonOf = (subject: Course, index: number) =>
  subject.entries.filter((entry): entry is LessonEntry => entry.kind === "lesson")[
    index
  ] as LessonEntry;
const block = (subject: Course, id: string) =>
  subject.entries
    .flatMap((entry) => (entry.kind === "lesson" ? entry.blocks : []))
    .find((b) => b.id === id) as Block;

test("[rise:3C] [rise:R18] BLK-04: every text and static variant shows in the player, accessible and without sideways scrolling at 320, 375, 768 and 1280 px, and looks as its snapshot", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  for (const [index, name] of [
    [0, "Reading blocks"],
    [1, "Pictures"],
  ] as const) {
    const entry = lessonOf(subject, index);
    const visit = await open(`#/lessons/${entry.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    // Every block of the lesson is drawn: none is left out as unknown or empty.
    await expect(page.locator(".blocks > [data-block]")).toHaveCount(entry.blocks.length);
    // Before axe, which reads the style sheets in ways a page from disk refuses.
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
    await expectAccessible(page, name, WIDTHS);
    // Visual snapshots (BLK-04 done-when) at phone, tablet and desktop widths.
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${entry.id}-${width}.png`, {
        fullPage: true,
        animations: "disabled",
        // Small font-rendering differences between Windows machines are not a change.
        maxDiffPixelRatio: 0.01,
      });
    }
  }
});

test("[rise:3C] BLK-04: the chosen heading level is the published element, the lesson title stays the only level 1, and columns and tables keep their settings", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 0).id}`);
  await expect(page.locator("[data-block='sttexthead'] h3.block-heading")).toHaveText(
    "Keep a red torch",
  );
  await expect(page.locator("[data-block='sttexthead'] h3")).toHaveCSS("margin-bottom", "24px");
  await expect(page.locator(".blocks h1")).toHaveCount(0);
  const levels = await page
    .locator("main :is(h1, h2, h3, h4, h5, h6)")
    .evaluateAll((headings) => headings.map((h) => Number(h.tagName.slice(1))));
  expect(levels[0]).toBe(1);
  levels.forEach((level, i) => {
    if (i > 0) expect(level - (levels[i - 1] as number), `heading ${i}`).toBeLessThanOrEqual(1);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("[data-block='sttextcol1'] .text-body")).toHaveCSS("column-count", "2");
  await expect(page.locator("[data-block='sttextcols'] .column")).toHaveCount(3);
  // The table: its header row in thead, scrollable on its own and reachable by keyboard.
  const table = page.getByRole("region", { name: "Table" });
  await expect(table.getByRole("columnheader")).toHaveText(["Object", "Best month"]);
  await expect(table).toHaveAttribute("tabindex", "0");
  // Numbered dividers count down the lesson and restart where the author says.
  await expect(page.locator(".divider-number")).toHaveText(["1", "2", "5"]);
  // A quote's rule above the name has the author's thickness.
  await expect(page.locator("[data-block='stquotesa2'] .quote-rule")).toHaveCSS("height", "5px");
  // A numbered list starts at the author's number.
  await expect(page.locator("[data-block='stlistnumb'] ol")).toHaveAttribute("start", "3");
});

test("[rise:3C] blocks-interactions 4, UI-BLOCKS-R52, BLK-04: by keyboard, the quote carousel moves with its buttons and arrows, stops at both ends and announces the position", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 0).id}`);
  const carousel = page.getByRole("region", { name: "Quotes" });
  await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
  const position = carousel.locator(".carousel-position");
  await expect(position).toHaveAttribute("aria-live", "polite");
  await expect(position).toHaveText("Quote 1 of 3");
  const previous = carousel.getByRole("button", { name: "Previous quote" });
  const next = carousel.getByRole("button", { name: "Next quote" });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(position).toHaveText("Quote 2 of 3");
  await expect(carousel.getByRole("group", { name: "Quote 2 of 3" })).toContainText("Quote 2:");
  await expect(carousel.getByRole("group", { name: "Quote 1 of 3" })).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText("Quote 3 of 3");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(position).toHaveText("Quote 3 of 3");
  await expect(next).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("Quote 2 of 3");
  await expectAccessible(page, "quote carousel on its second quote", [320]);
});

test("[rise:3C] UI-BLOCKS-R45, R51, R52: a gallery carousel and a checklist hold back the continue block below them until every image is seen and every box ticked", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  const gallery = block(subject, "stgalcarou");
  const checklist = block(subject, "stlistchek");
  const gated = course(
    [
      lesson(
        "lessongate",
        "Gates",
        gallery,
        continueBlock("cgatepics1", "block-above"),
        checklist,
        continueBlock("cgatelist1", "block-above"),
      ),
    ],
    { media: subject.media },
  );
  await write({ course: gated });
  await open("#/lessons/lessongate");
  const first = page.getByRole("button", { name: "Continue" }).first();
  await expect(first).toHaveAttribute("aria-disabled", "true");
  const images = page.getByRole("region", { name: "Images" });
  await images.getByRole("button", { name: "Next image" }).focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(images.locator(".carousel-position")).toHaveText("Image 3 of 3");
  await expect(first).not.toHaveAttribute("aria-disabled");
  await first.click();
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  const gate = page.getByRole("button", { name: "Continue" });
  await expect(gate).toHaveAttribute("aria-disabled", "true");
  await boxes.first().focus();
  await page.keyboard.press("Space");
  await expect(boxes.first()).toBeChecked();
  await expect(gate).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(gate).not.toHaveAttribute("aria-disabled");
  await expectAccessible(page, "checklist done", [320]);
});

test("[rise:3C] blocks-editor 2.10, blocks-interactions 4: zoom on click enlarges an image in a dialog that Escape closes, and focus goes back", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 1).id}`);
  const centred = page.locator("[data-block='stimgcentr']");
  const enlarge = centred.getByRole("button", { name: "Enlarge image" });
  await enlarge.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "The moon, half lit, over a roof." });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close enlarged image" })).toBeFocused();
  await expectAccessible(page, "enlarged image", [320, 1280]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(enlarge).toBeFocused();
  // An image without zoom has no button.
  await expect(page.locator("[data-block='stimgbannr'] .zoom-open")).toHaveCount(1);
  await expect(page.locator("[data-block='stimgfullw'] img.image")).toHaveAttribute("alt", "");
});
