// Media intake, media blocks and captions (M2-13; ENG-14 basic, BLK-05, ENG-07 captions) in
// Chromium against the in-memory host: images, galleries, audio, video with caption tracks and
// the caption editor, web embeds, files to download, narration, cover and header images, the
// converter flow (a stand-in converter with `?converter`), by keyboard and by pointer, with axe on
// every new screen in both themes.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import {
  type Block,
  type Course,
  type LessonEntry,
  type MediaEntry,
  SCHEMA_VERSION,
} from "@course-suite/format";
import { mediaCourse } from "@course-suite/format/test/courses";
import { memoryProjectFiles, openProject, readAsset } from "@course-suite/project";
import { readZip, type ZipArchive } from "@course-suite/zip";
import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { back, button, bytesOf, card, courseIn, heading, launch, openFixture } from "./helpers.ts";

const FILE = "River walk.crs";

/** A course with one empty lesson. */
function river(): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "5b2f3c1d-7e8a-4b9c-8d0e-1f2a3b4c5d6e",
    kind: "course",
    title: "River walk",
    entries: [
      { id: "lessriver1", kind: "lesson", title: "On the bank", blocks: [] },
      { id: "lessriver2", kind: "lesson", title: "In the water", blocks: [] },
    ],
    media: [],
  };
}

const blocksOf = (page: Page) => page.getByRole("grid", { name: "Blocks of On the bank" });
const row = (page: Page, name: string | RegExp) =>
  blocksOf(page).getByRole("row", { name, exact: typeof name === "string" });
const saveState = (page: Page) => page.locator(".be-bar [role=status]");

async function openRiver(page: Page, query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, river());
  await page.getByRole("button", { name: "Open On the bank" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "On the bank" })).toBeFocused();
}

async function saved(page: Page): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, FILE);
}

const lessonOf = (course: Course, id = "lessriver1") =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;

/** Adds a block from the library at the end of the lesson, by keyboard. */
async function addBlock(page: Page, type: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type(type);
  const library = page.getByRole("listbox", { name: "Block library" });
  const option = library.getByRole("option", { name: type, exact: true });
  await expect(option).toBeVisible();
  await page.keyboard.press("Tab");
  // Arrows walk the matches to the one wanted.
  for (let i = 0; i < 10 && !(await option.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(option).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Block library" })).toHaveCount(0);
}

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

/** A PNG of the given size drawn by the browser's canvas, put on the disk to pick next. */
async function putImage(page: Page, id: string, width: number, height: number): Promise<void> {
  await page.evaluate(
    async ([id, width, height]) => {
      const canvas = new OffscreenCanvas(width as number, height as number);
      const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      context.fillStyle = "#2a6f97";
      context.fillRect(0, 0, width as number, height as number);
      context.fillStyle = "#f2c14e";
      context.fillRect(0, 0, (width as number) / 2, (height as number) / 2);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      window.editorTest.host.disk.set(id as string, new Uint8Array(await blob.arrayBuffer()));
      window.editorTest.open = [id as string];
    },
    [id, width, height] as const,
  );
}

/** Drops files on a drop zone the way a desktop drag does. */
async function drop(
  page: Page,
  zone: Locator,
  dropped: { name: string; type: string; text?: string; image?: [number, number] }[],
): Promise<void> {
  const transfer = await page.evaluateHandle(async (list) => {
    const data = new DataTransfer();
    for (const { name, type, text, image } of list) {
      let body: BlobPart = text ?? "";
      if (image) {
        const canvas = new OffscreenCanvas(image[0], image[1]);
        const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
        context.fillStyle = "#3d7a4f";
        context.fillRect(0, 0, image[0], image[1]);
        body = await canvas.convertToBlob({ type: "image/png" });
      }
      data.items.add(new File([body], name, { type }));
    }
    return data;
  }, dropped);
  for (const type of ["dragenter", "dragover", "drop"]) {
    await zone.dispatchEvent(type, { dataTransfer: transfer });
  }
}

/** A minimal MP4 with these tracks' codecs, enough for the editor to call it web-ready. */
function mp4(...codecs: string[]): Uint8Array {
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
  const traks = codecs.map((codec) =>
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

/** Turns a switch or checkbox over by keyboard. */
async function toggle(page: Page, control: Locator): Promise<void> {
  const before = await control.isChecked();
  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toBeChecked({ checked: !before });
}

const media = (course: Course, key: string | undefined) =>
  course.media.find((entry) => entry.key === key) as MediaEntry;

test.describe("images and galleries", () => {
  test("[rise:3C] blocks-editor W15, L17, 2.10, 2.17, UI-ACCESSIBILITY-R34, BLK-04: by keyboard alone, an image block takes an image from the open dialog, scaled down in the app, with alt text or the decorative mark and a caption, one undo step each", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Centred image");
    const block = row(page, /^Centred image/);
    const choose = block.getByRole("button", { name: "Choose an image" });
    await expect(choose).toBeFocused();
    await putImage(page, "photos/heron.png", 2400, 1200);
    await page.keyboard.press("Enter");
    await expect(block.getByText("File: heron.png")).toBeVisible();
    await expect(block.locator(".be-block-preview img")).toHaveAttribute("width", "1920");
    // No alt text yet: a warning until the author writes it or marks the image decorative.
    await expect(block.getByText("Describe this image, or mark it decorative.")).toBeVisible();
    await block.getByRole("textbox", { name: "Alternative text" }).focus();
    await page.keyboard.type("A heron in the reeds");
    await page.keyboard.press("Enter");
    await expect(block.getByText("Describe this image, or mark it decorative.")).toHaveCount(0);
    await block.getByRole("textbox", { name: "Caption" }).focus();
    await page.keyboard.type("Herons fish at dawn.");
    await page.keyboard.press("Tab");
    let course = await saved(page);
    let [image] = lessonOf(course).blocks;
    expect(image).toMatchObject({
      category: "image",
      variant: "centered",
      media: [{ alt: "A heron in the reeds" }],
      items: [{ kind: "content", text: "<p>Herons fish at dawn.</p>" }],
    });
    // Scaled in the app to 1920 px on its long side (2.17), stored under its content hash.
    const entry = media(course, image?.media?.[0]?.key);
    expect(entry).toMatchObject({ mimeType: "image/png", width: 1920, height: 960 });
    expect(entry.key).toMatch(/^[0-9a-f]{64}\.png$/);

    // Decorative: an empty alt text, the field closed.
    await block.getByRole("checkbox", { name: "Decorative image (no alternative text)" }).focus();
    await page.keyboard.press("Space");
    await expect(block.getByRole("textbox", { name: "Alternative text" })).toBeDisabled();
    course = await saved(page);
    expect(lessonOf(course).blocks[0]?.media).toEqual([{ key: entry.key, alt: "" }]);
    // Undo takes the mark back, then the caption: one step each.
    await heading(page, "River walk").click();
    await page.keyboard.press("Control+Z");
    await expect(block.getByRole("textbox", { name: "Alternative text" })).toHaveValue(
      "A heron in the reeds",
    );
    await page.keyboard.press("Control+Z");
    await expect(block.getByRole("textbox", { name: "Caption" })).toHaveText("");

    // The same file again is stored once: one media entry and one file in the project.
    await addBlock(page, "Full-width image");
    await putImage(page, "photos/heron.png", 2400, 1200);
    await page.keyboard.press("Enter");
    await expect(row(page, /^Full-width image/).getByText("File: heron.png")).toBeVisible();
    course = await saved(page);
    [image] = lessonOf(course).blocks;
    expect(lessonOf(course).blocks.map((one) => one.media?.[0]?.key)).toEqual([
      entry.key,
      entry.key,
    ]);
    expect(course.media.filter((one) => one.key === entry.key)).toHaveLength(1);
  });

  test("[rise:3C] blocks-editor 2.11, UI-BLOCKS-EDITOR-R25, D-38: images dropped on a gallery each get alt text and a caption; a file that is not an image is refused; variants switch keeping the images", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Grid of three columns");
    const block = row(page, "Grid of three columns");
    await drop(page, block.locator(".be-drop"), [
      { name: "reeds.png", type: "image/png", image: [300, 200] },
      { name: "notes.txt", type: "text/plain", text: "not a picture" },
      { name: "path.png", type: "image/png", image: [400, 300] },
      { name: "fake.png", type: "image/png", text: "not a png either" },
    ]);
    const notice = page.getByRole("alertdialog", { name: "2 files were not added" });
    await expect(notice).toContainText(
      "notes.txt is not an image this editor takes. Use JPG, JPEG, PNG, GIF, WEBP, AVIF, SVG, BMP.",
    );
    await expect(notice).toContainText("fake.png is not a readable image.");
    await notice.getByRole("button", { name: "OK" }).click();
    await expect(block.getByRole("group", { name: /^Image \d$/ })).toHaveCount(2);
    await expect(block.locator(".be-block-preview img")).toHaveCount(2);
    const second = block.getByRole("group", { name: "Image 2" });
    await second.getByRole("textbox", { name: "Alternative text" }).fill("The path");
    await second.getByRole("textbox", { name: "Alternative text" }).press("Enter");
    await second.getByRole("button", { name: "Move image 2 up" }).click();
    let course = await saved(page);
    const gallery = lessonOf(course).blocks[0] as Block;
    expect(gallery.items?.map((item) => item.kind === "content" && item.media?.alt)).toEqual([
      "The path",
      undefined,
    ]);
    // Switching to a carousel keeps the images (W8, UI-BLOCKS-EDITOR-R25).
    await block.getByRole("button", { name: /Block type/ }).click();
    await page.getByRole("option", { name: "Image carousel" }).click();
    course = await saved(page);
    expect(lessonOf(course).blocks[0]).toMatchObject({
      variant: "carousel",
      items: gallery.items,
    });
  });
});

test.describe("audio, video and the converter", () => {
  test("D-12, BLK-05: a web-ready MP4 goes straight in; a file that needs converting is refused where the edition cannot convert, saying what to add instead", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Video");
    const block = row(page, /^Video/);
    await putFile(page, "clips/otters.mp4", mp4("avc1", "mp4a"));
    await block.getByRole("button", { name: "Choose a video" }).click();
    await expect(block.getByText("File: otters.mp4")).toBeVisible();
    await putFile(page, "clips/otters.mov", mp4("avc1", "mp4a"));
    await block.getByRole("button", { name: "Replace the video" }).click();
    const notice = page.getByRole("alertdialog", { name: "A file was not added" });
    await expect(notice).toContainText(
      "otters.mov needs converting before learners can play it, which only the desktop app does. Add an MP4 (H.264 and AAC), WebM, MP3 or M4A file instead.",
    );
    await notice.getByRole("button", { name: "OK" }).click();
    const course = await saved(page);
    const video = lessonOf(course).blocks[0] as Block;
    expect(media(course, video.media?.[0]?.key)).toMatchObject({ mimeType: "video/mp4" });
  });

  test("D-12, D-43, ENG-15, BLK-05: the first file that needs converting asks to download the converter; download and conversion show progress and can be cancelled; once there it is not asked for again", async ({
    page,
  }) => {
    await openRiver(page, "?converter");
    await addBlock(page, "Audio");
    const block = row(page, /^Audio/);
    await putFile(page, "sound/stream.wav", "RIFF....WAVEfmt ");
    await block.getByRole("button", { name: "Choose audio" }).click();
    const ask = page.getByRole("alertdialog", { name: "Download the media converter?" });
    await expect(ask).toContainText(
      "Stand-in converter 1.0, 77 MB, free software under LGPL-3.0-or-later, downloaded from its public release on GitHub",
    );
    // Not now: nothing is downloaded or added.
    await ask.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("alertdialog", { name: "A file was not added" })).toContainText(
      "stream.wav was not added: it needs the media converter.",
    );
    await page.getByRole("button", { name: "OK" }).click();
    expect(await page.evaluate(() => window.editorTest.converter.calls)).toEqual([]);

    // Download: progress in bytes, then the conversion's own progress.
    await block.getByRole("button", { name: "Choose audio" }).click();
    await ask.getByRole("button", { name: "Download" }).click();
    const download = page.getByRole("dialog", { name: "Downloading Stand-in converter 1.0" });
    await expect(download.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuetext",
      "38.5 MB of 77 MB",
    );
    await page.evaluate(() => window.editorTest.converter.finish());
    const converting = page.getByRole("dialog", { name: "Converting stream.wav" });
    await expect(converting.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "50%");
    // Cancel stops the conversion: nothing is added, and no notice.
    await converting.getByRole("button", { name: "Cancel" }).click();
    await expect(converting).toHaveCount(0);
    await expect(block.getByText("No file yet.")).toBeVisible();

    // Again, by dropping the file: no question now, and the converted MP3 goes in.
    await drop(page, block.locator(".be-drop"), [
      { name: "stream.wav", type: "audio/wav", text: "RIFF....WAVEfmt " },
    ]);
    await expect(page.getByRole("dialog", { name: "Converting stream.wav" })).toBeVisible();
    await page.evaluate(() => window.editorTest.converter.finish());
    await expect(block.getByText("File: stream.mp3")).toBeVisible();
    const calls = await page.evaluate(() => window.editorTest.converter.calls);
    expect(calls[0]).toBe("install");
    expect(calls[1]).toBe("convert audio sound/stream.wav");
    // A dropped file has no path: it went to the app data folder for the converter.
    expect(calls[2]).toMatch(/^convert audio appdata\/media-work\/[0-9a-f-]{36}\.wav$/);
    const course = await saved(page);
    const audio = lessonOf(course).blocks[0] as Block;
    expect(media(course, audio.media?.[0]?.key)).toMatchObject({ mimeType: "audio/mpeg" });
  });

  test("[rise:3G] UI-BLOCKS-EDITOR-R37, 2.12, W17: audio takes a caption, a transcript and forward seeking off; a video a transcript and a thumbnail, by keyboard; the video speed setting covers every video", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Audio");
    const block = row(page, /^Audio/);
    await putFile(page, "sound/stream.mp3", new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]));
    await block.getByRole("button", { name: "Choose audio" }).click();
    await expect(block.getByText("File: stream.mp3")).toBeVisible();
    await block.getByRole("textbox", { name: "Transcript" }).fill("Water runs over stones.");
    await block.getByRole("textbox", { name: "Transcript" }).blur();
    await toggle(page, block.getByRole("switch", { name: "Learners can skip ahead" }));
    await addBlock(page, "Video");
    const video = row(page, /^Video/);
    await toggle(
      page,
      video.getByRole("switch", { name: "Learners can change the playback speed" }),
    );
    // Transcript and thumbnail, by keyboard alone.
    await video.getByRole("textbox", { name: "Transcript" }).focus();
    await page.keyboard.type("Two otters roll in the shallows.");
    await page.keyboard.press("Tab");
    await putImage(page, "photos/otters.png", 640, 360);
    await video.getByRole("button", { name: "Choose a thumbnail image" }).focus();
    await page.keyboard.press("Enter");
    const thumbnail = video.getByRole("group", { name: "Thumbnail" });
    await expect(thumbnail.getByText("File: otters.png")).toBeVisible();
    let course = await saved(page);
    expect(lessonOf(course).blocks[0]?.variantSettings).toEqual({
      transcript: "Water runs over stones.",
      forwardSeeking: false,
    });
    expect(course.navigation).toEqual({ videoSpeed: false });
    const poster = lessonOf(course).blocks[1]?.variantSettings?.poster as { key: string };
    expect(lessonOf(course).blocks[1]?.variantSettings).toEqual({
      transcript: "Two otters roll in the shallows.",
      poster: { key: expect.stringMatching(/^[0-9a-f]{64}\.png$/) },
    });
    expect(media(course, poster.key)).toMatchObject({ mimeType: "image/png", width: 640 });
    await thumbnail.getByRole("button", { name: "Remove the thumbnail" }).focus();
    await page.keyboard.press("Enter");
    course = await saved(page);
    expect(lessonOf(course).blocks[1]?.variantSettings).toEqual({
      transcript: "Two otters roll in the shallows.",
    });
  });
});

/** The saved course file's project: its course and its media files. */
async function savedProject(page: Page) {
  const disk = memoryProjectFiles();
  disk.files.set(FILE, await bytesOf(page, FILE));
  const opened = await openProject(disk, FILE);
  if (!opened.ok) throw new Error(JSON.stringify(opened.problems));
  return opened.project;
}

/** The plain web package of the saved course, as the exporters build it. */
async function webPackage(page: Page) {
  const project = await savedProject(page);
  const built = await buildPackage({
    course: project.course,
    player: blocksPlayer(),
    exporter: webExporter(),
    media: (key) => readAsset(project, key),
    packageVersion: 1,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  const zip = await readZip(built.value.zip);
  if (!zip.ok) throw new Error("unreadable package");
  return { files: built.value.files, zip: zip.value, course: project.course };
}

/** Writes the package to a new folder and returns the address of its index page. */
async function unpacked(zip: ZipArchive): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "media-package-"));
  for (const name of zip.names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), (await zip.read(name)) as Uint8Array);
  }
  return pathToFileURL(join(dir, "index.html")).href;
}

const CAPTIONS = [
  "WEBVTT",
  "",
  "00:00:00.500 --> 00:00:02.000 line:85%",
  "<c.loud>The otters</c> come out",
  "",
  "00:00:02.000 --> 00:00:04.250",
  "at <b>dusk</b>.",
  "",
].join("\n");

const shownFrame = (page: Page) =>
  page.frameLocator("iframe[title='Course preview']:not([data-pending])");

test.describe("captions", () => {
  test("[rise:3C] UI-ACCESSIBILITY-R41, accessibility.md BA4, BA5, W19, W20, D3, BLK-05: caption files per language; the caption editor splits, adds and joins captions by keyboard and changes the language; edits show in the preview and ship as WebVTT in the package; a track is saved as a copy (B5)", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Video");
    const block = row(page, /^Video/);
    await putFile(page, "clips/otters.mp4", mp4("avc1", "mp4a"));
    await block.getByRole("button", { name: "Choose a video" }).click();
    const captions = block.getByRole("group", { name: "Captions" });
    await expect(captions.getByText("No caption files yet.")).toBeVisible();
    const add = captions.getByRole("button", { name: "Add a caption file" });
    await expect(add).toBeDisabled();
    const language = captions.getByRole("textbox", { name: "Language code of a new caption file" });
    await language.fill("fr");
    // A file that is not WebVTT is refused (B5: VTT only, with its header).
    await putFile(page, "subs/otters.vtt", "1\n00:00:00,500 --> 00:00:02,000\nLes loutres\n");
    await add.click();
    await expect(page.getByRole("alertdialog", { name: "A file was not added" })).toContainText(
      "otters.vtt cannot be read as WebVTT captions: line 1 does not start with WEBVTT.",
    );
    await page.getByRole("button", { name: "OK" }).click();
    await putFile(page, "subs/otters.fr.vtt", CAPTIONS);
    await add.click();
    await expect(captions.getByText("French (fr)")).toBeVisible();
    // One file per language.
    await language.fill("FR");
    await expect(language).toHaveAttribute("aria-invalid", "true");
    await expect(
      captions.getByText("This video has captions in this language already."),
    ).toBeVisible();
    await language.fill("");

    // The caption editor, by keyboard.
    await captions.getByRole("button", { name: "Edit the French (fr) captions" }).focus();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("dialog", { name: "Captions in French (fr)" });
    const text = (number: number) =>
      editor.getByRole("textbox", { name: `Text of caption ${number}` });
    // Dropped markup is gone (B5); kept markup stays.
    await expect(text(1)).toHaveValue("The otters come out");
    await expect(text(2)).toHaveValue("at <b>dusk</b>.");
    // Enter splits at the cursor, the time in proportion to the text.
    await text(1).focus();
    await page.keyboard.press("End");
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(text(2)).toBeFocused();
    await expect(text(1)).toHaveValue("The otters");
    await expect(text(2)).toHaveValue(" come out");
    const ends = (number: number) =>
      editor.getByRole("group", { name: `Caption ${number}` }).getByRole("textbox", {
        name: "Ends at",
      });
    await expect(ends(1)).toHaveValue("00:00:01.289");
    // Delete at the end of caption 2 joins caption 3 to it.
    await page.keyboard.press("End");
    await page.keyboard.press("Delete");
    await expect(text(2)).toHaveValue(" come out at <b>dusk</b>.");
    await expect(text(3)).toHaveCount(0);
    // Enter at the very end adds a caption after it, from its end; it can be removed again.
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(text(3)).toBeFocused();
    await expect(
      editor.getByRole("group", { name: "Caption 3" }).getByRole("textbox", { name: "Starts at" }),
    ).toHaveValue("00:00:04.250");
    await editor.getByRole("button", { name: "Remove caption 3" }).click();
    await expect(text(3)).toHaveCount(0);
    // A time that is not hh:mm:ss.ttt blocks saving.
    await ends(2).fill("4 seconds");
    await expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();
    await ends(2).fill("00:00:05.000");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toHaveCount(0);

    // The preview shows the edited track at once.
    await button(page, "Preview").click();
    await shownFrame(page)
      .getByRole("link", { name: /On the bank/ })
      .first()
      .click();
    const track = shownFrame(page).locator("video track[srclang=fr]");
    await expect(track).toHaveAttribute("label", "French");
    // The browser reads the track it is given: the edited cues.
    const cues = await track.evaluate(async (element) => {
      const { track } = element as HTMLTrackElement;
      track.mode = "hidden";
      while (!track.cues?.length) await new Promise((resolve) => setTimeout(resolve, 20));
      return [...track.cues].map((cue) => {
        const { startTime, endTime, text } = cue as VTTCue;
        return [startTime, endTime, text];
      });
    });
    expect(cues).toEqual([
      [0.5, 1.289, "The otters"],
      // Saving trims each caption line.
      [1.289, 5, "come out at <b>dusk</b>."],
    ]);
    // Both halves of the split caption keep its position setting.
    const vtt =
      "WEBVTT\n\n00:00:00.500 --> 00:00:01.289 line:85%\nThe otters\n\n00:00:01.289 --> 00:00:05.000 line:85%\ncome out at <b>dusk</b>.\n";
    await page.getByRole("button", { name: "Edit" }).click();
    await saved(page);

    // The package carries it as WebVTT, and only what the course uses: the old track is left out.
    const { files, zip, course } = await webPackage(page);
    const video = lessonOf(course).blocks[0] as Block;
    const [french] = video.media?.[0]?.captions ?? [];
    expect(french?.language).toBe("fr");
    expect(files.filter((path) => path.startsWith("media/")).sort()).toEqual(
      [`media/${french?.key}`, `media/${video.media?.[0]?.key}`].sort(),
    );
    expect(new TextDecoder().decode(await zip.read(`media/${french?.key}`))).toBe(vtt);
    expect(course.media).toHaveLength(3);

    // A copy of a track is saved where the author picks (B5 "download each track as VTT").
    await page.evaluate(() => {
      window.editorTest.save = "exports/otters.vtt";
    });
    await captions.getByRole("button", { name: "Save a copy of the French (fr) captions" }).click();
    await expect
      .poll(async () => new TextDecoder().decode(await bytesOf(page, "exports/otters.vtt")))
      .toBe(vtt);
    // The caption editor also changes a track's language (BA5), one per language.
    await captions.getByRole("button", { name: "Edit the French (fr) captions" }).click();
    const trackLanguage = editor.getByRole("textbox", { name: "Language code" });
    await trackLanguage.fill("fr-ca");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(captions.getByText("Canadian French (fr-CA)")).toBeVisible();
    const relabelled = lessonOf(await saved(page)).blocks[0] as Block;
    expect(relabelled.media?.[0]?.captions).toEqual([{ key: french?.key, language: "fr-CA" }]);
  });
});

test.describe("embeds, files and narration", () => {
  test("[rise:3C] D-44, ADR-0004, blocks-editor W18, 2.12, BLK-05: an embed takes a listed provider's link; the published package loads nothing from outside until the learner asks, then only the provider's frame", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Web page or embed");
    const block = row(page, /^Web page or embed/);
    const address = block.getByRole("textbox", { name: "Web address or embed code" });
    await address.fill("https://example.com/watch?v=aqz-KE-bpKQ");
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await expect(
      block.getByText("Paste a link or embed code from YouTube, Vimeo, Loom, Dailymotion."),
    ).toBeVisible();
    await address.fill("https://youtu.be/aqz-KE-bpKQ?t=42");
    await address.press("Enter");
    await expect(block.getByText("Plays from YouTube when a learner asks for it.")).toBeVisible();
    const course = await saved(page);
    expect(lessonOf(course).blocks[0]?.variantSettings).toEqual({
      url: "https://youtu.be/aqz-KE-bpKQ?t=42",
      embedUrl: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=42",
      provider: "YouTube",
    });
    // The preview says where it plays and loads nothing.
    await button(page, "Preview").click();
    await shownFrame(page)
      .getByRole("link", { name: /On the bank/ })
      .first()
      .click();
    await expect(
      shownFrame(page).getByText("The content from YouTube loads here in the published course."),
    ).toBeVisible();
    await expect(shownFrame(page).locator("iframe")).toHaveCount(0);

    // The published package, opened from disk.
    const index = await unpacked((await webPackage(page)).zip);
    const learner = await page.context().newPage();
    const outside: string[] = [];
    learner.on("request", (request) => {
      if (!request.url().startsWith("file:")) outside.push(request.url());
    });
    await learner.route("https://www.youtube-nocookie.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Player</title>" }),
    );
    await learner.goto(`${index}#/lessons/lessriver1`);
    const load = learner.getByRole("button", { name: "Show the content from YouTube" });
    await expect(load).toBeVisible();
    await expect(load).toHaveAccessibleDescription("It loads from YouTube, outside this course.");
    expect(outside).toEqual([]);
    await load.click();
    const frame = learner.getByTitle("Content from YouTube");
    await expect(frame).toBeFocused();
    await expect(frame).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=42",
    );
    await expect
      .poll(() => outside)
      .toEqual(["https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=42"]);
    await learner.close();
  });

  test("[rise:3C] [rise:3D] blocks-editor W16, 2.4, 2.12, UI-BLOCKS-R19: a file to download shows its name and size; narration goes on a block at the top with its transcript, and never on a heading", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "File to download");
    const attachment = row(page, /^File to download/);
    await putFile(page, "docs/River map.pdf", `%PDF-1.7\n${"x".repeat(24_000)}`);
    await attachment.getByRole("button", { name: "Choose a file" }).click();
    await expect(attachment.getByText("File: River map.pdf, 24 kB")).toBeVisible();
    await addBlock(page, "Heading");
    await expect(row(page, /^Heading/).getByRole("button", { name: "Narration" })).toHaveCount(0);
    await addBlock(page, "Paragraph");
    const paragraph = row(page, /^Paragraph/);
    await paragraph.getByRole("button", { name: "Narration" }).click();
    const menu = page.getByRole("dialog", { name: "Narration" });
    await putFile(page, "sound/reading.mp3", new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]));
    await menu.getByRole("button", { name: "Add narration audio" }).click();
    await expect(menu.getByText("File: reading.mp3")).toBeVisible();
    await menu.getByRole("button", { name: /Narration player/ }).click();
    await page.getByRole("option", { name: "At the top of the block" }).click();
    await menu.getByRole("textbox", { name: "Transcript" }).fill("Read along with me.");
    await menu.getByRole("button", { name: "Remove the narration" }).focus();
    await page.keyboard.press("Escape");
    await expect(paragraph.getByRole("button", { name: "Narration (on)" })).toBeVisible();
    const course = await saved(page);
    const [file, , text] = lessonOf(course).blocks;
    expect(file?.variantSettings).toEqual({ fileName: "River map.pdf", fileSize: 24_009 });
    expect(text?.settings?.narration).toMatchObject({
      position: "top",
      transcript: "<p>Read along with me.</p>",
    });
    // The player: the download link, and the narration above the paragraph.
    await button(page, "Preview").click();
    await shownFrame(page)
      .getByRole("link", { name: /On the bank/ })
      .first()
      .click();
    const link = shownFrame(page).getByRole("link", { name: "Download River map.pdf" });
    await expect(link).toHaveAttribute("download", "River map.pdf");
    const narrated = shownFrame(page).locator(".block-inner:has(.narration)");
    await expect(narrated.locator("> :first-child")).toHaveClass("narration");
    await expect(narrated.getByText("Transcript")).toBeVisible();
  });
});

test.describe("block backgrounds", () => {
  test("[rise:3D] blocks-editor L9, W10, 2.4, UI-BLOCKS-EDITOR-R22: by keyboard, a block takes an image background with a dark overlay at 50 % that a light one replaces, each one undo step, drawn by the player", async ({
    page,
  }) => {
    await openRiver(page);
    await addBlock(page, "Paragraph");
    const paragraph = row(page, /^Paragraph/);
    await paragraph.getByRole("button", { name: "Style", exact: true }).focus();
    await page.keyboard.press("Enter");
    const style = page.getByRole("dialog", { name: "Style" });
    await style.getByRole("button", { name: /Background/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Image" }).focus();
    await page.keyboard.press("Enter");
    // Nothing changes until there is an image.
    const choose = style.getByRole("button", { name: "Choose an image" });
    await choose.focus();
    await putImage(page, "photos/reeds.png", 900, 600);
    await page.keyboard.press("Enter");
    await expect(style.getByRole("button", { name: /Overlay/ })).toBeVisible();
    let course = await saved(page);
    const background = lessonOf(course).blocks[0]?.settings?.background;
    const key = background?.kind === "image" ? background.image.key : "";
    expect(lessonOf(course).blocks[0]?.settings).toEqual({
      background: { kind: "image", image: { key, alt: "" }, overlay: "dark", opacity: 50 },
    });
    expect(media(course, key)).toMatchObject({ mimeType: "image/png", width: 900 });
    // The block's preview: the picture under a dark tint, with light text.
    const drawn = paragraph.locator(".be-block-preview [data-block]");
    await expect(drawn).toHaveClass(/text-light/);
    await expect(drawn).toHaveCSS("background-image", /rgba\(0, 0, 0, 0\.5\).*blob:/);

    await style.getByRole("button", { name: /Overlay/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Light, with dark text" }).focus();
    await page.keyboard.press("Enter");
    await expect(drawn).toHaveClass(/text-dark/);
    course = await saved(page);
    expect(lessonOf(course).blocks[0]?.settings?.background).toMatchObject({ overlay: "light" });
    // Undo goes back to the dark overlay, then to no background at all.
    await page.keyboard.press("Escape");
    await heading(page, "River walk").click();
    await page.keyboard.press("Control+Z");
    await expect(drawn).toHaveClass(/text-light/);
    await page.keyboard.press("Control+Z");
    await expect(drawn).not.toHaveClass(/has-background/);
  });
});

test.describe("cover and header images", () => {
  test("[rise:3B] [rise:3E] D-38, blocks-editor 2.2, H8, T4, T6: the course cover and a lesson's header image, with alt text; the cover shows on the dashboard card and both in the player", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, river());
    const cover = page.getByRole("group", { name: "Cover image" });
    await putImage(page, "photos/cover.png", 1200, 600);
    await cover.getByRole("button", { name: "Choose an image" }).click();
    await cover.getByRole("textbox", { name: "Alternative text" }).fill("A path by the river");
    await cover.getByRole("textbox", { name: "Alternative text" }).press("Enter");
    await page.getByRole("button", { name: "Open On the bank" }).click();
    const header = page.getByRole("group", { name: "Header image" });
    await putImage(page, "photos/header.png", 1600, 400);
    await header.getByRole("button", { name: "Choose an image" }).click();
    await header.getByText("Decorative image (no alternative text)").click();
    const course = await saved(page);
    expect(course.cover).toMatchObject({ alt: "A path by the river" });
    expect(lessonOf(course).headerImage).toMatchObject({ alt: "" });

    // The player: the cover page and the lesson header.
    await button(page, "Preview").click();
    await expect(shownFrame(page).locator(".lesson-header-image")).toHaveAttribute("alt", "");
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: /Go to$/ }).click();
    await page.getByRole("option", { name: "Course overview" }).click();
    await button(page, "Preview").click();
    await expect(shownFrame(page).getByRole("img", { name: "A path by the river" })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();

    // The dashboard card shows a small copy of the cover, kept in the app data folder.
    await back(page);
    const picture = card(page, "River walk").locator(".be-cover img");
    await expect(picture).toHaveAttribute("src", /^blob:/);
    await expect(picture).toHaveAttribute("alt", "");
    expect(await picture.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(480);
    const kept = await page.evaluate(() =>
      [...window.editorTest.host.disk.keys()].filter((id) => id.startsWith("appdata/covers/")),
    );
    expect(kept).toEqual([`appdata/covers/${course.cover?.key}`]);
  });

  test("[rise:3E] blocks-editor 2.2: removing the cover takes the picture off the card", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, river());
    const cover = page.getByRole("group", { name: "Cover image" });
    await putImage(page, "photos/cover.png", 800, 400);
    await cover.getByRole("button", { name: "Choose an image" }).click();
    await cover.getByRole("button", { name: "Remove the cover image" }).click();
    await saved(page);
    await back(page);
    await expect(card(page, "River walk").locator(".be-cover img")).toHaveCount(0);
  });
});

const SVG = (colour: string, width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${colour}"/></svg>`;

/** Every media block's files for the format's media course: SVG pictures and small stand-ins. */
const MEDIA_FILES: Record<string, string> = {
  "cover.svg": SVG("#3d7a4f", 1200, 600),
  "header.svg": SVG("#2a6f97", 1600, 400),
  "heron.svg": SVG("#6b7280", 800, 600),
  "bank.svg": SVG("#1f3b2d", 1600, 900),
  "stream.mp3": "ID3",
  "otters.webm": "stand-in video",
  "otters-en.vtt": "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOtters\n",
  "otters-fr.vtt": "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nLoutres\n",
  "map.pdf": "%PDF-1.7",
};

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on the media screens and in the player output of every media block in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string, where: Page | Frame = page) =>
      expect(await violations(where), `${theme}: ${state}`).toEqual([]);
    await launch(page, `?theme=${theme}&converter`);
    await openFixture(page, "Media.crs", mediaCourse(), MEDIA_FILES);
    await check("overview with the cover image");
    await page.getByRole("button", { name: "Open What you will see" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "What you will see" })).toBeVisible();
    await check("lesson with image and gallery blocks");
    await page.getByRole("button", { name: "Narration" }).first().click();
    await check("narration menu");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Go to$/ }).click();
    await page.getByRole("option", { name: "Listen and watch" }).click();
    await check("lesson with audio, video and narration");
    await page
      .getByRole("row", { name: /^Paragraph/ })
      .getByRole("button", { name: "Style", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /Overlay/ })).toBeVisible();
    await check("style menu with an image background");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit the French (fr) captions" }).click();
    await expect(page.getByRole("textbox", { name: "Text of caption 1" })).toHaveValue("Loutres");
    await check("caption editor");
    await page.keyboard.press("Escape");
    // The converter's question and its progress.
    await putFile(page, "clips/otters.mov", "not web-ready");
    await page.getByRole("button", { name: "Replace the video" }).click();
    await check("converter question");
    await page.getByRole("button", { name: "Download" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "38.5 MB of 77 MB",
    );
    await check("download progress");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    // A refusal notice.
    await putFile(page, "notes/otters.txt", "not a video");
    await page.getByRole("button", { name: "Replace the video" }).click();
    await expect(page.getByRole("alertdialog", { name: "A file was not added" })).toBeVisible();
    await check("refusal notice");
    await page.getByRole("button", { name: "OK" }).click();

    // The player output of every media block: in the preview, then in an exported package.
    await button(page, "Preview").click();
    const frame = await previewFrame(page);
    for (const lesson of ["What you will see", "Listen and watch", "Take it further"]) {
      await frame
        .getByRole("link", { name: new RegExp(lesson) })
        .first()
        .click();
      await expect(frame.getByRole("heading", { level: 1, name: lesson })).toBeVisible();
      await check(`preview: ${lesson}`, frame);
    }
    await frame
      .getByRole("link", { name: /What you will see/ })
      .first()
      .click();
    await frame
      .getByRole("button", { name: /Enlarge image$/ })
      .first()
      .click();
    await expect(frame.getByRole("dialog")).toBeVisible();
    await check("preview: enlarged image", frame);
  });
}

/** The preview frame on show, as a Playwright frame (for axe). */
async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page
    .locator("iframe[title='Course preview']:not([data-pending])")
    .elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("no preview frame");
  return frame;
}
