// The blocks of M2-12 and M2-13 in the colours the course theme gives them (M2-17, ENG-08; rise.md
// rule 18, UI-BLOCKS-EDITOR-R45): the player draws the theme the course data carries, and every
// text pair keeps 4.5:1 at 320 and 1280 px, with the default theme and with random theme colours in
// each contrast mode.
import { type Block, type Course, contrastOf, type Theme, themeColors } from "@course-suite/format";
import { mediaCourse, staticBlocksCourse } from "@course-suite/format/test/courses";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { hex, pairs, themes } from "./contrast.ts";
import { course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";

/** Every themed control and fill of the static and media blocks, in one lesson. */
function subject(theme: Theme | undefined): Course {
  const statics = staticBlocksCourse();
  const media = mediaCourse();
  const blocks = [...statics.entries, ...media.entries].flatMap((entry) =>
    entry.kind === "lesson" ? entry.blocks : [],
  );
  const pick = (id: string) => structuredClone(blocks.find((b) => b.id === id) as Block);
  // The theme's own fills: no colour of the block's.
  const table = pick("sttexttabl");
  delete table.settings;
  const numbers = pick("stlistnumb");
  numbers.variantSettings = { start: 3 };
  // Narration on the page; text over a picture is the overlay's, not the theme's.
  const narrated = pick("blknarrate");
  delete narrated.settings?.background;
  const keys = new Set<string>();
  return course(
    [
      lesson(
        "lessontint",
        "Theme",
        table,
        numbers,
        pick("stimgcentr"),
        pick("stgalcarou"),
        pick("stquotecar"),
        pick("blkaudio01"),
        pick("blkvideo01"),
        narrated,
        pick("blkembed01"),
        pick("blkattach1"),
        pick("blkcode001"),
      ),
    ],
    {
      media: [...statics.media, ...media.media].filter(
        (entry) => !keys.has(entry.key) && keys.add(entry.key),
      ),
      ...(theme && { theme }),
    },
  );
}

/** Text on a fill of the theme's button colour (`--button`, `--button-text`). */
const BUTTON_FILLS = [
  ".table-wrap thead th",
  ".list-numbered li::before",
  ".embed-placeholder .button",
  ".attachment-link",
  ".code-copy",
];
/** Text and icons on the page in the accent or body colours. */
const ON_PAGE = [
  ".carousel-button:not([aria-disabled=true])",
  ".carousel-position",
  ".transcript summary",
  ".embed-notice",
  ".code-language",
];

async function expectReadable(page: Page, theme: Theme | undefined, selectors: string[]) {
  const name = theme ? JSON.stringify(theme) : "the default theme";
  const button = themeColors(theme).button;
  const found = await pairs(page, selectors);
  // Every selector draws something, so a renamed class cannot pass by matching nothing.
  for (const selector of selectors) {
    expect(
      found.some((pair) => pair.selector === selector),
      `${selector} in ${name}`,
    ).toBe(true);
  }
  for (const { selector, fill, text } of found) {
    if (BUTTON_FILLS.includes(selector) || selector === ".zoom-close") {
      expect(hex(fill), `${selector} fill in ${name}`).toBe(button);
    }
    expect(contrastOf(hex(fill), hex(text)), `${selector} in ${name}`).toBeGreaterThanOrEqual(4.5);
  }
}

const cases: [string, (Theme | undefined)[]][] = [
  ["the default theme", [undefined]],
  ["random colours with automatic contrast", themes("auto", 8, 0x5eed1)],
  ["random colours with light text", themes("light", 8, 0x5eed2)],
  ["random colours with dark text", themes("dark", 8, 0x5eed3)],
];

for (const [name, list] of cases) {
  test(`[rise:R18] [rise:3C] UI-BLOCKS-EDITOR-R45, BLK-04, BLK-05, ENG-08: the table header, list numbers, zoom close, carousel arrows, media, embed, download and code copy buttons keep 4.5:1 in ${name} at 320 and 1280 px`, async ({
    write,
    open,
    page,
  }) => {
    for (const theme of list) {
      const label = theme ? JSON.stringify(theme) : "the default theme";
      await write({ course: subject(theme) });
      // A new document for each theme: the same address again would only move to its fragment.
      await page.goto("about:blank");
      await open("#/lessons/lessontint");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Theme");
      await expect(page.locator("[data-block=blkcode001] .code-copy")).toBeVisible();
      // axe skips generated content (the list numbers), so each pair is measured as well.
      await expectReadable(page, theme, [...BUTTON_FILLS, ...ON_PAGE]);
      await expectAccessible(page, `the blocks in ${label}`, [320, 1280]);
      await page.getByRole("button", { name: "Enlarge image" }).first().click();
      await expect(page.getByRole("button", { name: "Close enlarged image" })).toBeFocused();
      await expectReadable(page, theme, [".zoom-close"]);
      await expectAccessible(page, `the enlarged image in ${label}`, [320, 1280]);
    }
  });
}
