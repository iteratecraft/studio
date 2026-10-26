// Block editing in Chromium against the in-memory host (M2-10, BLK-03): the block library and the
// shortcut bar, moving, duplicating and deleting blocks, copy and paste within and across lessons
// and courses, manage blocks (one background, copies to a lesson or a course), links to blocks and
// lessons, the style and format menus, formatted text and its safety, the block previews, and the
// preview at the lesson, by pointer and by keyboard, with axe on every screen in both themes.
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
  bytesOf,
  card,
  courseIn,
  files,
  heading,
  launch,
  openFixture,
  retitle,
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

/** The course in the newest autosave next to course file `file`, if there is one. */
async function autosaved(page: Page, file = FILE): Promise<Course | undefined> {
  const folder = `.${file}.autosave/`;
  const saves = (await files(page)).filter((name) => name.startsWith(folder));
  const number = (name: string) => Number.parseInt(name.slice(folder.length), 10);
  const newest = saves.sort((a, b) => number(a) - number(b)).at(-1);
  return newest === undefined ? undefined : courseIn(page, newest);
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
    await manage.getByRole("button", { name: "Copy", exact: true }).click();
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
    const color = style.getByRole("textbox", { name: "Colour", exact: true });
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

  test("[rise:3D] blocks-editor L10, W11, 2.4, UI-BLOCKS-EDITOR-R18: by keyboard, the format menu sets padding by preset or exact pixels, linked or not, the content width and the animation", async ({
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

    // 2.4: the width starts at the full text column (the lesson's 760 px column).
    await expect(format.getByRole("button", { name: /Content width/ })).toContainText(
      "Full column",
    );
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
    // By place: the row's name follows its text as it is typed.
    const paragraph = blocksOf(page, "Planning").getByRole("row").nth(1);
    await expect(paragraph).toHaveAccessibleName(
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

  test("blocks-editor 5, 2.6: in formatted text Ctrl/Cmd+Shift+X strikes through and its tool names those keys; Ctrl/Cmd+S saves the course (lead decision)", async ({
    page,
  }) => {
    await openGarden(page);
    const paragraph = blocksOf(page, "Planning").getByRole("row").nth(1);
    const text = paragraph.getByRole("textbox", { name: "Text" });
    const tools = paragraph.getByRole("toolbar", { name: "Text formatting" });
    const strike = tools.getByRole("button", { name: "Strikethrough" });
    await text.click();
    await expect(tools).toBeVisible();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < "Most vegetables need ".length; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    for (let i = 0; i < "six hours".length; i += 1) await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Control+Shift+X");
    await expect(strike).toHaveAttribute("aria-pressed", "true");
    await expect(text).toBeFocused();
    // Ctrl+S in the text saves the course, with the text as it is, and formats nothing.
    const html = contentOf(lessonIn(await saved(page), "lessplan01").blocks[1])?.text;
    expect(html).toBe("<p>Most vegetables need <s>six hours</s> of sun.</p>");
    await expect(text).toBeFocused();
    await expect(strike).toHaveAttribute("aria-pressed", "true");
    // The tool names its keys to screen readers, and in its tooltip on keyboard focus.
    await expect(strike).toHaveAccessibleDescription("Ctrl+Shift+X");
    await page.keyboard.press("Alt+F10");
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
    await expect(strike).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveText("Strikethrough (Ctrl+Shift+X)");
    // Pressing it again from the tools takes the strike off.
    await page.keyboard.press("Enter");
    await expect(text).toBeFocused();
    await expect(strike).toHaveAttribute("aria-pressed", "false");
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

test.describe("copying blocks to a lesson or a course", () => {
  test("blocks-editor W12, W13, L16, UI-BLOCKS-EDITOR-R24, UI-PUBCOLLAB-R31, B8: manage blocks copies the selection to the end of another lesson in one step, and the notice opens that lesson", async ({
    page,
  }) => {
    await openGarden(page);
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    const list = manage.getByRole("grid", { name: "Blocks to select in Planning" });
    // By keyboard: pick the heading, then copy it to Planting.
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).focus();
    await page.keyboard.press("Space");
    await manage.getByRole("button", { name: "Copy to a lesson…" }).click();
    let picker = page.getByRole("dialog", { name: "Copy 1 block to a lesson" });
    const lessons = picker.getByRole("listbox", { name: "Lessons" });
    await expect(lessons.getByRole("option")).toHaveText(["Planning", "Planting"]);
    await expect(lessons.getByRole("option", { name: "Planning" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect(
      page.getByRole("alertdialog", { name: "Copied 1 block to the end of Planting" }),
    ).toBeVisible();
    // Then the paragraph: copies go to the end, after the heading.
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).click();
    await list.getByRole("row", { name: /^Paragraph/ }).click();
    await manage.getByRole("button", { name: "Copy to a lesson…" }).click();
    picker = page.getByRole("dialog", { name: "Copy 1 block to a lesson" });
    await picker.getByRole("option", { name: "Planting" }).click();
    await picker.getByRole("button", { name: "Copy" }).click();
    let course = await saved(page);
    const copied = lessonIn(course, "lessplnt01").blocks;
    expect(kinds(copied)).toEqual(["text/heading", "text/paragraph"]);
    expect(copied.map((block) => block.id)).not.toContain("blkpara001");
    expect(contentOf(copied[1])?.text).toBe("<p>Most vegetables need six hours of sun.</p>");
    expect(kinds(lessonIn(course, "lessplan01").blocks)).toHaveLength(4);
    // Each copy is one undo step.
    await manage.getByRole("button", { name: "Close" }).click();
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    course = await saved(page);
    expect(kinds(lessonIn(course, "lessplnt01").blocks)).toEqual(["text/heading"]);
    await page.keyboard.press("Control+Y");
    // The notice's link opens the lesson the copies went to.
    await page.getByRole("button", { name: "Manage blocks" }).click();
    await list.getByRole("row", { name: "Continue" }).click();
    await manage.getByRole("button", { name: "Copy to a lesson…" }).click();
    await page
      .getByRole("dialog", { name: "Copy 1 block to a lesson" })
      .getByRole("option", { name: "Planting" })
      .dblclick();
    await manage.getByRole("button", { name: "Close" }).click();
    // Copy notices pile up: the newest is the last.
    await page
      .getByRole("alertdialog", { name: "Copied 1 block to the end of Planting" })
      .last()
      .getByRole("button", { name: "Open that lesson" })
      .click();
    await expect(page.getByRole("heading", { level: 2, name: "Planting" })).toBeFocused();
    expect(await rowNames(page, "Planting")).toEqual([
      "Heading: Pick a sunny spot",
      "Paragraph: Most vegetables need six hours of sun.",
      "Continue",
    ]);
  });

  test("blocks-editor W12, W13, B7, B8, UI-PUBCOLLAB-R31, BLK-03: manage blocks copies the selection to the end of another course or microlearning, with its media, and offers to open it", async ({
    page,
  }) => {
    await launch(page);
    const tips: Course = {
      ...herbs(),
      id: "5a0c1e3d-7b2f-4c86-9e14-3d2a6b8f0c71",
      kind: "microlearning",
      title: "Quick tips",
      entries: [{ id: "lesstips01", kind: "lesson", title: "Quick tips", blocks: [] }],
    };
    const pots: Course = {
      ...herbs(),
      entries: [
        { id: "lessherb01", kind: "lesson", title: "Pots", blocks: [] },
        { id: "lessherb02", kind: "lesson", title: "Soil", blocks: [] },
        { id: "secherb001", kind: "section", title: "More" },
      ],
    };
    await openFixture(page, "Quick tips.crs", tips);
    await back(page);
    await openFixture(page, "Herb pots.crs", pots);
    await back(page);
    await openFixture(page, FILE, garden(), { "bed.svg": BED });
    await openLesson(page, "Planning");
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    const list = manage.getByRole("grid", { name: "Blocks to select in Planning" });
    await list.getByRole("row", { name: "Centred image" }).click();
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).click();
    await manage.getByRole("button", { name: "Copy to another course…" }).click();
    const picker = page.getByRole("dialog", { name: "Copy 2 blocks to another course" });
    // Courses and microlearning items, never the open course.
    await expect(
      picker.getByRole("listbox", { name: "Courses and microlearnings" }).getByRole("option"),
    ).toHaveText(["Herb pots", "Quick tips"]);
    await picker.getByRole("option", { name: "Herb pots" }).click();
    await picker.getByRole("button", { name: "Copy" }).click();
    const notice = page.getByRole("alertdialog", {
      name: "Copied 2 blocks to the end of Soil in Herb pots",
    });
    await expect(notice).toBeVisible();
    // The other course's file holds them at the end of its last lesson, in order, with the image.
    const course = await courseIn(page, "Herb pots.crs");
    const blocks = lessonIn(course, "lessherb02").blocks;
    expect(kinds(blocks)).toEqual(["text/heading", "image/centered"]);
    expect(blocks.map((block) => block.id)).not.toContain("blkimage01");
    expect(course.media).toEqual([expect.objectContaining({ key: "bed.svg" })]);
    const zip = await unzip(page, "Herb pots.crs");
    const manifest = JSON.parse(new TextDecoder().decode(await zip.read("project.json")));
    expect(Object.keys(manifest.assets)).toEqual(["bed.svg"]);
    // The open course is unchanged; the notice opens the other course.
    await expect(saveState(page)).toHaveText("Saved");
    await manage.getByRole("button", { name: "Close" }).click();
    await notice.getByRole("button", { name: "Open that course" }).click();
    await expect(heading(page, "Herb pots")).toBeVisible();
    await openLesson(page, "Soil");
    expect(await rowNames(page, "Soil")).toEqual(["Heading: Pick a sunny spot", "Centred image"]);
  });

  test("blocks-editor W12, BLK-01: copying blocks into a course that a crash left autosaved work in asks first, as opening it does", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, "Herb pots.crs", herbs());
    await retitle(page, "Herb pots, unsaved");
    await expect
      .poll(() => files(page), { timeout: 10_000 })
      .toContain(".Herb pots.crs.autosave/2.crs");
    // The app dies without asking anything.
    await page.evaluate(() => window.editorTest.restart());
    const before = await bytesOf(page, "Herb pots.crs");
    await openFixture(page, FILE, garden(), { "bed.svg": BED });
    await openLesson(page, "Planning");
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    await manage.getByText("Select all").click();
    const copy = async () => {
      await manage.getByRole("button", { name: "Copy to another course…" }).click();
      await page
        .getByRole("dialog", { name: "Copy 4 blocks to another course" })
        .getByRole("option", { name: /^Herb pots/ })
        .dblclick();
    };
    await copy();
    const offer = page.getByRole("alertdialog", { name: "Recover unsaved changes?" });
    await expect(offer).toContainText("Herb pots.crs was not closed properly last time.");
    await expect(offer).toContainText("Copying the blocks saves the file");
    // Escape copies nothing, and leaves that course's file and its autosaved work alone.
    await page.keyboard.press("Escape");
    await expect(offer).toHaveCount(0);
    expect(await bytesOf(page, "Herb pots.crs")).toEqual(before);
    expect(await files(page)).toContain(".Herb pots.crs.autosave/2.crs");

    // Recovering copies into the recovered work, which the author chose to keep.
    await copy();
    await offer.getByRole("button", { name: "Use the recovered changes" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "Copied 4 blocks to the end of Pots in Herb pots, unsaved",
      }),
    ).toBeVisible();
    const course = await courseIn(page, "Herb pots.crs");
    expect(course.title).toBe("Herb pots, unsaved");
    expect(kinds(lessonIn(course, "lessherb01").blocks)).toEqual([
      "text/heading",
      "text/paragraph",
      "image/centered",
      "divider/continue",
    ]);
    expect(
      (await files(page)).filter((name) => name.startsWith(".Herb pots.crs.autosave/")),
    ).toEqual([]);
  });

  test("blocks-editor L16, W12, W13, 2.4: manage blocks gives every selected block one background in one undo step", async ({
    page,
  }) => {
    await openGarden(page);
    await page.getByRole("button", { name: "Manage blocks" }).click();
    const manage = page.getByRole("dialog", { name: "Manage blocks" });
    const list = manage.getByRole("grid", { name: "Blocks to select in Planning" });
    await list.getByRole("row", { name: "Heading: Pick a sunny spot" }).click();
    await list.getByRole("row", { name: "Continue" }).click();
    // By keyboard from the tools: Style, the background list, Dark.
    await manage.getByRole("button", { name: "Style" }).focus();
    await page.keyboard.press("Enter");
    const style = page.getByRole("dialog", { name: "Style of the selected blocks" });
    await style.getByRole("button", { name: /Background/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Dark" }).focus();
    await page.keyboard.press("Enter");
    let blocks = lessonIn(await saved(page), "lessplan01").blocks;
    const dark = { background: { kind: "color", color: "#2b3038" } };
    expect(blocks.map((block) => block.settings)).toEqual([dark, undefined, undefined, dark]);
    // A custom colour too, kept with each block's other settings.
    await style.getByRole("button", { name: /Background/ }).click();
    await page.getByRole("option", { name: "Custom colour" }).click();
    const color = style.getByRole("textbox", { name: "Colour", exact: true });
    await color.fill("#123456");
    await color.press("Enter");
    blocks = lessonIn(await saved(page), "lessplan01").blocks;
    const custom = { background: { kind: "color", color: "#123456" } };
    expect(blocks.map((block) => block.settings)).toEqual([custom, undefined, undefined, custom]);
    await page.keyboard.press("Escape");
    await manage.getByRole("button", { name: "Close" }).click();
    await heading(page, "Kitchen garden").click();
    await page.keyboard.press("Control+Z");
    blocks = lessonIn(await saved(page), "lessplan01").blocks;
    const first = { background: { kind: "color", color: "#2f6f9f" } };
    expect(blocks.map((block) => block.settings)).toEqual([first, undefined, undefined, first]);
  });
});

test.describe("links to blocks and lessons", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("blocks-editor L6, W12, 2.4: copy link to block puts the block's address on the clipboard; as a text link, the player shows that block", async ({
    page,
  }) => {
    await openGarden(page);
    await more(page, blockRow(page, "Planning", "Continue"), "Copy link to block");
    await expect(
      page.getByRole("alertdialog", { name: /^Copied a link to Continue\./ }),
    ).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe("#/lessons/lessplan01/blkcont001");
    // Pasted as the address of a link in the paragraph.
    const text = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    ).getByRole("textbox", { name: "Text" });
    await text.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Link" });
    await dialog.getByRole("textbox", { name: "Web or email address" }).fill(link);
    await dialog.getByRole("button", { name: "Add link" }).click();
    await expect(text.getByRole("link")).toHaveAttribute("href", link);
    await page.keyboard.press("Tab");
    const html = contentOf(lessonIn(await saved(page), "lessplan01").blocks[1])?.text;
    expect(html).toBe(
      '<p><a href="#/lessons/lessplan01/blkcont001">Most vegetables need six hours of sun.</a></p>',
    );
    // In the player the link stays in the course and shows the block.
    await button(page, "Preview").click();
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    const shown = frame.getByRole("link", { name: "Most vegetables need six hours of sun." });
    await expect(shown).not.toHaveAttribute("target");
    await shown.click();
    await expect(frame.locator('[data-block="blkcont001"]')).toBeFocused();
  });

  test("blocks-editor L13, W14, UI-BLOCKS-EDITOR-R33: by keyboard, the link dialog finds a lesson by its title and links text to it; the player opens it in place", async ({
    page,
  }) => {
    await openGarden(page);
    const text = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    ).getByRole("textbox", { name: "Text" });
    await text.click();
    await page.keyboard.press("Control+End");
    for (let i = 0; i < "sun.".length; i += 1) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Link" });
    await expect(dialog.getByRole("textbox", { name: "Web or email address" })).toBeFocused();
    await page.keyboard.press("Tab");
    const find = dialog.getByRole("searchbox", { name: "Find a lesson" });
    await expect(find).toBeFocused();
    const lessons = dialog.getByRole("listbox", { name: "Lessons" });
    await expect(lessons.getByRole("option")).toHaveText(["Planning", "Planting"]);
    await page.keyboard.type("plant");
    // Enter in the search does not submit the empty address.
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(lessons.getByRole("option")).toHaveText(["Planting"]);
    await page.keyboard.type("zz");
    await expect(lessons).toHaveText("No lesson matches");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Tab");
    await expect(lessons.getByRole("option", { name: "Planting" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(text.getByRole("link", { name: "sun." })).toHaveAttribute(
      "href",
      "#/lessons/lessplnt01",
    );
    await page.keyboard.press("Tab");
    const html = contentOf(lessonIn(await saved(page), "lessplan01").blocks[1])?.text;
    expect(html).toBe(
      '<p>Most vegetables need six hours of <a href="#/lessons/lessplnt01">sun.</a></p>',
    );
    await button(page, "Preview").click();
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    await frame.getByRole("link", { name: "sun." }).click();
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Planting");
  });
});

test.describe("block previews and appearance", () => {
  test("BLK-03: each block shows beside its fields as the real player draws it, again after every edit, with its media and out of the way of keyboard and screen readers", async ({
    page,
  }) => {
    await openGarden(page);
    const row = blockRow(page, "Planning", "Heading: Pick a sunny spot");
    const preview = row.locator(".be-block-preview");
    await expect(preview).toHaveAttribute("inert");
    // The player's own markup and style sheet: its heading class and size.
    const drawn = preview.locator("[data-block='blkhead001'] h2.block-heading");
    await expect(drawn).toHaveText("Pick a sunny spot");
    await expect(drawn).toHaveCSS("font-size", "32px");
    const title = row.getByRole("textbox", { name: "Heading" });
    await title.fill("Find the sun");
    await title.press("Enter");
    await expect(
      blockRow(page, "Planning", "Heading: Find the sun").locator(".be-block-preview h2"),
    ).toHaveText("Find the sun");
    // The image from the course file, as an in-memory address.
    const image = blockRow(page, "Planning", "Centred image").locator(".be-block-preview img");
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      blockRow(page, "Planning", "Continue").locator(".be-block-preview button"),
    ).toHaveText("Continue");
    // A paragraph with no text shows nothing to learners, and says so.
    const text = blockRow(
      page,
      "Planning",
      "Paragraph: Most vegetables need six hours of sun.",
    ).getByRole("textbox", { name: "Text" });
    await text.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Tab");
    await expect(blocksOf(page, "Planning").getByRole("row").nth(1)).toContainText(
      "Learners see nothing of this block yet.",
    );
  });

  test("[rise:3D] blocks-editor L9, W10, 2.4, BLK-03: cards stay white on a block colour unless turned off, and a block's accent colour is kept only when readable", async ({
    page,
  }) => {
    await openGarden(page);
    await page.getByRole("button", { name: "All blocks" }).click();
    await page.getByRole("searchbox", { name: "Search block types" }).fill("single");
    await page.getByRole("option", { name: "Single choice" }).click();
    const check = blocksOf(page, "Planning").getByRole("row").last();
    // The library has closed and focus is in the new block: a click before that is lost.
    await expect(check.getByRole("textbox", { name: "Question" })).toBeFocused();
    await check.getByRole("button", { name: "Style", exact: true }).click();
    const style = page.getByRole("dialog", { name: "Style" });
    await expect(style).toBeVisible();
    await style.getByRole("button", { name: /Background/ }).click();
    await page.getByRole("option", { name: "Dark" }).click();
    const cards = style.getByRole("switch", { name: "Keep cards white" });
    await expect(cards).toBeChecked();
    const card = check.locator(".be-block-preview form.check");
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(card.locator(".prompt")).toHaveCSS("color", "rgb(29, 31, 35)");
    // The background list has gone; a click on the switch's label turns it off.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await style.getByText("Keep cards white").click();
    await expect(cards).not.toBeChecked();
    await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    let block = lessonIn(await saved(page), "lessplan01").blocks.at(-1);
    expect(block?.settings).toEqual({
      background: { kind: "color", color: "#2b3038" },
      cardStyle: "transparent",
    });
    // An accent colour that is hard to read on the block's surface is refused.
    const accent = style.getByRole("textbox", { name: "Accent colour" });
    await accent.fill("#1f3a5f");
    await accent.press("Enter");
    await expect(accent).toHaveAttribute("aria-invalid", "true");
    await expect(style).toContainText("Hard to read on this block's background");
    await accent.fill("#ffd166");
    await accent.press("Enter");
    await expect(accent).not.toHaveAttribute("aria-invalid");
    const drawn = check.locator(".be-block-preview [data-block]");
    await expect
      .poll(() =>
        drawn.evaluate((element) => getComputedStyle(element).getPropertyValue("--accent")),
      )
      .toBe("#ffd166");
    block = lessonIn(await saved(page), "lessplan01").blocks.at(-1);
    expect(block?.settings).toMatchObject({ accentColor: "#ffd166" });
    // The real player shows it on the button, with dark text on it.
    await page.keyboard.press("Escape");
    await button(page, "Preview").click();
    const frame = page.frameLocator("iframe[title='Course preview']:not([data-pending])");
    // The check comes after the lesson's continue block.
    await frame.getByRole("button", { name: "Continue" }).click();
    const submit = frame.locator(`[data-block="${block?.id}"]`).getByRole("button", {
      name: "Check",
    });
    await expect(submit).toHaveCSS("background-color", "rgb(255, 209, 102)");
    await expect(submit).toHaveCSS("color", "rgb(0, 0, 0)");
  });

  test("[rise:3D] BLK-03, blocks-interactions GI-O5: in a microlearning a block can show in one step with the next; the last block cannot, and a course has no such setting", async ({
    page,
  }) => {
    await launch(page);
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "Blank microlearning" }).click();
    const dialog = page.getByRole("dialog", { name: "New microlearning" });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Steps");
    await dialog.getByRole("button", { name: "Create" }).click();
    const bar = page.getByRole("toolbar", { name: "Add a block at the end" });
    await bar.getByRole("button", { name: "Paragraph with heading" }).click();
    await bar.getByRole("button", { name: "Continue" }).click();
    const rows = blocksOf(page, "Steps").getByRole("row");
    await rows.last().getByRole("button", { name: "Format" }).click();
    let format = page.getByRole("dialog", { name: "Format" });
    await expect(
      format.getByRole("switch", { name: "Show with the next block in one step" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await rows.first().getByRole("button", { name: "Format" }).click();
    format = page.getByRole("dialog", { name: "Format" });
    const connect = format.getByRole("switch", { name: "Show with the next block in one step" });
    await expect(connect).toHaveAccessibleDescription("For a microlearning that moves in steps.");
    await connect.focus();
    await page.keyboard.press("Space");
    const course = await saved(page, "Steps.crs");
    expect((course.entries[0] as LessonEntry).blocks[0]?.settings).toEqual({ connectToNext: true });
    await page.keyboard.press("Escape");
    await back(page);
    await openFixture(page, FILE, garden(), { "bed.svg": BED });
    await openLesson(page, "Planning");
    await blockRow(page, "Planning", "Continue").getByRole("button", { name: "Format" }).click();
    await expect(page.getByRole("dialog", { name: "Format" })).toBeVisible();
    await expect(page.getByRole("switch", { name: /next block/ })).toHaveCount(0);
  });
});

test.describe("rich text safety and descriptions", () => {
  test("BLK-03: formatted text from a course file is cleaned before it enters the editor page, so a meta refresh or other markup in it does nothing", async ({
    page,
  }) => {
    const hostile =
      '<p>Hi <a href="javascript:alert(1)">there</a></p><meta http-equiv="refresh" content="0;url=/index.html#hijacked"><base href="https://example.com/"><img src="x" alt="x"><style>p{color:red}</style><form action="https://example.com"><input name="a"></form><svg><a href="https://example.com/s">svg</a></svg><iframe src="https://example.com"></iframe>';
    const course = garden();
    course.description = hostile;
    const lesson = course.entries[0] as LessonEntry;
    lesson.description = hostile;
    (lesson.blocks[1]?.items?.[0] as ContentItem).text = hostile;
    await launch(page);
    await page.evaluate(() => Object.assign(window, { stillHere: true }));
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await openFixture(page, FILE, course, { "bed.svg": BED });
    const description = page.getByRole("textbox", { name: "Description" });
    await expect(description).toHaveText("Hi theresvg");
    await openLesson(page, "Planning");
    const fields = [
      page.getByRole("textbox", { name: "Description" }),
      blocksOf(page, "Planning").getByRole("row").nth(1).getByRole("textbox", { name: "Text" }),
    ];
    for (const field of fields) {
      await expect(field).toHaveText("Hi theresvg");
      expect(await field.evaluate((element) => element.innerHTML)).toBe(
        "<p>Hi there</p><p>svg</p>",
      );
    }
    // Still the same page: nothing navigated it, loaded from elsewhere or changed its base.
    expect(
      await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere),
    ).toBe(true);
    expect(navigations).toEqual([]);
    expect(await page.evaluate(() => document.baseURI)).toBe(page.url());
    await expect(page.locator("meta[http-equiv=refresh], base, iframe, form")).toHaveCount(0);
    // The course file is left as it was until the author edits the text.
    await expect(saveState(page)).toHaveText("Saved");
  });

  test("UI-BLOCKS-EDITOR-R13, BLK-01: formatted text is kept while typing: autosaved after a pause, as one undo step, and closing the window asks to save it", async ({
    page,
  }) => {
    await openGarden(page);
    // By place: the row's name follows its text as it is typed.
    const text = blocksOf(page, "Planning")
      .getByRole("row")
      .nth(1)
      .getByRole("textbox", { name: "Text" });
    await text.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Water");
    // A pause in typing hands the text to the course; the field keeps focus.
    await expect(saveState(page)).toHaveText("Unsaved changes");
    await expect(text).toBeFocused();
    await page.keyboard.type(" daily");
    // BLK-01: a crash loses at most 10 seconds of typing.
    await expect
      .poll(
        async () =>
          contentOf(lessonIn((await autosaved(page)) ?? garden(), "lessplan01").blocks[1])?.text,
        {
          timeout: 10_000,
        },
      )
      .toBe("<p>Most vegetables need six hours of sun. Water daily</p>");
    await expect(text).toBeFocused();

    // Closing the window while the field is still being typed in asks first.
    await page.keyboard.type("!");
    const closing = page.evaluate(() => window.editorTest.host.requestClose());
    const guard = page.getByRole("alertdialog", { name: "Save changes to Kitchen garden?" });
    await guard.getByRole("button", { name: "Cancel" }).click();
    expect(await closing).toBe(false);
    await expect(text).toHaveText("Most vegetables need six hours of sun. Water daily!");
    // Everything typed in the one visit to the field is one undo step.
    await button(page, "Undo").click();
    await expect(text).toHaveText("Most vegetables need six hours of sun.");
    await expect(button(page, "Undo")).toBeDisabled();
    // Save, when closing straight after typing, keeps what was typed.
    await text.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Mulch.");
    const leaving = page.evaluate(() => window.editorTest.host.requestClose());
    await guard.getByRole("button", { name: "Save", exact: true }).click();
    expect(await leaving).toBe(true);
    const course = await courseIn(page, FILE);
    expect(contentOf(lessonIn(course, "lessplan01").blocks[1])?.text).toBe(
      "<p>Most vegetables need six hours of sun. Mulch.</p>",
    );
  });

  test("blocks-editor 2.2, BLK-01, BLK-02: the course and lesson descriptions are formatted text, edited without losing their formatting", async ({
    page,
  }) => {
    const rich = "<p><strong>Bold</strong> start</p><ul><li>One</li></ul>";
    const course = garden();
    course.description = rich;
    (course.entries[0] as LessonEntry).description = rich;
    await launch(page);
    await openFixture(page, FILE, course, { "bed.svg": BED });
    for (const place of ["course", "lesson"] as const) {
      if (place === "lesson") await openLesson(page, "Planning");
      const description = page.getByRole("textbox", { name: "Description" });
      await expect(description.locator("strong")).toHaveText("Bold");
      await expect(description.locator("ul > li")).toHaveText("One");
      await description.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type(" end");
      // Formatting from its tools, too.
      await page.keyboard.press("Shift+Home");
      await page.keyboard.press("Control+I");
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Control+S");
    await expect(saveState(page)).toHaveText("Saved");
    const kept = await courseIn(page, FILE);
    const expected = "<p><strong>Bold</strong> start</p><ul><li><em>One end</em></li></ul>";
    expect(kept.description).toBe(expected);
    expect((kept.entries[0] as LessonEntry).description).toBe(expected);
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
    await manage.getByRole("button", { name: "Style" }).click();
    await check("manage blocks, one background");
    await page.keyboard.press("Escape");
    await manage.getByRole("button", { name: "Copy to a lesson…" }).click();
    await check("copy to a lesson");
    await page.keyboard.press("Escape");
    await manage.getByRole("button", { name: "Copy to another course…" }).click();
    await check("copy to another course, none there");
    await page.keyboard.press("Escape");
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
