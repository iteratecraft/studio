// Text and static blocks in the blocks editor (M2-12, BLK-04; rise.md 3C, 3J; blocks-editor.md 2.5,
// 2.7 to 2.11, 2.14, 3, W3, W7 to W9, W15; D-38), in Chromium against the in-memory host: every
// family inserts from the library with sample content, its content is edited in place, its own
// format options sit in the format menu, pictures carry alt text or are marked decorative, sibling
// variants switch keeping content, placeholder templates start courses and lessons, and the real
// player shows them in the preview; by keyboard and by pointer, with axe on every new screen in
// both themes.
import type { Block, ContentItem, Course, LessonEntry } from "@course-suite/format";
import { SCHEMA_VERSION } from "@course-suite/format";
import { expect, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { button, courseIn, heading, launch, openFixture, status } from "./helpers.ts";

const FILE = "Night sky.crs";
const SKY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 8 4"><rect width="8" height="4" fill="#1b2a49"/></svg>';

const item = (id: string, text: string, more: Partial<ContentItem> = {}): ContentItem => ({
  id,
  kind: "content",
  text: `<p>${text}</p>`,
  ...more,
});

/** A course with a lesson of static blocks and an empty lesson. */
function nightSky(): Course {
  const shot = (n: number) =>
    item(`itmshot00${n}`, `Night ${n}`, { media: { key: "sky.svg", alt: `Sky on night ${n}` } });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "5b2c7d1e-3f4a-4b6c-8d9e-0a1b2c3d4e5f",
    kind: "course",
    title: "Night sky",
    entries: [
      {
        id: "lessnotes1",
        kind: "lesson",
        title: "Notes",
        blocks: [
          {
            id: "blkstate01",
            category: "statement",
            variant: "statement-a",
            items: [item("itmstate01", "Dark skies need patience.")],
          },
          {
            id: "blkimage01",
            category: "image",
            variant: "centered",
            media: [{ key: "sky.svg" }],
            items: [item("itmcapt001", "The sky at nine")],
          },
          {
            id: "blkgallr01",
            category: "gallery",
            variant: "grid-4",
            items: [shot(1), shot(2), shot(3), shot(4)],
          },
        ],
      },
      { id: "lessempty1", kind: "lesson", title: "Empty", blocks: [] },
    ],
    media: [
      {
        id: "mediasky01",
        key: "sky.svg",
        source: "upload",
        mimeType: "image/svg+xml",
        width: 80,
        height: 40,
      },
    ],
  };
}

/** Every text and static type of the library, in its order. */
const STATIC_TYPES = [
  "Columns",
  "Table",
  "Statement, plain",
  "Statement, framed",
  "Statement, ruled",
  "Statement, bold",
  "Note",
  "Quote, plain",
  "Quote, framed",
  "Quote, with photo",
  "Quote, large",
  "Quote over an image",
  "Quote carousel",
  "Numbered list",
  "Bulleted list",
  "Checklist",
  "Centred image",
  "Full-width image",
  "Image beside text",
  "Text over an image",
  "Banner",
  "Image carousel",
  "Grid of two columns",
  "Grid of three columns",
  "Grid of four columns",
  "Line",
  "Numbered divider",
  "Space",
];
/** The image types whose sample has no picture yet, which the player leaves out until one is added. */
const NO_PICTURE = ["Centred image", "Full-width image", "Banner"];

const blocksOf = (page: Page, lesson: string) =>
  page.getByRole("grid", { name: `Blocks of ${lesson}` });
const row = (page: Page, lesson: string, name: RegExp) =>
  blocksOf(page, lesson).getByRole("row", { name });
const announced = (page: Page) => page.locator(".be-blocks > [aria-live]");
const lessonIn = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
const kinds = (blocks: Block[]) => blocks.map((block) => `${block.category}/${block.variant}`);
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page, file = FILE): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, file);
}

async function openLesson(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeFocused();
}

async function openNightSky(page: Page, lesson = "Notes", query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, nightSky(), { "sky.svg": SKY });
  await openLesson(page, lesson);
}

/** Opens the library at the end of the lesson by keyboard and inserts the type named `name`. */
async function insertByKeyboard(page: Page, search: string, name: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).focus();
  await page.keyboard.press("Enter");
  const library = page.getByRole("dialog", { name: "Block library" });
  await expect(library.getByRole("searchbox", { name: "Search block types" })).toBeFocused();
  await page.keyboard.type(search);
  await page.keyboard.press("Tab");
  const option = library.getByRole("option", { name, exact: true });
  while (!(await option.evaluate((element) => element === document.activeElement))) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(library).toHaveCount(0);
}

/** Opens the library at the end of the lesson with the pointer and inserts the type named `name`. */
async function insertByPointer(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).click();
  const library = page.getByRole("dialog", { name: "Block library" });
  // Found by name, so the option is on show without scrolling the list.
  await library.getByRole("searchbox", { name: "Search block types" }).fill(name);
  await library.getByRole("option", { name, exact: true }).click();
  await expect(library).toHaveCount(0);
}

/** Closes the open format menu with Escape; focus goes back to its button. */
async function closeFormat(page: Page, focusBack = true): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Format" })).toHaveCount(0);
  if (focusBack) await expect(page.locator(":focus")).toHaveAccessibleName("Format");
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
  const seen = await page.evaluate(
    () => (window as unknown as { policyViolations: string[] }).policyViolations,
  );
  expect(seen).toEqual([]);
});

test("[rise:3C] blocks-editor 3, L4, W7, BLK-04: every text and static block is available in the library, and by keyboard each family inserts with sample content", async ({
  page,
}) => {
  await openNightSky(page, "Empty");
  await page.getByRole("button", { name: "All blocks" }).click();
  const library = page.getByRole("dialog", { name: "Block library" });
  for (const name of STATIC_TYPES) {
    await expect(library.getByRole("option", { name, exact: true }), name).not.toHaveAttribute(
      "aria-disabled",
    );
  }
  await page.keyboard.press("Escape");
  for (const [search, name] of [
    ["note", "Note"],
    ["carousel", "Quote carousel"],
    ["table", "Table"],
    ["checklist", "Checklist"],
    ["columns", "Columns"],
    ["numbered divider", "Numbered divider"],
    ["image carousel", "Image carousel"],
  ] as const) {
    await insertByKeyboard(page, search, name);
    await expect(announced(page)).toContainText(`Added ${name}`);
  }
  const blocks = lessonIn(await saved(page), "lessempty1").blocks;
  expect(kinds(blocks)).toEqual([
    "statement/note",
    "quote/carousel",
    "text/table",
    "list/checkbox",
    "text/columns",
    "divider/numbered",
    "gallery/carousel",
  ]);
  expect(blocks[1]?.items).toHaveLength(3);
  expect(blocks[1]?.items?.[0]).toMatchObject({
    text: "<p>Words someone said that make the point in their own voice.</p>",
    title: "Their name",
  });
  expect((blocks[2]?.items?.[0] as ContentItem | undefined)?.text).toContain(
    "<thead><tr><th>Item</th>",
  );
  expect(blocks[3]?.items?.map((one) => (one as ContentItem).text)).toEqual([
    "<p>The first point</p>",
    "<p>The second point</p>",
    "<p>The third point</p>",
  ]);
  // A new image block waits for the media library for its pictures (M2-13).
  const gallery = row(page, "Empty", /^Image carousel/);
  await expect(gallery.getByRole("button", { name: "Add picture" }).first()).toBeDisabled();
  await expect(
    gallery.getByText(/Adding pictures comes with the media library/).first(),
  ).toBeVisible();
});

test("[rise:3C] blocks-editor W9, 2.8, 2.9, BLK-04: quotes, list items and table cells are edited in place, added, moved and removed, each one undo step", async ({
  page,
}) => {
  await openNightSky(page, "Empty");
  await insertByPointer(page, "Quote carousel");
  const quotes = row(page, "Empty", /^Quote carousel/);
  const third = quotes.getByRole("group", { name: "Quote 3" });
  await third.getByRole("textbox", { name: "Name" }).fill("Ada");
  await third.getByRole("textbox", { name: "Name" }).press("Enter");
  await quotes.getByRole("button", { name: "Move Quote 3 up" }).click();
  await quotes.getByRole("button", { name: "Remove Quote 1" }).click();
  await quotes.getByRole("button", { name: "Add Quote 3" }).click();
  let block = lessonIn(await saved(page), "lessempty1").blocks[0];
  expect(block?.items?.map((one) => (one as ContentItem).title)).toEqual([
    "Ada",
    "Their name",
    "Their name",
  ]);
  // Undo takes back the added quote only.
  await heading(page, "Night sky").click();
  await page.keyboard.press("Control+Z");
  await expect(quotes.getByRole("group", { name: /^Quote \d$/ })).toHaveCount(2);

  await insertByPointer(page, "Table");
  const table = row(page, "Empty", /^Table/);
  const cell = table.getByRole("textbox", { name: "Row 2, column 1" });
  await cell.fill("Orion");
  await cell.press("Enter");
  await table.getByRole("button", { name: "Add row" }).click();
  await table.getByRole("button", { name: "Add column" }).click();
  await table.getByRole("textbox", { name: "Row 4, column 3" }).fill("Winter");
  await table.getByRole("textbox", { name: "Row 4, column 3" }).press("Tab");
  await table.getByText("First row is a header").click();
  block = lessonIn(await saved(page), "lessempty1").blocks[1];
  expect((block?.items?.[0] as ContentItem | undefined)?.text).toBe(
    "<table><tbody><tr><td>Item</td><td>Detail</td><td></td></tr><tr><td>Orion</td><td>What to know about it</td><td></td></tr><tr><td>Second item</td><td>What to know about it</td><td></td></tr><tr><td></td><td></td><td>Winter</td></tr></tbody></table>",
  );
  // The block as learners see it: the real player's table.
  await expect(table.locator(".be-block-preview td").first()).toHaveText("Item");
});

test("[rise:3C] blocks-editor L10, 2.5, 2.7, 2.9, 2.14, BLK-04: by keyboard, the format menu holds each block's own options: heading level, note colour, list numbers, divider restart", async ({
  page,
}) => {
  await openNightSky(page, "Empty");
  await page
    .getByRole("toolbar", { name: "Add a block at the end" })
    .getByRole("button", { name: "Paragraph with heading" })
    .click();
  const text = row(page, "Empty", /^Paragraph with heading/);
  await text.getByRole("button", { name: "Format", exact: true }).focus();
  await page.keyboard.press("Enter");
  const format = page.getByRole("dialog", { name: "Format" });
  const level = format.getByRole("button", { name: /Heading level/ });
  await expect(level).toContainText("Level 2");
  await level.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Level 3" }).focus();
  await page.keyboard.press("Enter");
  await expect(level).toContainText("Level 3");
  await expect(level).toBeFocused();
  await closeFormat(page);
  // The chosen level is the element learners get (BLK-04).
  await expect(text.locator(".be-block-preview h3.block-heading")).toHaveText("A clear heading");
  let blocks = lessonIn(await saved(page), "lessempty1").blocks;
  expect(blocks[0]?.variantSettings).toEqual({ headingLevel: 3 });

  await insertByKeyboard(page, "note", "Note");
  const note = row(page, "Empty", /^Note/);
  await note.getByRole("button", { name: "Format", exact: true }).focus();
  await page.keyboard.press("Enter");
  const colour = page
    .getByRole("dialog", { name: "Format" })
    .getByRole("textbox", { name: "Note colour" });
  await colour.focus();
  await page.keyboard.type("#1b2a49");
  await page.keyboard.press("Enter");
  await expect(note.locator(".be-block-preview .note")).toHaveCSS(
    "background-color",
    "rgb(27, 42, 73)",
  );
  // Light text on the dark note, automatically.
  await expect(note.locator(".be-block-preview .note")).toHaveCSS("color", "rgb(255, 255, 255)");
  await closeFormat(page);

  await insertByKeyboard(page, "numbered list", "Numbered list");
  const list = row(page, "Empty", /^Numbered list/);
  await list.getByRole("button", { name: "Format", exact: true }).click();
  const first = page
    .getByRole("dialog", { name: "Format" })
    .getByRole("spinbutton", { name: "First number (Number)" });
  await first.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await expect(list.locator(".be-block-preview ol")).toHaveAttribute("start", "4");
  await closeFormat(page);

  await insertByKeyboard(page, "numbered divider", "Numbered divider");
  await insertByKeyboard(page, "numbered divider", "Numbered divider");
  const second = blocksOf(page, "Empty").getByRole("row", { name: "Numbered divider" }).nth(1);
  await expect(second.locator(".be-block-preview .divider-number")).toHaveText("2");
  await second.getByRole("button", { name: "Format", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Format" })
    .getByRole("switch", { name: "Start counting again" })
    .focus();
  await page.keyboard.press("Space");
  await expect(second.locator(".be-block-preview .divider-number")).toHaveText("1");
  await closeFormat(page);
  blocks = lessonIn(await saved(page), "lessempty1").blocks;
  expect(blocks.map((block) => block.variantSettings)).toEqual([
    { headingLevel: 3 },
    { noteColor: "#1b2a49" },
    { start: 4 },
    undefined,
    { restart: true },
  ]);
});

test("[rise:3C] blocks-editor W15, 2.10, 2.17, BLK-04: a picture without alt text is flagged until it gets alt text or is marked decorative", async ({
  page,
}) => {
  await openNightSky(page);
  const image = row(page, "Notes", /^Centred image/);
  await expect(image.getByText("Picture: sky.svg")).toBeVisible();
  const alt = image.getByRole("textbox", { name: "Alt text of the Picture" });
  await expect(alt).toHaveAccessibleDescription(
    "This picture has no alt text. Describe it, or mark it as decorative.",
  );
  await expect(image.locator(".be-warning")).toBeVisible();
  await image.getByText("Decorative: screen readers skip it").click();
  await expect(image.locator(".be-warning")).toHaveCount(0);
  let block = lessonIn(await saved(page), "lessnotes1").blocks[1];
  expect(block?.media).toEqual([{ key: "sky.svg", alt: "" }]);
  await image.getByText("Decorative: screen readers skip it").click();
  await expect(image.locator(".be-warning")).toBeVisible();
  await alt.fill("The sky over the hills at nine");
  await alt.press("Enter");
  await expect(image.locator(".be-warning")).toHaveCount(0);
  block = lessonIn(await saved(page), "lessnotes1").blocks[1];
  expect(block?.media).toEqual([{ key: "sky.svg", alt: "The sky over the hills at nine" }]);
  await expect(image.locator(".be-block-preview img.image")).toHaveAttribute(
    "alt",
    "The sky over the hills at nine",
  );
});

test("[rise:3C] blocks-editor W8, UI-BLOCKS-EDITOR-R25, BLK-04: statements switch to a note and galleries to fewer columns, keeping what they hold", async ({
  page,
}) => {
  await openNightSky(page);
  const statement = blocksOf(page, "Notes").getByRole("row").first();
  await statement.getByRole("button", { name: /Block type/ }).click();
  await page.getByRole("option", { name: "Note", exact: true }).click();
  await expect(statement).toHaveAccessibleName("Note: Dark skies need patience.");
  await expect(statement.locator(".be-block-preview .note")).toContainText(
    "Dark skies need patience.",
  );
  const gallery = row(page, "Notes", /^Grid of four columns/);
  await gallery.getByRole("button", { name: /Block type/ }).click();
  await page.getByRole("option", { name: "Grid of two columns" }).click();
  const grid = blocksOf(page, "Notes").getByRole("row").nth(2);
  await expect(grid.locator(".be-block-preview figure")).toHaveCount(2);
  let blocks = lessonIn(await saved(page), "lessnotes1").blocks;
  expect(blocks[2]?.items).toHaveLength(4);
  await grid.getByRole("button", { name: /Block type/ }).click();
  await page.getByRole("option", { name: "Grid of four columns" }).click();
  await expect(grid.locator(".be-block-preview figure")).toHaveCount(4);
  blocks = lessonIn(await saved(page), "lessnotes1").blocks;
  expect(kinds(blocks)).toEqual(["statement/note", "image/centered", "gallery/grid-4"]);
});

test("[rise:3J] blocks-editor W3, H15, GB-O6, D-38: by keyboard, a course starts from a placeholder template, and a lesson template adds a lesson", async ({
  page,
}) => {
  await launch(page);
  await button(page, "New").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "From a template…" }).focus();
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Start from a template" });
  await expect(picker.getByRole("option", { name: /^Starter course/ })).toBeFocused();
  // Each template says what it holds.
  await expect(picker.getByRole("option", { name: /^Starter course/ })).toContainText(
    "Course. Two sections",
  );
  await page.keyboard.press("Enter");
  const title = page.getByRole("dialog", { name: "New course" });
  await title.getByRole("textbox", { name: "Title" }).fill("Star club");
  await page.keyboard.press("Enter");
  await expect(heading(page, "Star club")).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
  let course = await courseIn(page, "Star club.crs");
  expect(course.entries.map((entry) => entry.title)).toEqual([
    "Getting started",
    "Introduction",
    "What you will learn",
    "Explain an idea",
    "Teach the steps",
    "Summary",
  ]);
  // Placeholder text tells the author what to write.
  expect(JSON.stringify(course)).toContain("Write a welcome heading");

  // A lesson from a template, at the end of the outline.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Lesson from a template…" }).click();
  const lessons = page.getByRole("dialog", { name: "Add a lesson from a template" });
  await lessons.getByRole("option", { name: /^Teach the steps/ }).click();
  await lessons.getByRole("button", { name: "Use template" }).click();
  await expect(
    page.locator("[aria-live]").filter({ hasText: "Added Teach the steps" }),
  ).toHaveCount(1);
  course = await saved(page, "Star club.crs");
  const added = course.entries.at(-1) as LessonEntry;
  expect(added.title).toBe("Teach the steps");
  expect(kinds(added.blocks)).toEqual([
    "text/paragraph-with-heading",
    "list/numbered",
    "statement/note",
    "list/checkbox",
  ]);

  // A microlearning template opens on its one lesson.
  await button(page, "Back to your courses").click();
  await button(page, "New").click();
  await page.getByRole("menuitem", { name: "From a template…" }).click();
  await page.getByRole("option", { name: /^One idea, explained/ }).click();
  await page
    .getByRole("dialog", { name: "Start from a template" })
    .getByRole("button", { name: "Use template" })
    .click();
  await page
    .getByRole("dialog", { name: "New microlearning" })
    .getByRole("textbox", { name: "Title" })
    .fill("Moon phases");
  await page
    .getByRole("dialog", { name: "New microlearning" })
    .getByRole("button", { name: "Create" })
    .click();
  await expect(heading(page, "Moon phases")).toBeVisible();
  await expect(blocksOf(page, "Moon phases").locator(".be-block")).toHaveCount(6);
});

test("[rise:3C] blocks-editor P1, BLK-04: the preview shows every static block in the real player, accessible, with a working carousel and checklist", async ({
  page,
}) => {
  await openNightSky(page, "Empty");
  for (const name of STATIC_TYPES) await insertByPointer(page, name);
  await button(page, "Preview").click();
  const preview = "iframe[title='Course preview']:not([data-pending])";
  const frame = page.frameLocator(preview);
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Empty");
  await expect(frame.locator(".blocks > [data-block]")).toHaveCount(
    STATIC_TYPES.length - NO_PICTURE.length,
  );
  const shown = await (await page.locator(preview).elementHandle())?.contentFrame();
  if (!shown) throw new Error("no preview frame on show");
  expect(await violations(shown), "every static block in the preview").toEqual([]);
  const quotes = frame.getByRole("region", { name: "Quotes" });
  await quotes.getByRole("button", { name: "Next quote" }).click();
  await expect(quotes.locator(".carousel-position")).toHaveText("Quote 2 of 3");
  const box = frame.getByRole("checkbox", { name: "The second point" });
  await box.click();
  await expect(box).toBeChecked();
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on the static block screens in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);
    await launch(page, `?theme=${theme}`);
    await openFixture(page, FILE, nightSky(), { "sky.svg": SKY });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Lesson from a template…" }).click();
    await check("lesson templates");
    await page.keyboard.press("Escape");
    await openLesson(page, "Notes");
    await check("lesson with a statement, a picture without alt text and a gallery");
    for (const name of ["Quote carousel", "Table", "Checklist", "Columns", "Numbered divider"]) {
      await insertByPointer(page, name);
    }
    await check("quote carousel, table, checklist, columns and divider fields");
    for (const name of [
      /^Statement/,
      /^Quote carousel/,
      /^Table/,
      /^Checklist/,
      /^Centred image/,
      /^Grid/,
      /^Columns/,
      /^Numbered divider/,
    ]) {
      await row(page, "Notes", name)
        .first()
        .getByRole("button", { name: "Format", exact: true })
        .click();
      await check(`format menu of ${name.source}`);
      await closeFormat(page, false);
    }
    await row(page, "Notes", /^Columns/)
      .getByRole("button", { name: "Format", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Format" })
      .getByText("A picture above each column")
      .click();
    await closeFormat(page);
    await check("columns with picture slots");
    await page.keyboard.press("Control+S");
    await expect(saveState(page)).toHaveText("Saved");
    await button(page, "Back to your courses").click();
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "From a template…" }).click();
    await check("course templates");
    await page.keyboard.press("Escape");
  });
}
