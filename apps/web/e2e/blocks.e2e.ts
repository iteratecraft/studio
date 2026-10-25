// Block editing in Chromium against the in-memory host (M2-10, BLK-03): the block library and the
// shortcut bar, moving, duplicating and deleting blocks, copy and paste within and across lessons
// and courses, manage blocks, the style and format menus, formatted text, and the preview at the
// lesson, by pointer and by keyboard, with axe on every screen in both themes.
import {
  type Block,
  type ContentItem,
  type Course,
  type LessonEntry,
  SCHEMA_VERSION,
} from "@course-suite/format";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import {
  back,
  button,
  card,
  courseIn,
  heading,
  launch,
  openFixture,
  status,
  unzip,
} from "./helpers.ts";

const FILE = "Kitchen garden.crs";
const BED =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 8 4"><rect width="8" height="4" fill="#6b4f2a"/></svg>';

/** A course with two lessons: Planning holds a heading, a paragraph, an image and a continue. */
function garden(): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "7c1e4b2a-9d3f-4a6e-8b51-2f0c9e7d4a13",
    kind: "course",
    title: "Kitchen garden",
    entries: [
      {
        id: "lessplan01",
        kind: "lesson",
        title: "Planning",
        blocks: [
          {
            id: "blkhead001",
            category: "text",
            variant: "heading",
            items: [{ id: "itmhead001", kind: "content", title: "Pick a sunny spot" }],
          },
          {
            id: "blkpara001",
            category: "text",
            variant: "paragraph",
            items: [
              {
                id: "itmpara001",
                kind: "content",
                text: "<p>Most vegetables need six hours of sun.</p>",
              },
            ],
          },
          {
            id: "blkimage01",
            category: "image",
            variant: "centered",
            media: [{ key: "bed.svg", alt: "A raised bed" }],
          },
          { id: "blkcont001", category: "divider", variant: "continue" },
        ],
      },
      { id: "lessplnt01", kind: "lesson", title: "Planting", blocks: [] },
    ],
    media: [
      {
        id: "mediabed01",
        key: "bed.svg",
        source: "upload",
        mimeType: "image/svg+xml",
        width: 80,
        height: 40,
      },
    ],
  };
}

/** Another course, to paste into. */
function herbs(): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "0e5d2c7b-4a19-4f3e-9c86-1b7a3d5e9f20",
    kind: "course",
    title: "Herb pots",
    entries: [{ id: "lessherb01", kind: "lesson", title: "Pots", blocks: [] }],
    media: [],
  };
}

const blocksOf = (page: Page, lesson: string) =>
  page.getByRole("grid", { name: `Blocks of ${lesson}` });
const blockRow = (page: Page, lesson: string, name: string) =>
  blocksOf(page, lesson).getByRole("row", { name, exact: true });
const announced = (page: Page) => page.locator(".be-blocks > [aria-live]");
/** Names of the block rows of a lesson, in order. */
const rowNames = (page: Page, lesson: string) =>
  blocksOf(page, lesson)
    .getByRole("row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")));

async function openLesson(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeFocused();
}

async function openGarden(page: Page, query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, garden(), { "bed.svg": BED });
  await openLesson(page, "Planning");
}

/** The editor's save state: the one status in its top bar. */
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page, file = FILE): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, file);
}

const lessonIn = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
/** The first content item of a block: its heading and text. */
const contentOf = (block: Block | undefined) => block?.items?.[0] as ContentItem | undefined;
const kinds = (blocks: Block[]) => blocks.map((block) => `${block.category}/${block.variant}`);

/** Opens the "more actions" menu of a block row and picks an item. */
async function more(page: Page, row: Locator, item: string): Promise<void> {
  await row.getByRole("button", { name: /^More actions for / }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

// The editor page runs under the desktop app's release content security policy
// (vite.config.ts): no block editing step may break it.
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

test.describe("block library", () => {
  test("[rise:3C] blocks-editor W7, L3, L4, UI-BLOCKS-EDITOR-R14: by keyboard alone, the library inserts a block where it was opened, one undo step each", async ({
    page,
  }) => {
    await openGarden(page);
    await expect(button(page, "Undo")).toBeDisabled();
    await page.getByRole("button", { name: "Insert a block at the start" }).focus();
    await page.keyboard.press("Enter");
    const library = page.getByRole("dialog", { name: "Block library" });
    const search = library.getByRole("searchbox", { name: "Search block types" });
    await expect(search).toBeFocused();
    // Every type is listed; those the player cannot show yet are there but unavailable.
    const types = library.getByRole("listbox", { name: "Block library" });
    await expect(types.getByRole("option", { name: /^Columns/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(types.getByRole("option", { name: /^Columns/ })).toContainText(
      "Not available yet",
    );
    await expect(types.getByRole("option", { name: "Single choice" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await page.keyboard.type("subhead");
    await expect(types.getByRole("option")).toHaveText(["Paragraph with subheading", "Subheading"]);
    await page.keyboard.press("Tab");
    await expect(types.getByRole("option", { name: "Paragraph with subheading" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(library).toHaveCount(0);
    await expect(announced(page)).toHaveText("Added Subheading: A short subheading");
    // Focus goes to the new block's first field, ready to type.
    const field = blockRow(page, "Planning", "Subheading: A short subheading").getByRole(
      "textbox",
      { name: "Subheading" },
    );
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Before you dig");
    await page.keyboard.press("Enter");
    await expect(blockRow(page, "Planning", "Subheading: Before you dig")).toBeVisible();

    // Below a block: its insert control.
    await blockRow(page, "Planning", "Heading: Pick a sunny spot")
      .getByRole("button", { name: "Insert a block below Heading: Pick a sunny spot" })
      .focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("single");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(announced(page)).toHaveText("Added Single choice: Which answer is right?");

    // The shortcut bar adds at the end.
    await page
      .getByRole("toolbar", { name: "Add a block at the end" })
      .getByRole("button", { name: "Continue" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(announced(page)).toHaveText("Added Continue");
    expect(await rowNames(page, "Planning")).toEqual([
      "Subheading: Before you dig",
      "Heading: Pick a sunny spot",
      "Single choice: Which answer is right?",
      "Paragraph: Most vegetables need six hours of sun.",
      "Centred image",
      "Continue",
      "Continue",
    ]);
    const course = await saved(page);
    const blocks = lessonIn(course, "lessplan01").blocks;
    expect(kinds(blocks)).toEqual([
      "text/subheading",
      "text/heading",
      "knowledge-check/single-choice",
      "text/paragraph",
      "image/centered",
      "divider/continue",
      "divider/continue",
    ]);
    expect(blocks[0]?.items?.[0]).toMatchObject({ kind: "content", title: "Before you dig" });
    expect(blocks[2]?.question).toMatchObject({
      kind: "single-choice",
      prompt: "<p>Which answer is right?</p>",
      answers: [
        { text: "A right answer", correct: true },
        { text: "A wrong answer", correct: false },
      ],
    });
    // Each insert and the title edit are one undo step each: four steps back to the start.
    await heading(page, "Kitchen garden").click();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Control+Z");
    expect(await rowNames(page, "Planning")).toEqual([
      "Subheading: A short subheading",
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Centred image",
      "Continue",
    ]);
    await page.keyboard.press("Control+Z");
    await expect(button(page, "Undo")).toBeDisabled();
    expect(await rowNames(page, "Planning")).toHaveLength(4);
    await page.keyboard.press("Control+Y");
    expect(await rowNames(page, "Planning")).toHaveLength(5);
  });

  test("[rise:3A] blocks-editor W2, L2: a new microlearning edits its one lesson on the overview, from the shortcut bar", async ({
    page,
  }) => {
    await launch(page);
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "Blank microlearning" }).click();
    const dialog = page.getByRole("dialog", { name: "New microlearning" });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Quick tips");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "No blocks yet" })).toBeVisible();
    await page
      .getByRole("toolbar", { name: "Add a block at the end" })
      .getByRole("button", { name: "Paragraph with heading" })
      .click();
    await expect(
      blocksOf(page, "Quick tips").getByRole("row", {
        name: "Paragraph with heading: A clear heading",
      }),
    ).toBeVisible();
    const course = await saved(page, "Quick tips.crs");
    expect(kinds((course.entries[0] as LessonEntry).blocks)).toEqual([
      "text/paragraph-with-heading",
    ]);
  });
});

test.describe("block tools", () => {
  test("[rise:3D] blocks-editor L6, W12, UI-BLOCKS-EDITOR-R24: move up and down, duplicate below and delete with an undo notice, each announced and one undo step", async ({
    page,
  }) => {
    await openGarden(page);
    const paragraph = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    );
    const tools = paragraph.getByRole("toolbar", {
      name: "Tools for Paragraph: Most vegetables need six hours of sun.",
    });
    await tools.getByRole("button", { name: "Move up" }).click();
    await expect(announced(page)).toHaveText(
      "Moved Paragraph: Most vegetables need six hours of sun. to place 1 of 4",
    );
    // At the top, Move up is off and focus stays on the block's tools.
    await expect(tools.getByRole("button", { name: "Move up" })).toBeDisabled();
    await expect(tools.getByRole("button", { name: "Move down" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(announced(page)).toHaveText(
      "Moved Paragraph: Most vegetables need six hours of sun. to place 2 of 4",
    );
    await expect(tools.getByRole("button", { name: "Move down" })).toBeFocused();

    await tools.getByRole("button", { name: "Duplicate" }).click();
    await expect(announced(page)).toHaveText(
      "Added a copy of Paragraph: Most vegetables need six hours of sun. below it",
    );
    expect(await rowNames(page, "Planning")).toEqual([
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Paragraph: Most vegetables need six hours of sun.",
      "Centred image",
      "Continue",
    ]);
    let blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks[1]?.id).toBe("blkpara001");
    expect(blocks[2]?.id).not.toBe("blkpara001");
    expect(blocks[2]?.items?.[0]?.id).not.toBe("itmpara001");
    expect(blocks[2]?.items).toEqual([{ ...blocks[1]?.items?.[0], id: blocks[2]?.items?.[0]?.id }]);

    // Delete: the notice undoes it; focus goes to the next block.
    const image = blockRow(page, "Planning", "Centred image");
    await image.getByRole("button", { name: "Delete" }).click();
    await expect(image).toHaveCount(0);
    await expect(
      blockRow(page, "Planning", "Continue").getByRole("button", { name: "Style" }),
    ).toBeFocused();
    const notice = page.getByRole("alertdialog", { name: "Deleted Centred image" });
    await notice.getByRole("button", { name: "Undo" }).click();
    await expect(image).toBeVisible();
    blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.map((block) => block.id)).toContain("blkimage01");
    await image.getByRole("button", { name: "Delete" }).click();
    blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.map((block) => block.id)).not.toContain("blkimage01");
    // The image's file stays in the course's media index.
    expect((await courseIn(page, FILE)).media.map((media) => media.key)).toEqual(["bed.svg"]);
  });

  test("[rise:3D] BLK-03, UI-ACCESSIBILITY: blocks are reordered by keyboard drag and by pointer drag, announced, with ids kept", async ({
    page,
  }) => {
    // Tall enough to show every block, so a pointer drag needs no scrolling.
    await page.setViewportSize({ width: 1280, height: 1800 });
    await openGarden(page);
    const list = blocksOf(page, "Planning");
    await blockRow(page, "Planning", "Heading: Pick a sunny spot").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(blockRow(page, "Planning", "Centred image")).toBeFocused();
    await page.keyboard.press("Tab");
    const handle = blockRow(page, "Planning", "Centred image").getByRole("button", {
      name: /drag/i,
    });
    await expect(handle).toBeFocused();
    // Each key waits for the drag state it needs.
    const dropTargets = list.getByRole("row", { name: /^Insert / });
    await page.keyboard.press("Enter");
    await expect(dropTargets.first()).toBeAttached();
    await page.keyboard.press("ArrowUp");
    await expect(dropTargets.and(page.locator("[data-drop-target]"))).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await expect(
      list.getByRole("row", {
        name: "Insert between Heading: Pick a sunny spot and Paragraph: Most vegetables need six hours of sun.",
      }),
    ).toHaveAttribute("data-drop-target", "true");
    await page.keyboard.press("Enter");
    await expect(dropTargets).toHaveCount(0);
    await expect(announced(page)).toHaveText("Moved Centred image to place 2 of 4");

    // Pointer drag by the handle onto the top edge of a block drops before it.
    const continueRow = blockRow(page, "Planning", "Continue");
    const box = await continueRow.getByRole("button", { name: /drag/i }).boundingBox();
    const start = await continueRow.boundingBox();
    if (!box || !start) throw new Error("the Continue block is not shown");
    await continueRow.dragTo(blockRow(page, "Planning", "Heading: Pick a sunny spot"), {
      sourcePosition: { x: box.x - start.x + box.width / 2, y: box.y - start.y + box.height / 2 },
      targetPosition: { x: 40, y: 3 },
    });
    await expect
      .poll(() => rowNames(page, "Planning"))
      .toEqual([
        "Continue",
        "Heading: Pick a sunny spot",
        "Centred image",
        "Paragraph: Most vegetables need six hours of sun.",
      ]);
    const blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.map((block) => block.id)).toEqual([
      "blkcont001",
      "blkhead001",
      "blkimage01",
      "blkpara001",
    ]);
  });
});

test.describe("copy and paste", () => {
  test("[rise:3J] blocks-editor W12, UI-BLOCKS-EDITOR-R24: Ctrl+C and Ctrl+V copy a block below itself, and the menu pastes it into another lesson", async ({
    page,
  }) => {
    await openGarden(page);
    // By keyboard: the block's row, Ctrl+C, then Ctrl+V pastes below it.
    await blockRow(page, "Planning", "Heading: Pick a sunny spot").focus();
    await page.keyboard.press("Control+C");
    await expect(
      page.getByRole("alertdialog", { name: "Copied 1 block. Paste it in any lesson." }),
    ).toBeVisible();
    await page.keyboard.press("Control+V");
    await expect(announced(page)).toHaveText("Pasted 1 block");
    expect(await rowNames(page, "Planning")).toEqual([
      "Heading: Pick a sunny spot",
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Centred image",
      "Continue",
    ]);
    // The paste is one undo step.
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    expect(await rowNames(page, "Planning")).toHaveLength(4);

    // Another lesson of this course: the paste control at its end.
    await page.getByRole("button", { name: /Go to/ }).click();
    await page.getByRole("option", { name: "Planting" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Planting" })).toBeFocused();
    await page
      .getByRole("toolbar", { name: "Add a block at the end" })
      .getByRole("button", { name: "Paste 1 block here" })
      .click();
    await expect(
      blockRow(page, "Planting", "Heading: Pick a sunny spot").getByRole("button", {
        name: "Style",
      }),
    ).toBeFocused();
    // And below a block, from its menu.
    await more(page, blockRow(page, "Planting", "Heading: Pick a sunny spot"), "Paste below");
    const course = await saved(page);
    const pasted = lessonIn(course, "lessplnt01").blocks;
    expect(kinds(pasted)).toEqual(["text/heading", "text/heading"]);
    expect(new Set(pasted.map((block) => block.id)).size).toBe(2);
    expect(pasted.map((block) => block.id)).not.toContain("blkhead001");
    expect(contentOf(pasted[0])?.title).toBe("Pick a sunny spot");
  });

  test("[rise:3J] blocks-editor L16, W13, BLK-03: blocks chosen in manage blocks paste into another course in order, with their media", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, "Herb pots.crs", herbs());
    await back(page);
    await openFixture(page, FILE, garden(), { "bed.svg": BED });
    await openLesson(page, "Planning");
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    const list = manage.getByRole("grid", { name: "Blocks to select in Planning" });
    // Picked in any order, they keep the lesson's order.
    await list.getByRole("row", { name: "Centred image" }).click();
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).click();
    await list.getByRole("row", { name: "Continue" }).click();
    await expect(manage.getByRole("status")).toHaveText("3 blocks selected");
    await manage.getByRole("button", { name: "Copy" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "Copied 3 blocks. Paste them in any lesson." }),
    ).toBeVisible();
    await manage.getByRole("button", { name: "Close" }).click();

    await back(page);
    await card(page, "Herb pots").click();
    await openLesson(page, "Pots");
    await page.getByRole("button", { name: "All blocks" }).click();
    await page
      .getByRole("dialog", { name: "Block library" })
      .getByRole("button", { name: "Paste 3 blocks here" })
      .click();
    await expect(announced(page)).toHaveText("Pasted 3 blocks");
    expect(await rowNames(page, "Pots")).toEqual([
      "Heading: Pick a sunny spot",
      "Centred image",
      "Continue",
    ]);
    const course = await saved(page, "Herb pots.crs");
    const blocks = (course.entries[0] as LessonEntry).blocks;
    expect(kinds(blocks)).toEqual(["text/heading", "image/centered", "divider/continue"]);
    expect(blocks.map((block) => block.id)).not.toContain("blkimage01");
    // The media index entry of the image and its file came along.
    expect(course.media).toEqual([
      expect.objectContaining({ key: "bed.svg", mimeType: "image/svg+xml" }),
    ]);
    const zip = await unzip(page, "Herb pots.crs");
    const manifest = JSON.parse(new TextDecoder().decode(await zip.read("project.json")));
    expect(Object.keys(manifest.assets)).toEqual(["bed.svg"]);
  });

  test("[rise:3J] blocks-editor W13, UI-BLOCKS-EDITOR-R24: manage blocks duplicates the selection below it, moves it as one and deletes it after asking", async ({
    page,
  }) => {
    await openGarden(page);
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    const list = manage.getByRole("grid", { name: "Blocks to select in Planning" });
    // By keyboard: Space picks a row, arrows move between rows.
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(manage.getByRole("status")).toHaveText("2 blocks selected");
    await manage.getByRole("button", { name: "Duplicate" }).click();
    await expect(announced(page)).toHaveText("Added copies of 2 blocks below the selection");
    expect(await rowNames(page, "Planning")).toEqual([
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Centred image",
      "Continue",
    ]);
    // The selection moves as one, here by pointer below the image.
    const handle = list.getByRole("row", { name: "Heading: Pick a sunny spot" }).first();
    const box = await handle.getByRole("button", { name: /drag/i }).boundingBox();
    const start = await handle.boundingBox();
    const target = list.getByRole("row", { name: "Centred image" });
    const end = await target.boundingBox();
    if (!box || !start || !end) throw new Error("the rows are not shown");
    await handle.dragTo(target, {
      sourcePosition: { x: box.x - start.x + box.width / 2, y: box.y - start.y + box.height / 2 },
      targetPosition: { x: 40, y: end.height - 3 },
    });
    await expect
      .poll(() => rowNames(page, "Planning"))
      .toEqual([
        "Heading: Pick a sunny spot",
        "Paragraph: Most vegetables need six hours of sun.",
        "Centred image",
        "Heading: Pick a sunny spot",
        "Paragraph: Most vegetables need six hours of sun.",
        "Continue",
      ]);
    let blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.slice(3, 5).map((block) => block.id)).toEqual(["blkhead001", "blkpara001"]);

    await manage.getByRole("button", { name: "Delete" }).click();
    const question = manage.getByRole("alert");
    await expect(question).toContainText("Delete 2 blocks?");
    await expect(question.getByRole("button", { name: "Cancel" })).toBeFocused();
    await question.getByRole("button", { name: "Delete" }).click();
    await expect(announced(page)).toHaveText("Deleted 2 blocks");
    await expect(manage.getByRole("status")).toHaveText("0 blocks selected");
    blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.map((block) => block.id)).not.toContain("blkhead001");
    expect(blocks).toHaveLength(4);
    // One undo brings both back.
    await manage.getByRole("button", { name: "Close" }).click();
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    expect(await rowNames(page, "Planning")).toHaveLength(6);
  });
});

test.describe("block settings and preview", () => {
  test("[rise:3D] blocks-editor L9, W10, UI-BLOCKS-EDITOR-R19: the style menu sets a background colour and its text, one undo step each, shown by the real player", async ({
    page,
  }) => {
    await openGarden(page);
    const paragraph = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    );
    await paragraph.getByRole("button", { name: "Style" }).click();
    const style = page.getByRole("dialog", { name: "Style" });
    await style.getByRole("button", { name: /Background/ }).click();
    // Theme colours and images arrive with themes and media.
    await expect(page.getByRole("option", { name: /^Theme colour/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("option", { name: /^Image/ })).toContainText("Comes with images");
    await page.getByRole("option", { name: "Dark" }).click();
    let block = lessonIn(await saved(page), "lessplan01").blocks[1];
    expect(block?.settings).toEqual({ background: { kind: "color", color: "#2b3038" } });

    await style.getByRole("button", { name: /Background/ }).click();
    await page.getByRole("option", { name: "Custom colour" }).click();
    const color = style.getByRole("textbox", { name: "Colour" });
    await color.fill("#FFEB3B");
    await color.press("Enter");
    await style.getByRole("button", { name: /Text colour/ }).click();
    await page.getByRole("option", { name: "Light" }).click();
    block = lessonIn(await saved(page), "lessplan01").blocks[1];
    expect(block?.settings).toEqual({
      background: { kind: "color", color: "#ffeb3b" },
      textContrast: "light",
    });
    // A colour that is not one stays out of the course.
    await color.fill("yellow");
    await color.press("Enter");
    await expect(color).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await expect(style).toHaveCount(0);

    // One undo step per change: the text colour goes back to automatic.
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    block = lessonIn(await saved(page), "lessplan01").blocks[1];
    expect(block?.settings).toEqual({ background: { kind: "color", color: "#ffeb3b" } });

    // The preview shows it: black text on yellow, automatically (4.5:1, rise.md rule 18).
    await button(page, "Preview").click();
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    const shown = frame.locator('[data-block="blkpara001"]');
    await expect(shown).toHaveCSS("background-color", "rgb(255, 235, 59)");
    await expect(shown.locator("p")).toHaveCSS("color", "rgb(0, 0, 0)");
  });

  test("[rise:3D] blocks-editor L10, W11, UI-BLOCKS-EDITOR-R18: by keyboard, the format menu sets padding by preset or exact pixels, linked or not, the content width and the animation", async ({
    page,
  }) => {
    await openGarden(page);
    const heading1 = blockRow(page, "Planning", "Heading: Pick a sunny spot");
    await heading1.getByRole("button", { name: "Format" }).focus();
    await page.keyboard.press("Enter");
    const format = page.getByRole("dialog", { name: "Format" });
    await expect(format).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(format.getByRole("button", { name: "Small" })).toBeFocused();
    // Medium is the default, 30 px top and bottom.
    await expect(format.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(format.getByRole("button", { name: "Large" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(format.getByRole("button", { name: "Large" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    let block = lessonIn(await saved(page), "lessplan01").blocks[0];
    expect(block?.settings).toEqual({ padding: { top: 60, bottom: 60 } });

    await page.keyboard.press("Tab");
    await expect(format.getByRole("button", { name: "More padding options" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(format.getByRole("button", { name: "More padding options" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Linked: the top slider moves both.
    await page.keyboard.press("Tab");
    await expect(format.getByRole("slider", { name: "Top padding" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(format.getByRole("spinbutton", { name: "Bottom padding (Pixels)" })).toHaveValue(
      "61",
    );
    block = lessonIn(await saved(page), "lessplan01").blocks[0];
    expect(block?.settings).toEqual({ padding: { top: 61, bottom: 61 } });
    // Unlinked, a typed number sets one side, held to 0 to 200.
    await format.getByRole("switch", { name: "Link top and bottom" }).focus();
    await page.keyboard.press("Space");
    const top = format.getByRole("spinbutton", { name: "Top padding (Pixels)" });
    await top.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("250");
    await page.keyboard.press("Enter");
    await expect(top).toHaveValue("200");
    block = lessonIn(await saved(page), "lessplan01").blocks[0];
    expect(block?.settings).toEqual({ padding: { top: 200, bottom: 61, linked: false } });

    await format.getByRole("button", { name: /Content width/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Narrow" }).focus();
    await page.keyboard.press("Enter");
    // Text blocks do not animate unless asked (rise.md 3D: on by default for other blocks).
    const fade = format.getByRole("switch", { name: "Fade in when scrolled into view" });
    await expect(fade).not.toBeChecked();
    await fade.focus();
    await page.keyboard.press("Space");
    block = lessonIn(await saved(page), "lessplan01").blocks[0];
    expect(block?.settings).toEqual({
      padding: { top: 200, bottom: 61, linked: false },
      contentWidth: "narrow",
      entranceAnimation: true,
    });
    await page.keyboard.press("Escape");
    await expect(format).toHaveCount(0);
    await expect(heading1.getByRole("button", { name: "Format" })).toBeFocused();
    // The image block animates by default.
    await blockRow(page, "Planning", "Centred image")
      .getByRole("button", { name: "Format" })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Format" })
        .getByRole("switch", { name: "Fade in when scrolled into view" }),
    ).toBeChecked();
  });

  test("blocks-editor P1, W23, UI-BLOCKS-EDITOR-R52, 2.20: the preview opens at the lesson being edited, switches devices and edits the lesson on show", async ({
    page,
  }) => {
    await openGarden(page);
    await button(page, "Preview").click();
    const pane = page.getByRole("region", { name: "Preview" });
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Planning");
    // The real player shows the lesson's blocks and the image from the course file.
    await expect(frame.getByRole("heading", { level: 2 })).toHaveText("Pick a sunny spot");
    const image = frame.getByRole("img", { name: "A raised bed" });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    const devices = pane.getByRole("radiogroup", { name: "Device" });
    await expect(devices.getByRole("radio", { name: "Computer" })).toBeChecked();
    await devices.getByRole("radio", { name: "Phone" }).click();
    await expect(page.locator(".cs-Preview-device")).toHaveCSS("width", "375px");
    await devices.getByRole("radio", { name: "Tablet" }).click();
    await expect(page.locator(".cs-Preview-device")).toHaveCSS("width", "768px");
    // Through to the next lesson in the player (a continue block at the end of a lesson opens the
    // next one), then back to editing it.
    await frame.getByRole("button", { name: "Continue" }).click();
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Planting");
    await pane.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Planting" })).toBeFocused();
    await expect(button(page, "Preview")).toBeEnabled();
  });
});

test.describe("block content", () => {
  test("blocks-editor L11, L13, 2.6, W14, UI-ACCESSIBILITY-R35: by keyboard, formatted text takes bold, italic, a link, a list and a heading, kept as clean rich text in one undo step", async ({
    page,
  }) => {
    await openGarden(page);
    const paragraph = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    );
    const text = paragraph.getByRole("textbox", { name: "Text" });
    // From the block's row, Tab passes its drag handle, its type and its tools to the text.
    await paragraph.focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
    await expect(text).toBeFocused();
    // The tools show while the text is in use.
    const tools = paragraph.getByRole("toolbar", { name: "Text formatting" });
    await expect(tools).toBeVisible();
    // A new line, made a bulleted list from the tools: Alt+F10 goes to them, arrows along them.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Tomatoes");
    await page.keyboard.press("Alt+F10");
    await expect(tools.getByRole("button", { name: /^Text style/ })).toBeFocused();
    for (let i = 0; i < 7; i += 1) await page.keyboard.press("ArrowRight");
    await expect(tools.getByRole("button", { name: "Bulleted list" })).toBeFocused();
    await page.keyboard.press("Enter");
    // Focus goes back to the text, where it was.
    await expect(text).toBeFocused();
    await expect(text.locator("ul > li")).toHaveText("Tomatoes");
    await expect(tools.getByRole("button", { name: "Bulleted list" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Out of the list, a line made a heading from the text style menu.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Watering");
    // The tools remember the last one used.
    await page.keyboard.press("Alt+F10");
    await expect(tools.getByRole("button", { name: "Bulleted list" })).toBeFocused();
    for (let i = 0; i < 7; i += 1) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitemradio", { name: "Normal text" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name: "Heading 3" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(text.locator("h3")).toHaveText("Watering");
    await expect(tools.getByRole("button", { name: "Text style: Heading 3" })).toBeVisible();

    // Words of the first line: bold by Ctrl+B, italic from the tools, then a link by Ctrl+K.
    await text.focus();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < "Most vegetables need ".length; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    for (let i = 0; i < "six hours".length; i += 1) await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Control+B");
    await expect(tools.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Alt+F10");
    await expect(tools.getByRole("button", { name: /^Text style/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(tools.getByRole("button", { name: "Italic" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(text).toBeFocused();
    await expect(tools.getByRole("button", { name: "Italic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Only web and mail addresses are taken.
    await page.keyboard.press("Control+K");
    const link = page.getByRole("dialog", { name: "Link" });
    const address = link.getByRole("textbox", { name: "Web or email address" });
    await expect(address).toBeFocused();
    await page.keyboard.type("javascript:alert(1)");
    await page.keyboard.press("Enter");
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await address.fill("https://example.com/water");
    await page.keyboard.press("Enter");
    await expect(link).toHaveCount(0);
    await expect(text).toBeFocused();
    await expect(text.getByRole("link", { name: "six hours" })).toHaveAttribute(
      "href",
      "https://example.com/water",
    );
    // Leaving the text keeps it: one undo step, as clean rich text. Shift+Tab goes to the tools.
    await page.keyboard.press("Shift+Tab");
    await expect(tools.getByRole("button", { name: "Italic" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(tools).toHaveCount(0);
    const html = contentOf(lessonIn(await saved(page), "lessplan01").blocks[1])?.text;
    expect(html).toBe(
      '<p>Most vegetables need <strong><em><a href="https://example.com/water">six hours</a></em></strong> of sun.</p><ul><li>Tomatoes</li></ul><h3>Watering</h3>',
    );
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    await expect(text).toHaveText("Most vegetables need six hours of sun.");
  });

  test("BLK-03: what the browser writes into formatted text, typed or pasted, is kept as clean rich text, and Escape puts back the kept text", async ({
    page,
  }) => {
    await openGarden(page);
    const text = blocksOf(page, "Planning")
      .getByRole("row")
      .nth(1)
      .getByRole("textbox", { name: "Text" });
    await text.click();
    await page.keyboard.press("Control+A");
    // As a paste from a web page or a word processor arrives.
    await page.evaluate(() =>
      document.execCommand(
        "insertHTML",
        false,
        '<div style="color:red" class="x"><b>Bold</b> and <i>slanted</i> <span style="font-size:20px">big</span> <font color="red">old</font> <strike>gone</strike> <a href="javascript:alert(1)">bad</a> <a href="mailto:me@example.com">mail</a><script>alert(1)</script></div><div><br></div>',
      ),
    );
    // The pasted style attributes were refused by the policy, and are gone from the course.
    await page.evaluate(() => {
      const seen = (window as unknown as { policyViolations: string[] }).policyViolations;
      seen.splice(0, seen.length, ...seen.filter((v) => !v.startsWith("style-src-attr")));
    });
    await page.keyboard.press("Tab");
    const html = contentOf(lessonIn(await saved(page), "lessplan01").blocks[1])?.text;
    expect(html).toBe(
      '<p><strong>Bold</strong> and <em>slanted</em> big old <s>gone</s> bad <a href="mailto:me@example.com">mail</a></p>',
    );
    // Escape before leaving puts back the kept text.
    await text.click();
    await page.keyboard.type("junk");
    await page.keyboard.press("Escape");
    await expect(text).not.toContainText("junk");
    await page.keyboard.press("Tab");
    await expect(saveState(page)).toHaveText("Saved");
  });

  test("[rise:3C] blocks-editor W8, UI-BLOCKS-EDITOR-R25: a text block switches to a sibling type keeping its content, and what the new type has no place for comes back", async ({
    page,
  }) => {
    await openGarden(page);
    const row = blocksOf(page, "Planning").getByRole("row").nth(1);
    await row.getByRole("button", { name: /Block type/ }).click();
    await page.getByRole("option", { name: "Paragraph with heading" }).click();
    const title = row.getByRole("textbox", { name: "Heading" });
    await title.click();
    await title.fill("Sun");
    await title.press("Enter");
    await expect(row).toHaveAccessibleName("Paragraph with heading: Sun");
    await row.getByRole("button", { name: /Block type/ }).click();
    await page.getByRole("option", { name: "Heading", exact: true }).click();
    await expect(row.getByRole("textbox", { name: "Text" })).toHaveCount(0);
    let block = lessonIn(await saved(page), "lessplan01").blocks[1];
    expect(block).toMatchObject({ id: "blkpara001", variant: "heading" });
    // The text is kept, out of sight.
    expect(block?.items).toEqual([
      {
        id: "itmpara001",
        kind: "content",
        title: "Sun",
        text: "<p>Most vegetables need six hours of sun.</p>",
      },
    ]);
    await row.getByRole("button", { name: /Block type/ }).click();
    await page.getByRole("option", { name: "Paragraph", exact: true }).click();
    await expect(row.getByRole("textbox", { name: "Text" })).toHaveText(
      "Most vegetables need six hours of sun.",
    );
    block = lessonIn(await saved(page), "lessplan01").blocks[1];
    expect(block?.variant).toBe("paragraph");
  });

  test("blocks-interactions 2.11, 2.12: a knowledge check edits its question and answers, keeping one right answer for single choice; a continue block its own label", async ({
    page,
  }) => {
    await openGarden(page);
    await page.getByRole("button", { name: "All blocks" }).click();
    await page.getByRole("searchbox", { name: "Search block types" }).fill("choice");
    await page.getByRole("option", { name: "Single choice" }).click();
    await expect(announced(page)).toHaveText("Added Single choice: Which answer is right?");
    // Added at the end; its name follows its question.
    const check = blocksOf(page, "Planning").getByRole("row").last();
    const prompt = check.getByRole("textbox", { name: "Question" });
    await expect(prompt).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Which plants like shade?");
    await page.keyboard.press("Tab");
    await expect(check).toHaveAccessibleName("Single choice: Which plants like shade?");
    const second = check.getByRole("textbox", { name: "Answer 2" });
    await second.click();
    await second.fill("Lettuce");
    await second.press("Enter");
    const correct = check.getByRole("checkbox", { name: "Correct" });
    await check.getByText("Correct").nth(1).click();
    await expect(correct.nth(0)).not.toBeChecked();
    await expect(correct.nth(1)).toBeChecked();
    // Single choice needs a right answer: unticking the only one is refused.
    await check.getByText("Correct").nth(1).click();
    await expect(correct.nth(1)).toBeChecked();

    const label = blockRow(page, "Planning", "Continue").getByRole("textbox", {
      name: "Button label",
    });
    await label.click();
    await label.fill("On to planting");
    await label.press("Enter");
    const blocks = lessonIn(await saved(page), "lessplan01").blocks;
    expect(blocks.at(-1)?.question).toMatchObject({
      prompt: "<p>Which plants like shade?</p>",
      answers: [
        { text: "A right answer", correct: false },
        { text: "Lettuce", correct: true },
      ],
    });
    expect(blocks[3]?.variantSettings).toEqual({ buttonLabel: "On to planting" });
    // The preview's continue button carries the label.
    await button(page, "Preview").click();
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    await expect(frame.getByRole("button", { name: "On to planting" })).toBeVisible();
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on the block editing screens in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);
    await openGarden(page, `?theme=${theme}`);
    await check("lesson with blocks");
    const paragraph = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    );
    await paragraph.getByRole("textbox", { name: "Text" }).focus();
    await check("formatting tools");
    await page.keyboard.press("Alt+F10");
    await page.keyboard.press("Enter");
    await check("text style menu");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+K");
    await check("link dialog");
    await page.keyboard.press("Escape");
    await paragraph.getByRole("button", { name: "Style" }).click();
    const style = page.getByRole("dialog", { name: "Style" });
    await style.getByRole("button", { name: /Background/ }).click();
    await check("background list");
    await page.getByRole("option", { name: "Custom colour" }).click();
    await check("style menu, custom colour");
    await page.keyboard.press("Escape");
    await paragraph.getByRole("button", { name: "Format" }).click();
    await page.getByRole("button", { name: "More padding options" }).click();
    await check("format menu");
    await page.keyboard.press("Escape");
    await paragraph.getByRole("button", { name: /^More actions/ }).click();
    await check("block menu");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "All blocks" }).click();
    await check("block library");
    await page.getByRole("dialog", { name: "Block library" }).getByRole("searchbox").fill("zzz");
    await check("block library, nothing found");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    await manage.getByText("Select all").click();
    await check("manage blocks");
    await manage.getByRole("button", { name: "Delete" }).click();
    await check("delete question");
    await manage.getByRole("button", { name: "Delete" }).click();
    await manage.getByRole("button", { name: "Close" }).click();
    await check("empty lesson");
    await button(page, "Preview").click();
    await expect(
      page
        .frameLocator("iframe[title='Course preview']:not([data-pending])")
        .getByRole("heading", { level: 1 }),
    ).toHaveText("Planning");
    await check("preview");
  });
}
