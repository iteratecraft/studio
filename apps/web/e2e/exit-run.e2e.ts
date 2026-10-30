// The Desktop 0.1 exit run (ROADMAP.md M2 exit, M2-22): one scripted journey through the blocks
// editor against the in-memory host, offline. It creates a course, adds three lessons that hold
// every block type the library offers today and a quiz lesson, undoes and redoes each lesson's
// inserts, gives the media blocks their files, sets the theme and the navigation, takes the
// course in the preview, and exports a SCORM 1.2 package that the publish panel tracks by the
// quiz. Nothing may leave the page's own origin: any other request is cut off and fails the run.
//
// The package and the course document go to EXIT_RUN_OUT (default: this test's output folder).
// The Moodle job (ci.yml) runs this journey first and then hands both to
// packages/conformance/moodle/moodle.e2e.ts, where a learner passes the course in a real Moodle.
/// <reference types="node" />
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Course, LessonEntry, QuizEntry } from "@course-suite/format";
import { readZip } from "@course-suite/zip";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { bytesOf, courseIn, create, heading, launch, status } from "./helpers.ts";

const TITLE = "The water cycle";
const FILE = `${TITLE}.crs`;
const PACKAGE = "The-water-cycle-scorm12.zip";
const FRAME = "iframe[title='Course preview']:not([data-pending])";

/**
 * The three lessons and the library entries each one takes. Together they are every type the
 * library offers today; the test checks that against the library itself.
 */
const LESSONS: { title: string; types: string[] }[] = [
  {
    title: "Water around us",
    types: [
      "Paragraph",
      "Paragraph with heading",
      "Paragraph with subheading",
      "Heading",
      "Subheading",
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
      "Line",
      "Numbered divider",
      "Space",
    ],
  },
  {
    title: "Seeing the cycle",
    types: [
      "Centred image",
      "Full-width image",
      "Image beside text",
      "Text over an image",
      "Banner",
      "Image carousel",
      "Grid of two columns",
      "Grid of three columns",
      "Grid of four columns",
      "Audio",
      "Video",
      "Web page or embed",
      "File to download",
      "Code snippet",
    ],
  },
  {
    title: "Try it yourself",
    types: [
      "Accordion",
      "Tabs",
      "Labelled image",
      "Process",
      "Flashcard grid",
      "Flashcard stack",
      "Button",
      "Button stack",
      "Single choice",
      "Multiple response",
      "Fill in the blank",
      "Matching",
      "Continue",
    ],
  },
];
const QUIZ = "Water cycle check";

const blocksOf = (page: Page, lesson: string) =>
  page.getByRole("grid", { name: `Blocks of ${lesson}` });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const tools = (page: Page) => page.getByRole("toolbar", { name: "Course tools" });
/** The theme panel's section or the publish panel on show. */
const panel = (page: Page) => page.locator(".be-theme-panel, .be-publish");
/** A select of a panel by its label; its button is named by its value, then its label. */
const select = (page: Page, label: string) =>
  panel(page).getByRole("button", { name: new RegExp(`${label}$`) });

const isFocused = (target: Locator) =>
  target.evaluate((element) => element === element.ownerDocument.activeElement);

/** Presses `key` (Tab by default) until `target` has the focus, at most 60 times. */
async function pressTo(page: Page, target: Locator, key = "Tab"): Promise<void> {
  await expect(target).toBeAttached();
  for (let i = 0; i < 60 && !(await isFocused(target)); i++) await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

/** Chooses `option` in the select `label` by keyboard: open it, arrow to the option, Enter. */
async function chooseByKeyboard(page: Page, label: string, option: string): Promise<void> {
  await pressTo(page, select(page, label));
  await page.keyboard.press("Enter");
  // The list takes the focus once open; keys pressed before that would go to the button.
  await expect(page.locator("[role=option]:focus")).toHaveCount(1);
  await page.keyboard.press("Home");
  await pressTo(page, page.getByRole("option", { name: option, exact: true }), "ArrowDown");
  await page.keyboard.press("Enter");
  // The list closes and hands the focus back to its button before the next key.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(select(page, label)).toBeFocused();
  await expect(select(page, label)).toContainText(option);
}

/** Adds a block from the library at the end of the lesson, by keyboard: search, arrows, Enter. */
async function addBlock(page: Page, type: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).focus();
  await page.keyboard.press("Enter");
  const library = page.getByRole("listbox", { name: "Block library" });
  await expect(page.getByRole("searchbox", { name: "Search block types" })).toBeFocused();
  await page.keyboard.type(type);
  const option = library.getByRole("option", { name: type, exact: true });
  await expect(option).toBeVisible();
  await page.keyboard.press("Tab");
  await pressTo(page, option, "ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Block library" })).toHaveCount(0);
}

/** Opens a lesson, the quiz or the course overview with the switcher, by keyboard. */
async function goTo(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Go to$/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[role=option]:focus")).toHaveCount(1);
  await page.keyboard.press("Home");
  await pressTo(page, page.getByRole("option", { name, exact: true }), "ArrowDown");
  await page.keyboard.press("Enter");
}

/** A lesson's block rows (a table block's own rows have no name). */
const blockRows = (page: Page, lesson: string) =>
  blocksOf(page, lesson).locator("[role=row][aria-label]");

/** Names of a lesson's block rows, in order. */
const rowNames = (page: Page, lesson: string) =>
  blockRows(page, lesson).evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")));

/** Puts a file on the in-memory disk, for the open dialog to pick next. */
async function putFile(page: Page, id: string, data: Uint8Array): Promise<void> {
  await page.evaluate(
    ([id, bytes]) => {
      window.editorTest.host.disk.set(id as string, new Uint8Array(bytes as number[]));
      window.editorTest.open = [id as string];
    },
    [id, Array.from(data)] as const,
  );
}

/** A PNG drawn by the browser's canvas, put on the disk to pick next. */
async function putImage(page: Page, id: string): Promise<void> {
  await page.evaluate(async (id) => {
    const canvas = new OffscreenCanvas(640, 360);
    const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    context.fillStyle = "#2a6f97";
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = "#f2c14e";
    context.fillRect(0, 0, 320, 180);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    window.editorTest.host.disk.set(id, new Uint8Array(await blob.arrayBuffer()));
    window.editorTest.open = [id];
  }, id);
}

/** A minimal MP4 with H.264 and AAC tracks: web-ready, so it goes in without converting (D-47). */
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
  const trak = (codec: string) =>
    box(
      "trak",
      box("mdia", box("minf", box("stbl", box("stsd", count, box(codec, new Uint8Array(8)))))),
    );
  return new Uint8Array([
    ...box("ftyp", new TextEncoder().encode("isom")),
    ...box("moov", trak("avc1"), trak("mp4a")),
  ]);
}

/**
 * Picks a file for every "Choose …" button of `name` in the lesson, one at a time; `put` puts the
 * file the open dialog then picks.
 */
async function fillAll(
  page: Page,
  lesson: string,
  name: string,
  put: (n: number) => Promise<void>,
): Promise<void> {
  const buttons = blocksOf(page, lesson).getByRole("button", { name, exact: true });
  let filled = 0;
  for (let left = await buttons.count(); left > 0; left = await buttons.count()) {
    await put(filled);
    await buttons.first().click();
    await expect(buttons).toHaveCount(left - 1);
    filled++;
  }
}

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]);
const PDF = new TextEncoder().encode(`%PDF-1.7\n${"x".repeat(900)}`);

/** Picks file `id` with `data` for the lesson's one "Choose …" button of `name`. */
async function fillOne(
  page: Page,
  lesson: string,
  name: string,
  id: string,
  data: Uint8Array,
): Promise<void> {
  const choose = blocksOf(page, lesson).getByRole("button", { name, exact: true });
  await expect(choose).toHaveCount(1);
  await putFile(page, id, data);
  await choose.click();
  await expect(choose).toHaveCount(0);
}

/** Gives every picture in the lesson alt text. */
async function describePictures(page: Page, lesson: string): Promise<void> {
  const fields = blocksOf(page, lesson).getByRole("textbox", { name: /^Alt text/ });
  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    if ((await field.inputValue()) !== "") continue;
    await field.fill(`Rain over the hills, picture ${i + 1}`);
    await field.press("Enter");
  }
}

/** The editor's save state: the one status in its top bar. */
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, FILE);
}

test("M2 exit, ROADMAP M2, D-29: offline, a course with three lessons holding every block type and a quiz is built, themed, given navigation, previewed and exported as SCORM 1.2", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const origin = new URL(baseURL ?? "http://localhost").origin;
  // Offline: anything outside the page's own files is cut off and recorded (ADR-0004).
  const outside: string[] = [];
  const local = (url: string) =>
    url.startsWith("blob:") || url.startsWith("data:") || new URL(url).origin === origin;
  await page.context().route(
    (url) => !local(url.href),
    (route) => {
      outside.push(route.request().url());
      return route.abort("internetdisconnected");
    },
  );
  page.context().on("request", (request) => {
    if (!local(request.url())) outside.push(request.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // 1. A new course: three lessons, then a quiz from the Add menu, by keyboard.
  await launch(page);
  await create(page, TITLE);
  await page.getByRole("textbox", { name: "New lesson or section" }).focus();
  for (const { title } of LESSONS) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type(QUIZ);
  await page.keyboard.press("Tab");
  await expect(button(page, "Add")).toBeFocused();
  await page.keyboard.press("Enter");
  await pressTo(page, page.getByRole("menuitem", { name: "Quiz" }), "ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("grid", { name: "Outline" }).getByRole("row")).toHaveCount(4);

  // The three lessons together take every type the library offers today.
  await page.getByRole("button", { name: `Open ${LESSONS[0]?.title}` }).click();
  await page.getByRole("button", { name: "All blocks" }).click();
  const offered = await page
    .getByRole("listbox", { name: "Block library" })
    .getByRole("option")
    .evaluateAll((options) =>
      options
        .filter((option) => !option.hasAttribute("aria-disabled"))
        .map((option) => option.querySelector("[slot=label]")?.textContent ?? option.textContent),
    );
  expect(offered.sort()).toEqual(LESSONS.flatMap((lesson) => lesson.types).sort());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Block library" })).toHaveCount(0);

  // 2. Each lesson: every block of its share by keyboard; all undone, then all redone (M2 exit:
  //    undo and redo cover every edit); then the media blocks get their files.
  for (const [n, { title, types }] of LESSONS.entries()) {
    if (n > 0) {
      await goTo(page, title);
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeFocused();
    }
    for (const type of types) await addBlock(page, type);
    const names = await rowNames(page, title);
    expect(names).toHaveLength(types.length);
    await heading(page, TITLE).click();
    for (let i = 0; i < types.length; i++) await page.keyboard.press("Control+Z");
    await expect(button(page, "Undo")).toBeDisabled();
    await expect(blockRows(page, title)).toHaveCount(0);
    for (let i = 0; i < types.length; i++) await page.keyboard.press("Control+Y");
    await expect(button(page, "Redo")).toBeDisabled();
    expect(await rowNames(page, title)).toEqual(names);

    // Every picture slot; the media lesson's audio, video and file blocks (interactive items
    // offer audio and video too, as options the run leaves empty).
    await fillAll(page, title, "Choose an image", (i) =>
      putImage(page, `pictures/lesson${n + 1}-${i + 1}.png`),
    );
    if (title === "Seeing the cycle") {
      await fillOne(page, title, "Choose audio", "sound/rain.mp3", MP3);
      await fillOne(page, title, "Choose a video", "video/clouds.mp4", mp4());
      await fillOne(page, title, "Choose a file", "docs/Water cycle.pdf", PDF);
    }
    await describePictures(page, title);
    if (title === "Seeing the cycle") {
      const address = blocksOf(page, title).getByRole("textbox", {
        name: "Web address or embed code",
      });
      await address.fill("https://youtu.be/aqz-KE-bpKQ");
      await address.press("Enter");
      await expect(
        blocksOf(page, title).getByText("Plays from YouTube when a learner asks for it."),
      ).toBeVisible();
    }
  }

  // 3. The quiz: one single-choice question, by keyboard.
  await goTo(page, QUIZ);
  await page.getByRole("button", { name: "Add a question" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Single choice" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Question 1 of 1" })).toBeFocused();
  await goTo(page, "Course overview");

  // 4. Theme: the bold layout and a suggested colour; navigation: the overlay menu and floating
  //    lesson buttons. Each section saved by keyboard.
  await tools(page).getByRole("button", { name: "Theme" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Theme" })).toBeFocused();
  const section = (name: string) =>
    page
      .getByRole("navigation", { name: "Theme settings" })
      .getByRole("button", { name: new RegExp(`^${name}`) });
  const saveSection = async (name: string) => {
    await pressTo(page, panel(page).getByRole("button", { name: "Save", exact: true }));
    await page.keyboard.press("Enter");
    await expect(section(name)).toBeFocused();
  };
  await pressTo(page, section("Layout style"));
  await page.keyboard.press("Enter");
  // Into the list of styles, then down to the bold one.
  const focusedOption = page.locator("[role=option]:focus");
  for (let i = 0; i < 20 && (await focusedOption.count()) === 0; i++) {
    await page.keyboard.press("Tab");
  }
  await pressTo(page, page.getByRole("option", { name: /^Bold/ }), "ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByRole("option", { name: /^Bold/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await saveSection("Layout style");
  await pressTo(page, section("Colours"));
  await page.keyboard.press("Enter");
  await pressTo(page, page.getByRole("button", { name: "#285f9f" }));
  await page.keyboard.press("Enter");
  await saveSection("Colours");
  await pressTo(page, section("Navigation"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Navigation" })).toBeFocused();
  await chooseByKeyboard(page, "Menu type", "Overlay menu");
  await pressTo(page, panel(page).getByRole("tab", { name: "Menu" }), "Shift+Tab");
  await page.keyboard.press("ArrowRight");
  await chooseByKeyboard(page, "Placement", "Floating");
  await saveSection("Navigation");
  let course = await saved(page);
  expect(course.theme).toMatchObject({ layout: "bold", color: "#285f9f" });
  expect(course.navigation).toMatchObject({ menu: "overlay", pageButtons: "floating" });
  await page.getByRole("button", { name: "Back to the course" }).click();

  // 5. The preview: the real player shows every lesson with each of its blocks, and the quiz passes.
  const lessons = course.entries.filter((entry): entry is LessonEntry => entry.kind === "lesson");
  expect(lessons.map((lesson) => lesson.blocks.length)).toEqual(
    LESSONS.map((lesson) => lesson.types.length),
  );
  await tools(page).getByRole("button", { name: "Preview" }).click();
  const frame = page.frameLocator(FRAME);
  await frame.getByRole("link", { name: "Begin course" }).click();
  for (const lesson of lessons) {
    await frame.locator("body").evaluate((_, id) => {
      location.hash = `#/lessons/${id}`;
    }, lesson.id);
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
    for (const block of lesson.blocks) {
      await expect(frame.locator(`[data-block="${block.id}"]`), block.variant).toHaveCount(1);
    }
  }
  const quiz = course.entries.find((entry): entry is QuizEntry => entry.kind === "quiz");
  await frame.locator("body").evaluate((_, id) => {
    location.hash = `#/lessons/${id}`;
  }, quiz?.id);
  await frame.getByRole("button", { name: "Begin quiz" }).click();
  await frame.getByRole("radio", { name: "A right answer" }).check();
  await frame.getByRole("button", { name: "Submit" }).click();
  await frame.getByRole("button", { name: "See your result" }).click();
  await expect(frame.locator(".quiz-outcome")).toHaveText("Passed");
  await page.getByRole("button", { name: "Edit" }).click();

  // 6. Publish: SCORM 1.2 (the default), complete when the quiz is finished, passed or failed.
  await tools(page).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Publish" })).toBeFocused();
  await expect(select(page, "Output")).toContainText("SCORM 1.2");
  await chooseByKeyboard(page, "The course is complete when", "Learners finish a quiz");
  await chooseByKeyboard(page, "What the learning system records", "Passed, or failed");
  await expect(panel(page)).toContainText("Nothing to look at.");
  await pressTo(page, panel(page).getByRole("button", { name: "Export", exact: true }));
  await page.keyboard.press("Enter");
  const done = page.getByRole("dialog", { name: "Package saved" });
  await expect(done.getByRole("status")).toContainText(`${PACKAGE} is saved`);
  await page.keyboard.press("Enter");
  await expect(done).toHaveCount(0);

  course = await saved(page);
  expect(course.publish).toMatchObject({
    standard: "scorm12",
    tracking: { kind: "quiz", quiz: quiz?.id },
    statusWording: { done: "passed", notDone: "failed" },
  });
  const zip = await bytesOf(page, PACKAGE);
  const read = await readZip(zip);
  if (!read.ok) throw new Error(`${PACKAGE} is not a readable zip`);
  const manifest = new TextDecoder().decode(await read.value.read("imsmanifest.xml"));
  expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
  expect(manifest).toContain("<adlcp:masteryscore>80</adlcp:masteryscore>");

  // Offline from start to end, with no uncaught error.
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);

  const out = resolve(process.env.EXIT_RUN_OUT ?? test.info().outputPath());
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "course.zip"), zip);
  writeFileSync(join(out, "course.json"), JSON.stringify(course, null, 2));
});
