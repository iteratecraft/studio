// Edge cases of the text and static blocks in the real player (M2-12, BLK-04; rise.md 3C;
// blocks-editor.md 2.5, 2.9, 2.10; UI-BLOCKS-R45, R51): a cleared checklist point never holds a
// continue block back, a picture links to a lesson or a web page, and the fills that carry
// --button keep their contrast in the colours a theme gives them.
import {
  type Block,
  type ContentItem,
  type Course,
  contrastRatio,
  luminance,
} from "@course-suite/format";
import { staticBlocksCourse } from "@course-suite/format/test/courses";
import { expectAccessible, violations } from "./axe.ts";
import { continueBlock, course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";
import { THEME_COLORS, themeTokens } from "./theme-tokens.ts";

const subject = () => staticBlocksCourse();
const block = (from: Course, id: string) =>
  structuredClone(
    from.entries
      .flatMap((entry) => (entry.kind === "lesson" ? entry.blocks : []))
      .find((b) => b.id === id) as Block,
  );
const heading = (id: string, variant: string, title: string, level?: number): Block => ({
  id,
  category: "text",
  variant,
  items: [{ id: `i${id.slice(1)}`, kind: "content", title }],
  ...(level !== undefined && { variantSettings: { headingLevel: level } }),
});

test("[rise:3C] UI-BLOCKS-R45, R51, BLK-04: a checklist point whose text was cleared is not shown and does not hold the continue block back", async ({
  write,
  open,
  page,
}) => {
  const from = subject();
  const checklist = block(from, "stlistchek");
  // The editor removes an item's text when the author clears it.
  const cleared = checklist.items?.[1] as ContentItem;
  delete cleared.text;
  await write({
    course: course([
      lesson(
        "lessoncler",
        "Cleared",
        checklist,
        continueBlock("cgatecler1", "block-above"),
        heading("hafter0001", "heading", "After the gate"),
      ),
    ]),
  });
  await open("#/lessons/lessoncler");
  const gate = page.getByRole("button", { name: "Continue" });
  await expect(gate).toHaveAttribute("aria-disabled", "true");
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(1);
  await boxes.focus();
  await page.keyboard.press("Space");
  await expect(gate).not.toHaveAttribute("aria-disabled");
  await gate.click();
  await expect(page.getByRole("heading", { name: "After the gate" })).toBeVisible();
});

test("[rise:3C] blocks-editor 2.10, W15: a picture links to a lesson, which opens in place, or to a web page, which opens in a new tab and says so", async ({
  write,
  open,
  page,
}) => {
  const from = subject();
  const toLesson = block(from, "stimgcentr");
  toLesson.variantSettings = { link: "#/lessons/lessonnext" };
  // Decorative, so the link is named by where it goes.
  const toWeb = block(from, "stimgfullw");
  toWeb.variantSettings = { link: "https://example.org/moon" };
  await write({
    course: course(
      [
        lesson("lessonlink", "Links", toLesson, toWeb),
        lesson("lessonnext", "Next steps", heading("hnext00001", "heading", "Welcome")),
      ],
      { media: from.media },
    ),
  });
  const visit = await open("#/lessons/lessonlink");
  await expect(page.locator(".image-link")).toHaveCount(2);
  // Before axe, which reads the style sheets in ways a page from disk refuses.
  expect(visit.badRequests).toEqual([]);
  const web = page.getByRole("link", { name: "https://example.org/moon (opens in a new tab)" });
  await expect(web).toHaveAttribute("target", "_blank");
  await expect(web).toHaveAttribute("rel", "noopener noreferrer");
  // A linked picture opens its link instead of enlarging.
  await expect(page.locator(".zoom-open")).toHaveCount(0);
  await expectAccessible(page, "linked pictures", [320, 1280]);
  const inPlace = page.getByRole("link", { name: "The moon, half lit, over a roof." });
  await expect(inPlace).not.toHaveAttribute("target");
  await inPlace.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Next steps");
});

test("[rise:3C] blocks-editor 2.5, 2.9, 2.10, UI-ACCESSIBILITY: the table header, the list numbers and the close button keep 4.5:1 in every suggested theme colour", async ({
  write,
  open,
  page,
}) => {
  const from = subject();
  const table = block(from, "sttexttabl");
  delete table.settings;
  const numbers = block(from, "stlistnumb");
  numbers.variantSettings = { start: 3 };
  await write({
    course: course([lesson("lessontint", "Theme", table, numbers, block(from, "stimgcentr"))], {
      media: from.media,
    }),
  });
  await open("#/lessons/lessontint");
  await page.getByRole("button", { name: "Enlarge image" }).click();
  await expect(page.getByRole("button", { name: "Close enlarged image" })).toBeFocused();
  const fills = [".table-wrap thead th", ".list-numbered li", ".zoom-close"];
  for (const color of THEME_COLORS) {
    const tokens = themeTokens(color);
    // Where M2-17 sets them: the page, and the dialog, which takes the theme's colours back.
    await page.evaluate((variables) => {
      for (const element of [
        document.documentElement,
        ...document.querySelectorAll<HTMLElement>(".zoom-dialog"),
      ]) {
        for (const [name, value] of Object.entries(variables))
          element.style.setProperty(name, value);
      }
    }, tokens);
    // axe skips the numbers, which are generated content, so each fill is measured as well.
    const pairs = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const element = document.querySelector(selector) as Element;
          const style = getComputedStyle(element, selector.endsWith("li") ? "::before" : null);
          return [selector, style.backgroundColor, style.color] as const;
        }),
      fills,
    );
    for (const [selector, fill, text] of pairs) {
      expect(fill, `${selector} in ${color}`).toBe(rgb(tokens["--button"] as string));
      expect(
        contrastRatio(luminance(hex(fill)), luminance(hex(text))),
        `${selector} in ${color}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const found = (await violations(page)).filter((line) => line.startsWith("color-contrast"));
      expect(found, `${color} at ${width} px`).toEqual([]);
    }
  }
});

/** `#rrggbb` as getComputedStyle writes it, and back. */
const rgb = (color: string) =>
  `rgb(${[1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16)).join(", ")})`;
const hex = (color: string) =>
  `#${(color.match(/\d+/g) ?? []).map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
