// Interactive blocks in the blocks editor (M2-14, BLK-06; rise.md 3C; blocks-interactions.md A3,
// A4, A6, A7, 2.2 to 2.10, W1 to W3, W6, W8), in Chromium against the in-memory host: every
// type inserts from the library with sample content, its items are edited in place, added, moved,
// hidden and removed, siblings switch keeping content, a labeled graphic's markers are placed by
// pointer and by keyboard, buttons get a lesson, a web address or exit as destination, and the real
// player shows them in the preview; by keyboard and by pointer, with axe on every new screen in
// both themes.
import type {
  Block,
  ButtonItem,
  ContentItem,
  Course,
  FlashcardItem,
  LessonEntry,
  MarkerItem,
  StepItem,
} from "@course-suite/format";
import { interactiveBlocksCourse } from "@course-suite/format/test/courses";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { button, courseIn, heading, launch, openFixture, status } from "./helpers.ts";

const FILE = "Bicycle.crs";
const PICTURE = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="${fill}"/></svg>`;
const ASSETS = { "bike.svg": PICTURE("#dfead8"), "wheel.svg": PICTURE("#c9d8e8") };

/** The fixture with an empty lesson to insert into. */
function bicycle(): Course {
  const course = interactiveBlocksCourse();
  course.entries.push({ id: "lessempty1", kind: "lesson", title: "Empty", blocks: [] });
  return course;
}

/** The interactive types this task brings, in the library's order. */
const TYPES = [
  "Accordion",
  "Tabs",
  "Labelled image",
  "Process",
  "Flashcard grid",
  "Flashcard stack",
  "Button",
  "Button stack",
];

const blocksOf = (page: Page, lesson: string) =>
  page.getByRole("grid", { name: `Blocks of ${lesson}` });
const row = (page: Page, lesson: string, name: RegExp) =>
  blocksOf(page, lesson).getByRole("row", { name });
const announced = (page: Page) => page.locator(".be-blocks > [aria-live]");
const lessonIn = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
const blockIn = (course: Course, id: string) =>
  course.entries
    .flatMap((entry) => (entry.kind === "lesson" ? entry.blocks : []))
    .find((block) => block.id === id) as Block;
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, FILE);
}

async function openLesson(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeFocused();
}

async function openBicycle(page: Page, lesson = "Empty", query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, bicycle(), ASSETS);
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

async function insertByPointer(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).click();
  const library = page.getByRole("dialog", { name: "Block library" });
  await library.getByRole("searchbox", { name: "Search block types" }).fill(name);
  await library.getByRole("option", { name, exact: true }).click();
  await expect(library).toHaveCount(0);
}

async function closeFormat(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Format" })).toHaveCount(0);
}

/** Tabs from where focus is until `target` has it. */
async function tabTo(page: Page, target: ReturnType<Page["locator"]>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
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

test("[rise:3C] blocks-interactions A3, A4, BLK-06: the library offers every interactive block of this task, and the shortcut bar the labelled image, the process and flashcards", async ({
  page,
}) => {
  await openBicycle(page);
  await page.getByRole("button", { name: "All blocks" }).click();
  const library = page.getByRole("dialog", { name: "Block library" });
  for (const name of TYPES) {
    await expect(library.getByRole("option", { name, exact: true }), name).not.toHaveAttribute(
      "aria-disabled",
    );
  }
  // Brought by later epics.
  for (const name of ["Scenario", "Sorting activity", "Timeline", "Slides project"]) {
    await expect(library.getByRole("option", { name, exact: true }), name).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
  await page.keyboard.press("Escape");
  const bar = page.getByRole("toolbar", { name: "Add a block at the end" });
  await bar.getByRole("button", { name: "Labelled image" }).click();
  await bar.getByRole("button", { name: "Process" }).focus();
  await page.keyboard.press("Enter");
  await bar.getByRole("button", { name: "Flashcard grid" }).click();
  const blocks = lessonIn(await saved(page), "lessempty1").blocks;
  expect(blocks.map((block) => block.variant)).toEqual([
    "labeled-graphic",
    "process",
    "flashcard-grid",
  ]);
});

test("[rise:3C] blocks-editor W7, blocks-interactions W1 to W3, W6, W8, BLK-06: by keyboard each interactive type inserts with sample content", async ({
  page,
}) => {
  await openBicycle(page);
  for (const [search, name] of [
    ["accordion", "Accordion"],
    ["tabs", "Tabs"],
    ["labelled", "Labelled image"],
    ["process", "Process"],
    ["flashcard grid", "Flashcard grid"],
    ["flashcard stack", "Flashcard stack"],
    ["button", "Button"],
    ["button stack", "Button stack"],
  ] as const) {
    await insertByKeyboard(page, search, name);
    await expect(announced(page)).toContainText(`Added ${name}`);
  }
  const blocks = lessonIn(await saved(page), "lessempty1").blocks;
  expect(blocks.map((block) => `${block.category}/${block.variant}`)).toEqual([
    "interactive/accordion",
    "interactive/tabs",
    "interactive/labeled-graphic",
    "interactive/process",
    "interactive/flashcard-grid",
    "interactive/flashcard-stack",
    "interactive/button",
    "interactive/button-stack",
  ]);
  expect(blocks[0]?.items).toHaveLength(3);
  expect(blocks[0]?.items?.[0]).toMatchObject({
    kind: "content",
    title: "A section title",
    text: "<p>What learners read when they open this section.</p>",
  });
  expect(blocks[3]?.items?.map((item) => (item as StepItem).role)).toEqual([
    "intro",
    "step",
    "step",
    "step",
    "summary",
  ]);
  expect(blocks[6]?.items).toEqual([
    expect.objectContaining({ kind: "button", label: "Learn more" }),
  ]);
  // A new labelled image waits for its picture.
  await expect(
    row(page, "Empty", /^Labelled image/).getByText(
      "Choose the picture first: the markers sit on it.",
    ),
  ).toBeVisible();
});

test("[rise:3C] blocks-interactions W1, A6, A7, UI-BLOCKS-EDITOR-R25: sections are edited in place, added, moved and removed, each one undo step, and an accordion switches to tabs keeping them", async ({
  page,
}) => {
  await openBicycle(page);
  await insertByPointer(page, "Accordion");
  const block = row(page, "Empty", /^Accordion/);
  const third = block.getByRole("group", { name: "Section 3" });
  await third.getByRole("textbox", { name: "Title" }).fill("Lights");
  await third.getByRole("textbox", { name: "Title" }).press("Enter");
  await block.getByRole("button", { name: "Move Section 3 up" }).click();
  await block.getByRole("button", { name: "Remove Section 1" }).click();
  await block.getByRole("button", { name: "Add Section 3" }).click();
  let course = await saved(page);
  const accordion = lessonIn(course, "lessempty1").blocks[0] as Block;
  expect(accordion.items?.map((item) => (item as ContentItem).title)).toEqual([
    "Lights",
    "A section title",
    "A section title",
  ]);
  // The block as learners see it: the real player's accordion.
  await expect(block.locator(".be-block-preview .accordion-button")).toHaveCount(3);
  await expect(block.locator(".be-block-preview .accordion-button").first()).toHaveText("Lights");
  // Undo takes back the added section only.
  await heading(page, "Looking after a bicycle").click();
  await page.keyboard.press("Control+Z");
  await expect(block.getByRole("group", { name: /^Section \d$/ })).toHaveCount(2);
  // The variant switcher offers the sibling only, and keeps the sections.
  await block.getByRole("button", { name: /Block type/ }).click();
  await expect(page.getByRole("option")).toHaveText(["Accordion", "Tabs"]);
  await page.getByRole("option", { name: "Tabs" }).click();
  const tabs = row(page, "Empty", /^Tabs/);
  await expect(tabs.locator(".be-block-preview [role=tab]")).toHaveText([
    "Lights",
    "A section title",
  ]);
  course = await saved(page);
  expect(lessonIn(course, "lessempty1").blocks[0]).toMatchObject({ variant: "tabs" });
  expect(lessonIn(course, "lessempty1").blocks[0]?.items).toHaveLength(2);
  // Format: one section at a time is the accordion's own.
  await tabs.getByRole("button", { name: /Block type/ }).click();
  await page.getByRole("option", { name: "Accordion" }).click();
  await row(page, "Empty", /^Accordion/)
    .getByRole("button", { name: "Format", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Format" })
    .getByText("Open one section at a time")
    .click();
  await closeFormat(page);
  course = await saved(page);
  expect(lessonIn(course, "lessempty1").blocks[0]?.variantSettings).toEqual({ oneAtATime: true });
});

test("[rise:3C] BLK-06, blocks-interactions W2, 2.4: by pointer, a click on the picture adds a marker there and a drag moves it", async ({
  page,
}) => {
  await openBicycle(page, "Pictures and steps");
  const block = row(page, "Pictures and steps", /^Labelled image/);
  const canvas = block.locator(".be-marker-canvas");
  await expect(canvas.locator("img")).toHaveJSProperty("complete", true);
  await expect(canvas.getByRole("button")).toHaveCount(3);
  // The pointer works on the screen: the picture comes into view first, and stays there.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.locator("img").boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.2);
  await expect(canvas.getByRole("button")).toHaveCount(4);
  await expect(block.getByRole("group", { name: "Marker 4" })).toBeVisible();
  // Drag the first marker to three quarters across, half way down.
  const first = canvas.getByRole("button", { name: /^Marker 1 at/ });
  const start = (await first.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  const markers = blockIn(await saved(page), "ialabeled1").items as MarkerItem[];
  expect(markers).toHaveLength(4);
  expect(markers[0]?.x).toBeCloseTo(75, 0);
  expect(markers[0]?.y).toBeCloseTo(50, 0);
  expect(markers[3]?.x).toBeCloseTo(25, 0);
  expect(markers[3]?.y).toBeCloseTo(20, 0);
  // The player's preview puts it at the same point of the picture.
  const shown = block.locator(".be-block-preview .marker").first();
  await expect(shown).toHaveCSS("left", /px$/);
  expect(await shown.evaluate((marker) => marker.style.left)).toBe(`${markers[0]?.x}%`);
});

test("[rise:3C] BLK-06, blocks-interactions W2, 2.4: by keyboard, a marker is added in the middle and moved with the arrow keys, and its title, icon and colour are set", async ({
  page,
}) => {
  await openBicycle(page, "Pictures and steps");
  const block = row(page, "Pictures and steps", /^Labelled image/);
  const add = block.getByRole("button", { name: "Add a marker in the middle" });
  await add.focus();
  await page.keyboard.press("Enter");
  const canvas = block.locator(".be-marker-canvas");
  const fourth = canvas.getByRole("button", { name: /^Marker 4 at/ });
  await expect(fourth).toHaveAccessibleName("Marker 4 at 50% across, 50% down");
  await fourth.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(fourth).toHaveAccessibleName("Marker 4 at 52% across, 40% down");
  await expect(block.locator("[aria-live]").filter({ hasText: "Marker 4 at 52%" })).toHaveCount(1);
  const group = block.getByRole("group", { name: "Marker 4" });
  await tabTo(page, group.getByRole("textbox", { name: "Title" }));
  await page.keyboard.type("Pedal");
  await page.keyboard.press("Enter");
  const icon = group.getByRole("button", { name: /Marker shows/ });
  await icon.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Question mark" }).focus();
  await page.keyboard.press("Enter");
  await expect(icon).toContainText("Question mark");
  // Format: the marker colour.
  await block.getByRole("button", { name: "Format", exact: true }).focus();
  await page.keyboard.press("Enter");
  const colour = page.getByRole("dialog", { name: "Format" }).getByRole("textbox", {
    name: "Marker colour",
  });
  await colour.focus();
  await page.keyboard.type("#1b2a49");
  await page.keyboard.press("Enter");
  await closeFormat(page);
  const course = await saved(page);
  const graphic = blockIn(course, "ialabeled1");
  expect(graphic.variantSettings).toEqual({ audioPosition: "top", markerColor: "#1b2a49" });
  expect(graphic.items?.[3]).toMatchObject({ x: 52, y: 40, title: "Pedal", icon: "question" });
  await expect(block.locator(".be-block-preview .marker").nth(3)).toHaveCSS(
    "background-color",
    "rgb(27, 42, 73)",
  );
});

test("[rise:3C] UI-BLOCKS-R7, blocks-interactions W3, 2.5: a process step is hidden, a step is added before the summary, and the step word is changed", async ({
  page,
}) => {
  await openBicycle(page, "Pictures and steps");
  const block = row(page, "Pictures and steps", /^Process/);
  await expect(block.getByRole("group", { name: "Introduction" })).toBeVisible();
  await expect(block.getByRole("group", { name: "Summary" })).toBeVisible();
  const second = block.getByRole("group", { name: "Step 2" });
  const hide = second.getByRole("switch", { name: "Hidden from learners" });
  // Inside a block's row, keyboard users reach the fields with Tab.
  await second.getByRole("textbox", { name: "Title" }).click();
  await page.keyboard.press("Shift+Tab");
  await tabTo(page, hide);
  await page.keyboard.press("Space");
  await expect(hide).toBeChecked();
  await block.getByRole("button", { name: "Add Step 5" }).click();
  await block.getByRole("button", { name: "Format", exact: true }).click();
  const word = page.getByRole("dialog", { name: "Format" }).getByRole("textbox", {
    name: "Word before the number",
  });
  await word.fill("Stage");
  await word.press("Enter");
  await closeFormat(page);
  const course = await saved(page);
  const process = blockIn(course, "iaprocess1");
  expect(process.variantSettings).toEqual({ stepWord: "Stage" });
  expect(
    process.items?.map((item) => [(item as StepItem).role, (item as StepItem).hidden]),
  ).toEqual([
    ["intro", undefined],
    ["step", undefined],
    ["step", true],
    ["step", true],
    ["step", undefined],
    ["step", undefined],
    ["summary", undefined],
  ]);
  // The preview leaves the hidden steps out.
  await expect(block.locator(".be-block-preview .process-strip-button")).toHaveCount(5);
});

test("[rise:3C] blocks-interactions W6, 2.8, A6: a card's sides are edited, a card added, the grid switches to a stack, and the flip hint goes", async ({
  page,
}) => {
  await openBicycle(page, "Cards and buttons");
  const block = row(page, "Cards and buttons", /^Flashcard grid/);
  const card = block.getByRole("group", { name: "Card 2" });
  const back = card.getByRole("textbox", { name: "Back" });
  await back.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("It moves the chain.");
  await card.getByRole("textbox", { name: "Front" }).click();
  await block.getByRole("button", { name: "Add Card 5" }).click();
  await block.getByRole("button", { name: /Block type/ }).click();
  await expect(page.getByRole("option")).toHaveText(["Flashcard grid", "Flashcard stack"]);
  await page.getByRole("option", { name: "Flashcard stack" }).click();
  const stack = row(page, "Cards and buttons", /^Flashcard stack/).first();
  await stack.getByRole("button", { name: "Format", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Format" })
    .getByText("Show a hint to turn the cards over")
    .click();
  await closeFormat(page);
  const course = await saved(page);
  const cards = blockIn(course, "iacardgrid");
  expect(cards.variant).toBe("flashcard-stack");
  expect(cards.variantSettings).toEqual({ flipHint: false });
  expect(cards.items).toHaveLength(5);
  expect(cards.items?.[1]).toMatchObject({ back: { text: "<p>It moves the chain.</p>" } });
});

test("[rise:3C] blocks-interactions W8, 2.10, UI-BLOCKS-R18: a button goes to a lesson chosen from the list, a web address checked as typed, or exit; a stack adds a button", async ({
  page,
}) => {
  await openBicycle(page, "Cards and buttons");
  const single = row(page, "Cards and buttons", /^Button$/);
  const goes = single.getByRole("button", { name: /Goes to/ });
  await expect(goes).toContainText("Another lesson");
  const lesson = single.getByRole("button", { name: /\bLesson\b/ });
  // Inside a block's row, keyboard users reach the fields with Tab.
  await single.getByRole("textbox", { name: "Label" }).click();
  await tabTo(page, lesson);
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Pictures and steps" }).focus();
  await page.keyboard.press("Enter");
  await expect(lesson).toContainText("Pictures and steps");
  // A web address: refused until it is one.
  await goes.click();
  await page.getByRole("option", { name: "A web address" }).click();
  const address = single.getByRole("textbox", { name: "Web address" });
  await tabTo(page, address);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("javascript:alert(1)");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("https://example.org/tyres");
  await page.keyboard.press("Enter");
  await expect(address).not.toHaveAttribute("aria-invalid");
  await expect(single.locator(".be-block-preview a.block-button")).toHaveAttribute(
    "href",
    "https://example.org/tyres",
  );
  // A label cannot be empty.
  const label = single.getByRole("textbox", { name: "Label" });
  await label.fill("");
  await expect(label).toHaveAttribute("aria-invalid", "true");
  await label.fill("Tyre guide");
  await label.press("Enter");
  // A stack: a third button that exits the course.
  const stack = row(page, "Cards and buttons", /^Button stack/);
  await stack.getByRole("button", { name: "Add Button 6" }).click();
  const fourth = stack.getByRole("group", { name: "Button 6" });
  await fourth.getByRole("button", { name: /Goes to/ }).click();
  await page.getByRole("option", { name: "Exit the course" }).click();
  await expect(fourth.getByText("Ends the course")).toBeVisible();
  const course = await saved(page);
  expect(blockIn(course, "iabutton01").items?.[0] as ButtonItem).toMatchObject({
    label: "Tyre guide",
    destination: { kind: "url", url: "https://example.org/tyres" },
  });
  const buttons = blockIn(course, "iabuttons1").items as ButtonItem[];
  expect(buttons[5]?.destination).toEqual({
    kind: "exit",
  });
});

/** Puts a file on the in-memory disk, for the open dialog to pick next. */
async function putFile(page: Page, id: string, bytes: Uint8Array | string): Promise<void> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  await page.evaluate(
    ([id, data]) => {
      window.editorTest.host.disk.set(id as string, new Uint8Array(data as number[]));
      window.editorTest.open = [id as string];
    },
    [id, Array.from(data)] as const,
  );
}

/** The start of a web-ready MP4 (H.264 and AAC tracks), enough for the media intake's check. */
function mp4(): Uint8Array {
  const box = (type: string, ...body: Uint8Array[]) => {
    const size = 8 + body.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    new DataView(out.buffer).setUint32(0, size);
    out.set(new TextEncoder().encode(type), 4);
    let at = 8;
    for (const part of body) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  };
  const count = new Uint8Array(8);
  new DataView(count.buffer).setUint32(4, 1);
  const traks = ["avc1", "mp4a"].map((codec) =>
    box(
      "trak",
      box("mdia", box("minf", box("stbl", box("stsd", count, box(codec, new Uint8Array(8)))))),
    ),
  );
  return new Uint8Array([
    ...box("ftyp", new TextEncoder().encode("isom")),
    ...box("moov", ...traks),
  ]);
}

/** An MP3 as the intake knows one: its ID3 header. */
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]);
const CAPTIONS = "WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nThe wheel spins.\n";

/**
 * Moves keyboard focus onto block row `target` of lesson `lesson` the way a keyboard user does: into
 * the list of blocks, then down the rows with the arrow keys. Tab then reaches the row's fields.
 */
async function toRow(page: Page, lesson: string, target: Locator): Promise<void> {
  await blocksOf(page, lesson).getByRole("row").first().focus();
  for (let i = 0; i < 10 && !(await target.evaluate((r) => r === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(target).toBeFocused();
}

/** Picks option `name` of the select `select` by keyboard. */
async function choose(page: Page, select: Locator, name: string): Promise<void> {
  await select.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("option", { name, exact: true });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(select).toContainText(name);
}

test("[rise:3C] blocks-interactions 2.1 to 2.3, A10, A11, W1: by keyboard, sections get a video with captions, a web embed and audio, and the audio player goes above the text", async ({
  page,
}) => {
  await openBicycle(page);
  await insertByKeyboard(page, "accordion", "Accordion");
  const block = row(page, "Empty", /^Accordion/);
  // Section 1: a video, and a caption file for it.
  const first = block
    .getByRole("group", { name: "Section 1", exact: true })
    .getByRole("group", { name: "Media and audio" });
  await choose(page, first.getByRole("button", { name: /Shows/ }), "A video");
  await putFile(page, "clips/wheel.mp4", mp4());
  await first.getByRole("button", { name: "Choose a video" }).focus();
  await page.keyboard.press("Enter");
  await expect(first.getByText("File: wheel.mp4")).toBeVisible();
  const captions = first.getByRole("group", { name: "Captions" });
  await captions.getByRole("textbox", { name: "Language code of a new caption file" }).focus();
  await page.keyboard.type("en");
  await putFile(page, "subs/wheel.en.vtt", CAPTIONS);
  await captions.getByRole("button", { name: "Add a caption file" }).focus();
  await page.keyboard.press("Enter");
  await expect(captions.getByText("English (en)")).toBeVisible();
  // Section 2: a web embed, refused until it is a listed provider's.
  const second = block
    .getByRole("group", { name: "Section 2", exact: true })
    .getByRole("group", { name: "Media and audio" });
  await choose(page, second.getByRole("button", { name: /Shows/ }), "A web embed");
  const address = second.getByRole("textbox", { name: "Web address or embed code" });
  await address.focus();
  await page.keyboard.type("https://example.org/clip");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("https://youtu.be/aaaaaaaaaaa?t=30");
  await page.keyboard.press("Enter");
  await expect(second.getByText("Plays from YouTube when a learner asks for it.")).toBeVisible();
  // Section 3: audio, then the audio player above the text.
  const third = block
    .getByRole("group", { name: "Section 3", exact: true })
    .getByRole("group", { name: "Media and audio" });
  await putFile(page, "sound/bell.mp3", MP3);
  await third.getByRole("button", { name: "Add audio" }).focus();
  await page.keyboard.press("Enter");
  await expect(third.getByText("File: bell.mp3")).toBeVisible();
  await block.getByRole("button", { name: "Format", exact: true }).focus();
  await page.keyboard.press("Enter");
  await choose(
    page,
    page.getByRole("dialog", { name: "Format" }).getByRole("button", { name: /Audio player/ }),
    "Above the text",
  );
  await closeFormat(page);
  const course = await saved(page);
  const accordion = lessonIn(course, "lessempty1").blocks[0] as Block;
  const items = accordion.items as ContentItem[];
  const key = (name: string) => course.media.find((entry) => entry.key === name)?.mimeType;
  expect(key(items[0]?.media?.key ?? "")).toBe("video/mp4");
  expect(items[0]?.media?.captions).toEqual([{ key: expect.any(String), language: "en" }]);
  expect(items[1]?.embed).toEqual({
    url: "https://youtu.be/aaaaaaaaaaa?t=30",
    embedUrl: "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?start=30",
    provider: "YouTube",
  });
  expect(key(items[2]?.audio?.key ?? "")).toBe("audio/mpeg");
  expect(accordion.variantSettings).toEqual({ audioPosition: "top" });
  // Back to nothing: the embed goes, in one undo step.
  await choose(page, second.getByRole("button", { name: /Shows/ }), "Nothing");
  await expect(address).toHaveCount(0);
  await heading(page, "Looking after a bicycle").click();
  await page.keyboard.press("Control+Z");
  await expect(second.getByRole("button", { name: /Shows/ })).toContainText("A web embed");
});

test("[rise:3C] blocks-interactions 2.8, W6: by pointer, each side of a card gets its own picture style, a video replaces a picture, and a side loses its picture", async ({
  page,
}) => {
  await openBicycle(page, "Cards and buttons");
  const block = row(page, "Cards and buttons", /^Flashcard grid/);
  const first = block.getByRole("group", { name: "Card 1" });
  // The first card's back fills the side; its front has no picture, so no style to choose.
  await expect(first.getByRole("button", { name: /Picture on the back/ })).toContainText(
    "Across the whole card",
  );
  await expect(first.getByRole("button", { name: /Picture on the front/ })).toHaveCount(0);
  await first.getByRole("button", { name: /Picture on the back/ }).click();
  await page.getByRole("option", { name: "Centred, with a frame" }).click();
  // The second card's front: its picture goes.
  const second = block.getByRole("group", { name: "Card 2" });
  const front = second.getByRole("group", { name: "Media on the front" });
  await front.getByRole("button", { name: /Shows/ }).click();
  await page.getByRole("option", { name: "Nothing", exact: true }).click();
  await expect(front.getByRole("button", { name: /Shows/ })).toContainText("Nothing");
  // The fourth card's back: a video.
  const back = block.getByRole("group", { name: "Card 4" }).getByRole("group", {
    name: "Media on the back",
  });
  await back.getByRole("button", { name: /Shows/ }).click();
  await page.getByRole("option", { name: "A video", exact: true }).click();
  await putFile(page, "clips/spoke.mp4", mp4());
  await back.getByRole("button", { name: "Choose a video" }).click();
  await expect(back.getByText("File: spoke.mp4")).toBeVisible();
  const course = await saved(page);
  const cards = blockIn(course, "iacardgrid").items as FlashcardItem[];
  expect(cards[0]?.back).toEqual({
    text: "<p>The stack of gears on the back wheel.</p>",
    media: { key: "wheel.svg", alt: "" },
  });
  expect(cards[1]?.front).toEqual({ text: "<p>Derailleur</p>" });
  expect(cards[3]?.back.media?.key).toMatch(/\.mp4$/);
  // The player's drawing of the grid: each side's own style.
  await expect(block.locator(".be-block-preview .card-back.image-centered")).toHaveCount(4);
});

test("[rise:3C] blocks-interactions 2.10, L10, W8: by keyboard, a button gets a heading, a page next to the course and an email, each checked as typed; exit is for learning systems only", async ({
  page,
}) => {
  await openBicycle(page, "Cards and buttons");
  const single = row(page, "Cards and buttons", /^Button$/);
  const heading2 = single.getByRole("textbox", { name: "Heading" });
  await expect(heading2).toHaveValue("Need a reminder?");
  await toRow(page, "Cards and buttons", single);
  await tabTo(page, heading2);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Not sure yet?");
  await page.keyboard.press("Enter");
  await choose(page, single.getByRole("button", { name: /Goes to/ }), "A page next to the course");
  const path = single.getByRole("textbox", { name: "Address next to the course" });
  await path.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("//example.org/care");
  await expect(path).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("handbook/tyres.html");
  await page.keyboard.press("Enter");
  await expect(path).not.toHaveAttribute("aria-invalid");
  await expect(single.locator(".be-block-preview a.block-button")).toHaveAttribute(
    "href",
    "handbook/tyres.html",
  );
  await expect(single.locator(".be-block-preview .button-heading")).toHaveText("Not sure yet?");
  const stack = row(page, "Cards and buttons", /^Button stack/);
  const second = stack.getByRole("group", { name: "Button 2" });
  await toRow(page, "Cards and buttons", stack);
  await tabTo(page, second.getByRole("button", { name: /Goes to/ }));
  await choose(page, second.getByRole("button", { name: /Goes to/ }), "An email");
  const addresses = second.getByRole("textbox", { name: "Email addresses" });
  await addresses.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("workshop@example.org, help");
  await expect(addresses).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("workshop@example.org, help@example.org");
  await page.keyboard.press("Enter");
  await expect(addresses).not.toHaveAttribute("aria-invalid");
  // The exit choice says it is for learning systems only.
  await expect(stack.getByText("Plain web packages leave this button out.")).toBeVisible();
  const course = await saved(page);
  expect(blockIn(course, "iabutton01").items?.[0]).toMatchObject({
    title: "Not sure yet?",
    destination: { kind: "relative", path: "handbook/tyres.html" },
  });
  expect(blockIn(course, "iabuttons1").items?.[1]).toMatchObject({
    destination: { kind: "email", addresses: ["workshop@example.org", "help@example.org"] },
  });
});

test("[rise:3C] blocks-interactions 2.10, D-36: a single button whose lesson was deleted offers a new button, by keyboard", async ({
  page,
}) => {
  await launch(page);
  await openFixture(page, FILE, bicycle(), ASSETS);
  // The single button goes to "Sections and tabs"; deleting that lesson takes the button too.
  await page.getByRole("button", { name: "Actions for Sections and tabs" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Open Sections and tabs" })).toHaveCount(0);
  await openLesson(page, "Cards and buttons");
  const single = row(page, "Cards and buttons", /^Button$/);
  await expect(single.getByText("This block has no button: its lesson was deleted.")).toBeVisible();
  const add = single.getByRole("button", { name: "Add a button" });
  await toRow(page, "Cards and buttons", single);
  await tabTo(page, add);
  await page.keyboard.press("Enter");
  await expect(single.getByRole("textbox", { name: "Label" })).toHaveValue("Learn more");
  const course = await saved(page);
  expect(blockIn(course, "iabutton01").items).toEqual([
    expect.objectContaining({ kind: "button", label: "Learn more" }),
  ]);
  expect(await violations(page), "a button block offering a new button").toEqual([]);
});

test("[rise:3C] blocks-editor P1, BLK-06: the preview shows every interactive block in the real player, accessible, with working markers, steps, cards and buttons", async ({
  page,
}) => {
  const course = interactiveBlocksCourse();
  const lessons = course.entries.filter((entry): entry is LessonEntry => entry.kind === "lesson");
  await launch(page);
  await openFixture(page, FILE, course, ASSETS);
  await openLesson(page, lessons[0]?.title ?? "");
  await button(page, "Preview").click();
  const preview = "iframe[title='Course preview']:not([data-pending])";
  const frame = page.frameLocator(preview);
  const shown = await (await page.locator(preview).elementHandle())?.contentFrame();
  if (!shown) throw new Error("no preview frame on show");
  for (const [i, lesson] of lessons.entries()) {
    if (i > 0)
      await frame
        .getByRole("link", { name: /^Next lesson/ })
        .first()
        .click();
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
    await expect(frame.locator(".blocks > [data-block]")).toHaveCount(lesson.blocks.length);
    expect(await violations(shown), lesson.title).toEqual([]);
  }
  // On the last lesson: a card turns, and a button takes the learner to a lesson.
  await frame.getByRole("button", { name: "Turn card" }).first().click();
  await expect(frame.getByRole("button", { name: "Turn card" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await frame.getByRole("link", { name: "See the steps again" }).click();
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Pictures and steps");
  await frame.getByRole("button", { name: /^Marker 1/ }).click();
  await expect(frame.getByRole("dialog", { name: "Back wheel" })).toBeVisible();
  await frame.getByRole("button", { name: "Begin" }).click();
  await expect(frame.getByRole("group", { name: "2 of 5" })).toBeVisible();
  expect(await violations(shown), "an open marker and a process step").toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`UI-ACCESSIBILITY: no axe violation on the interactive block screens in the ${theme} theme`, () => {
    const check = async (page: Page, state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);

    for (const [lesson, names] of [
      ["Sections and tabs", [/^Accordion/, /^Tabs/]],
      ["Pictures and steps", [/^Labelled image/, /^Process/]],
      ["Cards and buttons", [/^Flashcard grid/, /^Flashcard stack/, /^Button$/, /^Button stack/]],
    ] as const) {
      test(`the fields and format menus of ${lesson}`, async ({ page }) => {
        await openBicycle(page, lesson, `?theme=${theme}`);
        await check(page, `the fields of ${lesson}`);
        for (const name of names) {
          await row(page, lesson, name)
            .first()
            .getByRole("button", { name: "Format", exact: true })
            .click();
          await check(page, `format menu of ${name.source}`);
          await closeFormat(page);
        }
      });
    }

    test("a marker's icon list, and a new labelled image without its picture", async ({ page }) => {
      await openBicycle(page, "Pictures and steps", `?theme=${theme}`);
      await row(page, "Pictures and steps", /^Labelled image/)
        .getByRole("group", { name: "Marker 1" })
        .getByRole("button", { name: /Marker shows/ })
        .click();
      await check(page, "the marker icons");
      await page.keyboard.press("Escape");
      await insertByPointer(page, "Labelled image");
      await expect(
        page.getByText("Choose the picture first: the markers sit on it."),
      ).toBeVisible();
      await check(page, "a labelled image waiting for its picture");
    });
  });
}
