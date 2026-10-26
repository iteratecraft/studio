// The theme panel (M2-17; BLK-09, ENG-08) in Chromium against the in-memory host, under the desktop
// app's content security policy: its sections beside the course in the real player, layout
// styles, the cover and lesson header options, theme colours with contrast checks, fonts and
// pairings, the author's font library, the block animation switch and theme block backgrounds,
// by pointer and by keyboard, with axe on every new screen and on the themed player output in
// both editor themes.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { nodeFonts, TEST_CUSTOM_FONT } from "@course-suite/fonts/test/node-fonts";
import {
  type Course,
  contrastOf,
  type FontRef,
  type LessonEntry,
  SCHEMA_VERSION,
  type Theme,
  themeColors,
} from "@course-suite/format";
import { readZip } from "@course-suite/zip";
import {
  expect,
  type Frame,
  type FrameLocator,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { violations } from "./axe.ts";
import { back, card, courseIn, launch, openFixture, status } from "./helpers.ts";

const FILE = "Bees.crs";
const FRAME = "iframe[title='Course preview']:not([data-pending])";
const fontsDir = join(import.meta.dirname, "..", "..", "..", "packages", "fonts", "files");
/** A bundled font file, standing in for one the author has on disk. */
const fontFile = (family: string, face = "regular") =>
  readFileSync(join(fontsDir, family, `${face}.woff2`));

const paragraph = (id: string, text: string) => ({
  id,
  category: "text",
  variant: "paragraph",
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** A course of two lessons; the first is long, so its last block starts below the fold. */
function bees(theme?: Theme, id = "5b0f3e2c-1a4d-4c8e-9f60-7d2e1b3a4c5d", title = "Keeping bees") {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    kind: "course",
    title,
    description: "<p>A first season with a hive.</p>",
    authors: [{ name: "Robin Hale" }],
    navigation: { learnerMarkDone: true },
    ...(theme && { theme }),
    entries: [
      {
        id: "lesshive01",
        kind: "lesson",
        title: "The hive",
        blocks: [
          paragraph("bpara00001", "A hive holds one queen and many workers."),
          ...Array.from({ length: 8 }, (_, i) =>
            paragraph(`bpara0001${i}`, `Frame ${i + 1} holds comb, brood and honey.`),
          ),
          {
            id: "bcheck0001",
            category: "knowledge-check",
            variant: "single-choice",
            question: {
              id: "qcheck0001",
              kind: "single-choice",
              prompt: "<p>How many queens live in a hive?</p>",
              answers: [
                { id: "aone000001", text: "One", correct: true },
                { id: "amany00001", text: "Many", correct: false },
              ],
            },
          },
        ],
      },
      { id: "lessseas01", kind: "lesson", title: "The season", blocks: [] },
    ],
    media: [],
  } as Course;
}

async function openBees(page: Page, theme?: Theme, query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, bees(theme));
}

/** The editor's save state: the one status in its top bar. */
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page, file = FILE): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, file);
}

const themeButton = (page: Page) =>
  page.getByRole("toolbar", { name: "Course tools" }).getByRole("button", { name: "Theme" });

async function openTheme(page: Page): Promise<void> {
  await themeButton(page).click();
  await expect(page.getByRole("heading", { level: 2, name: "Theme" })).toBeFocused();
}

const sections = (page: Page) => page.getByRole("navigation", { name: "Theme settings" });
const sectionButton = (page: Page, name: string) =>
  sections(page).getByRole("button", { name: new RegExp(`^${name}`) });

async function openSection(page: Page, name: string): Promise<void> {
  await sectionButton(page, name).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeFocused();
}

/** Turns a switch of the panel on or off by its label, as a pointer user does. */
const toggle = (page: Page, name: string) => panel(page).getByText(name, { exact: true }).click();

/** The theme panel beside the preview. */
const panel = (page: Page) => page.locator(".be-theme-panel");

/** Saves the section and checks focus is back on its button in the menu. */
async function saveSection(page: Page, name: string): Promise<void> {
  await panel(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(sectionButton(page, name)).toBeFocused();
}

/** The player in the preview beside the panel, once it shows the course. */
async function player(page: Page): Promise<FrameLocator> {
  const frame = page.frameLocator(FRAME);
  await expect(frame.locator("#content")).toBeVisible();
  return frame;
}

/**
 * The frame on show, to run script in, once it shows the course. A live update swaps frames, so
 * it is looked up again until one answers.
 */
async function shownFrame(page: Page): Promise<Frame> {
  let frame: Frame | null | undefined;
  await expect
    .poll(async () => {
      const element = await page
        .locator(FRAME)
        .elementHandle({ timeout: 5_000 })
        .catch(() => null);
      frame = await element?.contentFrame();
      return frame
        ? frame.evaluate(() => document.getElementById("content") !== null).catch(() => false)
        : false;
    })
    .toBe(true);
  return frame as Frame;
}

/** A custom property the theme set on the player's page. */
const variable = (frame: Frame, name: string) =>
  frame.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    name,
  );

/** Whether the player page has the font family loaded, once its fonts settle. */
const fontLoaded = (frame: Frame, family: string) =>
  frame.evaluate(async (family) => {
    await document.fonts.ready;
    return [...document.fonts].some((face) => face.family === family && face.status === "loaded");
  }, family);

/** Waits until the player on show has the font family loaded. */
const expectFontLoaded = (page: Page, family: string) =>
  expect.poll(async () => fontLoaded(await shownFrame(page), family).catch(() => false)).toBe(true);

/** Presses Tab until `target` has the focus, at most 40 times. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((element) => element === element.ownerDocument.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** A select of the panel by its label; its button is named by its value, then its label. */
const select = (page: Page, label: string) =>
  panel(page).getByRole("button", { name: new RegExp(`${label}$`) });

/** Chooses `option` in the select `label` by keyboard: open it, arrow to the option, Enter. */
async function chooseByKeyboard(page: Page, label: string, option: string): Promise<void> {
  await tabTo(page, select(page, label));
  await page.keyboard.press("Enter");
  const target = page.getByRole("option", { name: option, exact: true });
  for (let i = 0; i < 12; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}

/** Console errors and uncaught errors on the page and in its frames, such as policy violations. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Puts a file on the in-memory disk; the next open dialog picks it. */
async function willPick(page: Page, id: string, data: Uint8Array): Promise<void> {
  await page.evaluate(
    ([id, bytes]) => {
      window.editorTest.host.disk.set(id as string, new Uint8Array(bytes as number[]));
      window.editorTest.open = [id as string];
    },
    [id, Array.from(data)] as const,
  );
}

test("blocks-editor T1 BLK-09, M2-17: the theme button opens its sections in order beside the course in the real player, and back returns to the course", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await openBees(page);
  await openTheme(page);
  await expect(themeButton(page)).toBeDisabled();
  await expect(sections(page).getByRole("button")).toHaveText([
    "Layout styleClassic",
    "Cover pagePicture on the left",
    "Lesson headersLight",
    "Colours#ff631e",
    "FontsNoto Sans and Noto Serif",
    "BlocksOn",
  ]);
  const frame = await player(page);
  await expect(frame.getByRole("heading", { level: 1, name: "Keeping bees" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the course" }).click();
  await expect(page.getByRole("textbox", { name: "Course title" })).toBeVisible();
  await expect(themeButton(page)).toBeEnabled();
  expect(errors).toEqual([]);
});

test("UI-BLOCKS-EDITOR-R43 [rise:3E] BLK-09: a layout style shows on selection, saves as one undo step and keeps colour, font and navigation values; cancel keeps the course", async ({
  page,
}) => {
  const theme: Theme = {
    color: "#7837a8",
    contrast: "dark",
    fonts: { heading: { kind: "builtin", id: "inter" }, body: { kind: "builtin", id: "literata" } },
    headers: { lessonCount: false },
  };
  await openBees(page, theme);
  const before = await saved(page);
  await openTheme(page);
  await openSection(page, "Layout style");
  await page.getByRole("option", { name: /^Bold/ }).click();
  // Previewed on selection (T3), before it is saved.
  const frame = await player(page);
  await expect(frame.locator(".cover-full-image")).toBeVisible();
  await saveSection(page, "Layout style");
  await expect(sectionButton(page, "Layout style")).toContainText("Bold");

  const after = await saved(page);
  expect(after.theme).toEqual({
    ...theme,
    layout: "bold",
    cover: { layout: "full-image" },
    headers: { lessonCount: false, layout: "theme" },
  });
  expect(after.theme?.color).toBe(before.theme?.color);
  expect(after.theme?.contrast).toBe(before.theme?.contrast);
  expect(after.theme?.fonts).toEqual(before.theme?.fonts);
  expect(after.navigation).toEqual(before.navigation);

  // Cancel leaves the course as it is, and the preview shows it again.
  await openSection(page, "Layout style");
  await page.getByRole("option", { name: /^Rounded/ }).click();
  await expect(frame.locator(".cover-split-right")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(frame.locator(".cover-full-image")).toBeVisible();
  expect((await saved(page)).theme).toEqual(after.theme);

  // One undo step.
  await page.getByRole("heading", { level: 2, name: "Theme" }).click();
  await page.keyboard.press("Control+Z");
  expect((await saved(page)).theme).toEqual(theme);
});

test("[rise:R18] UI-BLOCKS-EDITOR-R19 UI-BLOCKS-EDITOR-R45 BLK-09, keyboard only: theme colours are checked against 4.5:1, the nearest passing colour is offered, and the player uses the saved colour", async ({
  page,
}) => {
  await openBees(page);
  await themeButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Theme" })).toBeFocused();
  await tabTo(page, sectionButton(page, "Colours"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Colours" })).toBeFocused();

  // A suggested colour.
  const blue = page.getByRole("button", { name: "#285f9f" });
  await tabTo(page, blue);
  await page.keyboard.press("Enter");
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Text on this colour reads at")).toBeVisible();

  // A custom light colour: automatic contrast gives links a darker shade, offered as a choice.
  const field = page.getByRole("textbox", { name: "Theme colour" });
  await tabTo(page, field);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("#ffeb3b");
  await page.keyboard.press("Enter");
  const accent = themeColors({ color: "#ffeb3b" }).accent;
  await expect(page.getByText(`Links and buttons on white use ${accent}`)).toBeVisible();

  // Light text on it fails 4.5:1: the panel says so and offers the nearest colour that passes.
  await chooseByKeyboard(page, "Text colour", "Light");
  await expect(page.getByText(/below the 4\.5:1 that WCAG AA asks for/)).toBeVisible();
  const offer = panel(page)
    .getByRole("button", { name: /^Use #[0-9a-f]{6}$/ })
    .last();
  const nearest = ((await offer.textContent()) ?? "").slice(4);
  expect(contrastOf("#ffffff", nearest)).toBeGreaterThanOrEqual(4.5);
  await tabTo(page, offer);
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue(nearest);
  await expect(page.getByText(/below the 4\.5:1/)).toHaveCount(0);

  await tabTo(page, panel(page).getByRole("button", { name: "Save", exact: true }));
  await page.keyboard.press("Enter");
  await expect(sectionButton(page, "Colours")).toBeFocused();
  const theme = (await saved(page)).theme;
  expect(theme).toEqual({ color: nearest, contrast: "light" });

  // The player draws with it: the begin button in the theme colour with light text.
  const frame = await player(page);
  const begin = frame.getByRole("link", { name: "Begin course" });
  const colors = themeColors(theme);
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(", ")})`;
  await expect(begin).toHaveCSS("background-color", rgb(colors.button));
  await expect(begin).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect
    .poll(async () => variable(await shownFrame(page), "--theme").catch(() => ""))
    .toBe(nearest);
});

test("[rise:3E] UI-BLOCKS-EDITOR-R47 BLK-09: the cover's start button, authors, layout and skip, shown in the player", async ({
  page,
}) => {
  await openBees(page);
  await openTheme(page);
  await openSection(page, "Cover page");
  await toggle(page, "Start button");
  await toggle(page, "Show authors");
  await select(page, "Cover layout").click();
  await page.getByRole("option", { name: "Title over the picture" }).click();
  // Without a cover picture the title sits on the theme colour.
  const frame = await player(page);
  await expect(frame.locator(".cover-overlay")).toHaveCSS("background-color", "rgb(255, 99, 30)");
  await expect(frame.getByRole("link", { name: "Begin course" })).toHaveCount(0);
  await expect(frame.getByText("Robin Hale")).toHaveCount(0);
  await saveSection(page, "Cover page");
  expect((await saved(page)).theme).toEqual({
    cover: { startButton: false, author: false, layout: "full-image" },
  });

  // Skipped, the course opens at its first lesson.
  await openSection(page, "Cover page");
  await toggle(page, "Skip the cover page");
  await expect(frame.getByRole("heading", { level: 1, name: "The hive" })).toBeVisible();
  await saveSection(page, "Cover page");
  expect((await saved(page)).theme?.cover?.skip).toBe(true);
});

test("UI-BLOCKS-EDITOR-R46 BLK-09, keyboard only: lesson header background, height, count and author; hiding headers greys out the rest and keeps the title for screen readers", async ({
  page,
}) => {
  await openBees(page);
  await openTheme(page);
  await tabTo(page, sectionButton(page, "Lesson headers"));
  await page.keyboard.press("Enter");
  await chooseByKeyboard(page, "Header background", "Theme colour");
  await chooseByKeyboard(page, "Header height", "Large");
  await tabTo(page, page.getByRole("switch", { name: "Lesson count label" }));
  await page.keyboard.press("Space");
  const frame = await player(page);
  await frame.getByRole("link", { name: "Begin course" }).click();
  const header = frame.locator(".lesson-header");
  await expect(header).toHaveCSS("background-color", "rgb(255, 99, 30)");
  await expect(header).toHaveClass(/header-large/);
  await expect(frame.getByText("Lesson 1 of 2")).toHaveCount(0);
  await expect(frame.locator(".lesson-author")).toHaveText("Robin Hale");

  await tabTo(page, page.getByRole("switch", { name: "Hide lesson headers" }));
  await page.keyboard.press("Space");
  await expect(page.getByRole("switch", { name: "Author" })).toBeDisabled();
  await expect(select(page, "Header background")).toBeDisabled();
  const title = frame.getByRole("heading", { level: 1, name: "The hive" });
  await expect(title).toHaveClass(/visually-hidden/);
  await expect(frame.locator(".lesson-author")).toHaveCount(0);
  await tabTo(page, panel(page).getByRole("button", { name: "Save", exact: true }));
  await page.keyboard.press("Enter");
  expect((await saved(page)).theme).toEqual({
    headers: { layout: "theme", height: "large", lessonCount: false, hidden: true },
  });
});

test("[rise:3E] BLK-09, D-45: a recommended pairing and an interface font, embedded in the preview from the app's own files", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await openBees(page);
  await openTheme(page);
  await openSection(page, "Fonts");
  await page.getByRole("option", { name: "Montserrat and Literata" }).click();
  await page.getByRole("tab", { name: "Mix fonts" }).click();
  await select(page, "Interface font").click();
  await page.getByRole("option", { name: "Inter", exact: true }).click();
  await saveSection(page, "Fonts");
  await expect(sectionButton(page, "Fonts")).toContainText("Montserrat and Literata");
  expect((await saved(page)).theme).toEqual({
    fonts: {
      heading: { kind: "builtin", id: "montserrat" },
      body: { kind: "builtin", id: "literata" },
      ui: { kind: "builtin", id: "inter" },
    },
  });
  const frame = await player(page);
  await expect(frame.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /^montserrat, /);
  await expectFontLoaded(page, "montserrat");
  await expectFontLoaded(page, "literata");
  expect(errors).toEqual([]);
});

test("blocks-editor W21 BLK-09, ENG-08: a custom font is added to the author's library with a licence notice, refused when not a font, and used for headings", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await openBees(page);
  await openTheme(page);
  await openSection(page, "Fonts");
  await page.getByRole("tab", { name: "Mix fonts" }).click();
  await page.getByRole("button", { name: "Add a font" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a font" });
  await expect(
    dialog.getByText(/Only add fonts you have the right to use and share/),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await willPick(page, "Downloads/notes.txt", new TextEncoder().encode("not a font"));
  await dialog.getByRole("button", { name: "Choose a regular file" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("notes.txt is not a WOFF or WOFF2 font.");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await willPick(page, "Downloads/House-Hand.woff2", fontFile("crimson-pro"));
  await dialog.getByRole("button", { name: "Choose a regular file" }).click();
  await expect(dialog.getByRole("textbox", { name: "Font name" })).toHaveValue("House Hand");
  await willPick(page, "Downloads/House-Hand-Bold.woff2", fontFile("crimson-pro", "bold"));
  await dialog.getByRole("button", { name: "Choose a bold file" }).click();
  await expect(dialog.getByText("House-Hand-Bold.woff2")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("House Hand is in your fonts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit House Hand" })).toBeVisible();

  await select(page, "Heading font").click();
  await page.getByRole("option", { name: "House Hand" }).click();
  await saveSection(page, "Fonts");
  const font = (await saved(page)).theme?.fonts?.heading as Extract<FontRef, { kind: "custom" }>;
  expect(font).toMatchObject({ kind: "custom", name: "House Hand" });
  // Kept in the app data folder, usable in every course.
  const data = await page.evaluate(() =>
    [...window.editorTest.host.disk.keys()].filter((id) => id.startsWith("appdata/fonts/")).sort(),
  );
  expect(data).toEqual([
    `appdata/fonts/${font.id}/bold.woff2`,
    `appdata/fonts/${font.id}/regular.woff2`,
  ]);
  const frame = await player(page);
  await expect(frame.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-family",
    new RegExp(`^"?custom-${font.id}"?, `),
  );
  await expectFontLoaded(page, `custom-${font.id}`);
  expect(errors).toEqual([]);
});

test("UI-BLOCKS-EDITOR-R48 BLK-09: editing a custom font updates every course using it; deleting it returns those courses to the default font", async ({
  page,
}) => {
  await openBees(page);
  await openTheme(page);
  await openSection(page, "Fonts");
  await page.getByRole("tab", { name: "Mix fonts" }).click();
  await page.getByRole("button", { name: "Add a font" }).click();
  await willPick(page, "Downloads/Comb.woff2", fontFile("crimson-pro"));
  await page.getByRole("button", { name: "Choose a regular file" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await select(page, "Heading font").click();
  await page.getByRole("option", { name: "Comb" }).click();
  await saveSection(page, "Fonts");
  const font = (await saved(page)).theme?.fonts?.heading as Extract<FontRef, { kind: "custom" }>;

  // A second course that uses the same font.
  await back(page);
  await openFixture(
    page,
    "Wasps.crs",
    bees({ fonts: { heading: font } }, "0e6a2f4d-3b1c-4d5e-8f70-9a1b2c3d4e5f", "Wasps"),
  );
  await openTheme(page);
  await expect(sectionButton(page, "Fonts")).toContainText("Comb and Noto Serif");

  // Edit it here: a new name and a new regular face.
  await openSection(page, "Fonts");
  await page.getByRole("tab", { name: "Mix fonts" }).click();
  await page.getByRole("button", { name: "Edit Comb" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit font" });
  await expect(
    dialog.getByText("Changes apply to every course that uses this font."),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Font name" }).fill("Honeycomb");
  await willPick(page, "Downloads/Honeycomb.woff2", fontFile("literata"));
  await dialog.getByRole("button", { name: "Choose a regular file" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Honeycomb is in your fonts")).toBeVisible();
  const stored = await page.evaluate(
    (id) => Array.from(window.editorTest.host.disk.get(`appdata/fonts/${id}/regular.woff2`) ?? []),
    font.id,
  );
  expect(Buffer.from(stored).equals(fontFile("literata"))).toBe(true);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(sectionButton(page, "Fonts")).toContainText("Honeycomb and Noto Serif");

  // The first course shows the change too.
  await page.getByRole("button", { name: "Back to the course" }).click();
  await back(page);
  await card(page, "Keeping bees").click();
  await openTheme(page);
  await expect(sectionButton(page, "Fonts")).toContainText("Honeycomb and Noto Serif");
  await player(page);
  await expectFontLoaded(page, `custom-${font.id}`);

  // Delete it: both courses fall back to the default heading font.
  await openSection(page, "Fonts");
  await page.getByRole("tab", { name: "Mix fonts" }).click();
  await page.getByRole("button", { name: "Delete Honeycomb" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete Honeycomb?" });
  await expect(confirm).toContainText("Courses that use it show the default font instead.");
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Honeycomb was deleted")).toBeVisible();
  await expect(
    // The course names the font as it was when chosen.
    page.getByText("Comb is no longer in your fonts, so the course shows Noto Sans."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(sectionButton(page, "Fonts")).toContainText("Noto Sans and Noto Serif");
  const frame = await player(page);
  await expect(frame.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-family",
    /^"?noto-sans"?, /,
  );
  const left = await page.evaluate(() =>
    [...window.editorTest.host.disk.keys()].filter((id) => id.startsWith("appdata/fonts/")),
  );
  expect(left).toEqual([]);
  await page.getByRole("button", { name: "Back to the course" }).click();
  await back(page);
  await card(page, "Wasps").click();
  await openTheme(page);
  await expect(sectionButton(page, "Fonts")).toContainText("Noto Sans and Noto Serif");
});

test("[rise:3D] blocks-editor T10 BLK-09: the block animation switch is wired to the player; blocks fade in as they scroll into view, never under reduced motion", async ({
  page,
}) => {
  await openBees(page);
  await openTheme(page);
  const frame = await player(page);
  await frame.getByRole("link", { name: "Begin course" }).click();
  const first = frame.locator('[data-block="bpara00001"]');
  const check = frame.locator('[data-block="bcheck0001"]');
  // The paragraph is in view when the lesson opens: no animation. The check scrolls in: it fades.
  await check.scrollIntoViewIfNeeded();
  await expect(check).toHaveClass(/entering/);
  await expect(first).not.toHaveClass(/entering/);

  await openSection(page, "Blocks");
  const shown = await page.locator(FRAME).elementHandle();
  await toggle(page, "Fade blocks in as they scroll into view");
  await saveSection(page, "Blocks");
  expect((await saved(page)).theme).toEqual({ animations: false });
  // The preview shows the change in a new frame, at the lesson on show.
  await expect.poll(() => shown?.evaluate((frame) => frame.isConnected)).toBe(false);
  const after = await player(page);
  await expect(after.getByRole("heading", { level: 1, name: "The hive" })).toBeVisible();
  await after.locator('[data-block="bcheck0001"]').scrollIntoViewIfNeeded();
  await expect(after.locator(".block.entering")).toHaveCount(0);
});

test("UI-ACCESSIBILITY-R40 a learner who asks for less motion sees no block move", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBees(page);
  await openTheme(page);
  const frame = await player(page);
  await frame.getByRole("link", { name: "Begin course" }).click();
  const check = frame.locator('[data-block="bcheck0001"]');
  await check.scrollIntoViewIfNeeded();
  await expect(check).toHaveClass(/entering/);
  expect(await check.evaluate((element) => element.getAnimations().length)).toBe(0);
});

test("UI-BLOCKS-EDITOR-R45 [rise:3D] BLK-09: a block set to the theme colour or its tint follows the theme in the player", async ({
  page,
}) => {
  await openBees(page, { color: "#25bb64" });
  await page.getByRole("button", { name: "Open The hive" }).click();
  const row = page.getByRole("row", {
    name: "Paragraph: A hive holds one queen and many workers.",
    exact: true,
  });
  await row.getByRole("button", { name: "Style" }).click();
  await page
    .getByRole("dialog", { name: "Style" })
    .getByRole("button", { name: /Background/ })
    .click();
  await page.getByRole("option", { name: "Theme tint" }).click();
  // Focus is back in the style menu before Escape closes it.
  await expect(
    page.getByRole("dialog", { name: "Style" }).getByRole("button", { name: /Background/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Style" })).toHaveCount(0);
  const course = await saved(page);
  const lesson = course.entries[0] as LessonEntry;
  expect(lesson.blocks[0]?.settings).toEqual({ background: { kind: "tint" } });
  await page
    .getByRole("toolbar", { name: "Course tools" })
    .getByRole("button", { name: "Preview" })
    .click();
  const frame = page.frameLocator(FRAME);
  const block = frame.locator('[data-block="bpara00001"]');
  const tint = themeColors({ color: "#25bb64" }).tint;
  const rgb = `rgb(${[1, 3, 5].map((at) => Number.parseInt(tint.slice(at, at + 2), 16)).join(", ")})`;
  await expect(block).toHaveCSS("background-color", rgb);
});

for (const editorTheme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on the theme panel, its sections and dialogs, or the themed player output, in the ${editorTheme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${editorTheme}: ${state}`).toEqual([]);
    const checkPlayer = async (state: string) => {
      await player(page);
      expect(await violations(await shownFrame(page)), `${editorTheme}: player ${state}`).toEqual(
        [],
      );
    };
    await openBees(
      page,
      {
        layout: "bold",
        cover: { layout: "full-image" },
        headers: { layout: "theme", height: "large" },
        color: "#4baaf4",
        corners: "square",
        buttons: "square",
      },
      `?theme=${editorTheme}`,
    );
    await openTheme(page);
    await check("menu");
    await checkPlayer("cover, title on the theme colour");
    for (const name of ["Layout style", "Cover page", "Lesson headers", "Colours", "Blocks"]) {
      await openSection(page, name);
      await check(name);
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    await openSection(page, "Colours");
    await select(page, "Text colour").click();
    await page.getByRole("option", { name: "Light" }).click();
    await check("colours with a contrast warning");
    await page.getByRole("button", { name: "Cancel" }).click();
    await openSection(page, "Fonts");
    await check("fonts, pairings");
    await page.getByRole("tab", { name: "Mix fonts" }).click();
    await check("fonts, mix");
    await page.getByRole("button", { name: "Add a font" }).click();
    await check("add a font");
    await willPick(page, "Downloads/Hand.woff2", fontFile("crimson-pro"));
    await page.getByRole("button", { name: "Choose a regular file" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Delete Hand" }).click();
    await check("delete a font");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    const frame = await player(page);
    await frame.getByRole("link", { name: "Begin course" }).click();
    await expect(frame.getByRole("heading", { level: 1, name: "The hive" })).toBeVisible();
    await checkPlayer("lesson with a header in the theme colour");
  });
}

test("[rise:R18] [rise:3E] ENG-08, BLK-09, D-45: an exported web package carries the theme's fonts and only those, shows its custom font from disk with no network, opens past a skipped cover, and has no axe violation", async ({
  page,
}) => {
  const course = bees({
    cover: { skip: true },
    headers: { layout: "theme" },
    color: "#7837a8",
    fonts: { heading: TEST_CUSTOM_FONT, body: { kind: "builtin", id: "literata" } },
  });
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
  // The heading font (and the interface font, which follows it) and the body font: nothing else.
  expect(zip.value.names.filter((name) => name.startsWith("fonts/"))).toEqual([
    "fonts/custom-testfont01-bold.woff2",
    "fonts/custom-testfont01-italic.woff2",
    "fonts/custom-testfont01-regular.woff2",
    "fonts/literata-bold.woff2",
    "fonts/literata-italic.woff2",
    "fonts/literata-regular.woff2",
  ]);
  const dir = mkdtempSync(join(tmpdir(), "theme-export-"));
  try {
    for (const name of zip.value.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
    }
    const base = pathToFileURL(`${dir}/`).href;
    // Offline: anything but the package's own files is refused and recorded.
    const outside: string[] = [];
    await page.route(
      (url) => !url.href.startsWith(base),
      (route) => {
        outside.push(route.request().url());
        return route.abort();
      },
    );
    const fonts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font") fonts.push(request.url());
    });
    const errors = errorsOf(page);
    await page.goto(`${base}index.html`);
    // The cover is skipped: the first lesson opens directly.
    await expect(page.getByRole("heading", { level: 1, name: "The hive" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
      "font-family",
      /^"?custom-testfont01"?, /,
    );
    await expect.poll(() => fontLoaded(page.mainFrame(), "custom-testfont01")).toBe(true);
    await expect.poll(() => fontLoaded(page.mainFrame(), "literata")).toBe(true);
    // The faces drawn came from the package's own fonts/ folder.
    expect(fonts).toEqual(
      expect.arrayContaining([
        `${base}fonts/custom-testfont01-regular.woff2`,
        `${base}fonts/literata-regular.woff2`,
      ]),
    );
    for (const url of fonts) expect(url.startsWith(`${base}fonts/`)).toBe(true);
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
    // (axe reads style sheets by XMLHttpRequest, which file: pages refuse with a console error.)
    expect(await violations(page)).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
