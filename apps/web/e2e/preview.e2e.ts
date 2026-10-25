// The real-player preview (M2-11, ENG-13) in a browser, on the preview test page, which runs under
// the desktop app's release content security policy (vite.config.ts). Corpus courses come from the
// private iteratecraft/test-courses checkout at `test-courses/`; without it these tests skip.
/// <reference types="node" />
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { type Course, openCourse } from "@course-suite/format";
import type { AdapterCall } from "@course-suite/tracking";
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

const corpus = join(import.meta.dirname, "..", "..", "..", "test-courses", "blocks");
const COURSES = existsSync(corpus)
  ? readdirSync(corpus).filter((name) => existsSync(join(corpus, name, "course.json")))
  : [];
test.skip(COURSES.length === 0, `No test-courses checkout at ${corpus}`);

interface Fixture {
  name: string;
  course: Course;
  media: Record<string, Uint8Array>;
}

function corpusCourse(name: string): Fixture {
  const opened = openCourse(readFileSync(join(corpus, name, "course.json"), "utf8"));
  if (opened.status !== "ok") throw new Error(`${name} does not open: ${opened.status}`);
  const folder = join(corpus, name, "media");
  const media = Object.fromEntries(
    (existsSync(folder) ? readdirSync(folder) : []).map((key) => [
      key,
      new Uint8Array(readFileSync(join(folder, key))),
    ]),
  );
  return { name, course: opened.document, media };
}

const firstPage = (course: Course) => {
  const page = course.entries.find((entry) => entry.kind !== "section");
  if (!page) throw new Error(`${course.title} has no lesson`);
  return page;
};

/** The web package the exporters build for the course, unpacked into a scratch folder. */
async function exportedWebPackage({ course, media }: Fixture): Promise<string> {
  const built = await buildPackage({
    course,
    player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
    exporter: webExporter(),
    media: (key) => media[key],
    packageVersion: 1,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  const zip = await readZip(built.value.zip);
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  const dir = mkdtempSync(join(tmpdir(), "preview-export-"));
  for (const name of zip.value.names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
  }
  return dir;
}

const FRAME = "iframe[title='Course preview']:not([data-pending])";

/** Opens the preview test page on `fixture`, at a lesson when given, once the player shows it. */
async function openPreview(
  page: Page,
  fixture: Fixture,
  { lesson, theme = "light" }: { lesson?: string; theme?: "light" | "dark" } = {},
) {
  const input = {
    course: fixture.course,
    media: Object.fromEntries(
      Object.entries(fixture.media).map(([key, bytes]) => [
        key,
        Buffer.from(bytes).toString("base64"),
      ]),
    ),
  };
  await page.addInitScript((value) => {
    window.previewInput = value;
  }, input);
  await page.goto(`/preview.html?theme=${theme}${lesson ? `&lesson=${lesson}` : ""}`);
  const frame = page.frameLocator(FRAME);
  await expect(frame.locator("#content")).toBeVisible();
  return frame;
}

/** The frame on show, to run script in. */
async function shownFrame(page: Page): Promise<Frame> {
  const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!frame) throw new Error("no preview frame on show");
  return frame;
}

/** Waits until the fonts and every image in view have loaded. */
async function settled(frame: Frame): Promise<void> {
  await frame.evaluate(() => document.fonts.ready);
  await frame.waitForFunction(() =>
    [...document.images].every(
      (image) =>
        image.complete ||
        !image.checkVisibility() ||
        image.getBoundingClientRect().top >= innerHeight,
    ),
  );
}

/** The player's markup, with the preview's in-memory addresses read as the package paths they stand for. */
const appHtml = (frame: Frame) =>
  frame.evaluate(() => {
    let html = document.getElementById("app")?.innerHTML ?? "";
    const files = (window as { blocksPlayerHooks?: { files?: Record<string, string> } })
      .blocksPlayerHooks?.files;
    for (const [path, url] of Object.entries(files ?? {})) html = html.replaceAll(url, path);
    return html;
  });

/** Every call to the debug adapter, with the session time left out (it is the wall clock's). */
const comparable = (calls: AdapterCall[]) =>
  calls.map((call) => (call.method === "writeSessionTime" ? { method: call.method } : call));

/** Does `action` in the preview, then waits until its progress is saved (rise.md rule 3). */
async function saved(page: Page, action: () => Promise<void>): Promise<void> {
  const saves = () =>
    page.evaluate(
      async () =>
        ((await window.previewHandle?.calls()) ?? []).filter(
          (call) => call.method === "writeResume",
        ).length,
    );
  const before = await saves();
  await action();
  await expect.poll(saves).toBeGreaterThan(before);
}

/** Presses `key` until `target` has the focus, at most ten times. */
async function pressUntilFocused(page: Page, key: string, target: Locator): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (
      await target.evaluate(
        (element) =>
          element === element.ownerDocument.activeElement && element.ownerDocument.hasFocus(),
      )
    )
      return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
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

test.describe("the preview and the exported web package", () => {
  for (const name of COURSES) {
    test(`UI-BLOCKS-EDITOR-R52 UI-BLOCKS-EDITOR-R55 [rise:R20] ${name}: the overview and the first lesson render identically at computer, tablet and phone width`, async ({
      page,
      browser,
    }) => {
      const fixture = corpusCourse(name);
      const errors = errorsOf(page);
      const dir = await exportedWebPackage(fixture);
      const exported = await browser.newPage();
      try {
        for (const lesson of [undefined, firstPage(fixture.course).id]) {
          await page.goto("about:blank");
          await openPreview(page, fixture, lesson ? { lesson } : {});
          for (const device of ["Computer", "Tablet", "Phone"]) {
            await page.getByRole("radio", { name: device }).click();
            await expect(page.getByRole("radio", { name: device })).toBeChecked();
            const frameElement = page.locator(FRAME);
            const size = await frameElement.evaluate((element) => ({
              width: element.clientWidth,
              height: element.clientHeight,
            }));
            if (device !== "Computer") expect(size.width).toBe(device === "Tablet" ? 768 : 375);
            await exported.setViewportSize(size);
            await exported.goto(
              `${pathToFileURL(join(dir, "index.html")).href}${lesson ? `#/lessons/${lesson}` : ""}`,
            );
            await expect(exported.locator("#content")).toBeVisible();
            const preview = await shownFrame(page);
            // The player lays out again when its frame changes width; wait for the same page.
            const expected = await appHtml(exported.mainFrame());
            await expect.poll(() => appHtml(preview)).toBe(expected);
            await settled(preview);
            await settled(exported.mainFrame());
            const shot = await frameElement.screenshot();
            const reference = await exported.screenshot();
            if (!shot.equals(reference)) {
              await test
                .info()
                .attach(`preview ${device}`, { body: shot, contentType: "image/png" });
              await test.info().attach(`exported ${device}`, {
                body: reference,
                contentType: "image/png",
              });
            }
            expect(shot.equals(reference), `${lesson ?? "overview"} at ${device} width`).toBe(true);
          }
        }
        expect(errors).toEqual([]);
      } finally {
        await exported.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test("UI-BLOCKS-EDITOR-R53 each device button sets the frame's width, and at tablet width the contents start closed", async ({
  page,
}) => {
  await openPreview(page, corpusCourse("gated-continue"));
  const frame = page.frameLocator(FRAME);
  const width = () => page.locator(FRAME).evaluate((element) => element.clientWidth);
  const paneWidth = await page.locator(".cs-Preview-stage").evaluate((stage) => stage.clientWidth);
  // Computer is the default and gets the whole pane, with the contents open beside the page.
  await expect(page.getByRole("radio", { name: "Computer" })).toBeChecked();
  expect(await width()).toBe(paneWidth);
  await expect(frame.getByRole("navigation", { name: "Course contents" })).toBeVisible();

  await page.getByRole("radio", { name: "Tablet" }).click();
  await expect.poll(width).toBe(768);
  await expect(frame.getByRole("button", { name: "Show contents" })).toBeVisible();
  await expect(frame.getByRole("navigation", { name: "Course contents" })).toBeHidden();

  await page.getByRole("radio", { name: "Phone" }).click();
  await expect.poll(width).toBe(375);
  await expect(page.getByRole("radio", { name: "Tablet" })).not.toBeChecked();
});

test("UI-BLOCKS-EDITOR-R52 updates after a command once the author pauses, at the same lesson, scroll position and progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  const fixture = corpusCourse("gated-continue");
  const lesson = firstPage(fixture.course);
  if (lesson.kind !== "lesson") throw new Error("the first page is not a lesson");
  const frame = await openPreview(page, fixture, { lesson: lesson.id });
  await saved(page, () => frame.getByRole("button", { name: "Continue", exact: true }).click());
  await expect(frame.getByRole("button", { name: "I have read all three" })).toBeVisible();
  const before = await shownFrame(page);
  await before.evaluate(() => scrollTo(0, 200));
  await expect.poll(() => page.evaluate(() => window.previewHandle?.scrollY)).toBe(200);
  const first = lesson.blocks[0]?.id ?? "";

  await page.evaluate(
    ({ id, block }) => {
      const result = window.previewEditor?.dispatch([
        { type: "updateEntry", id, set: { title: "Picking a pitch" } },
        { type: "updateBlock", id: block, set: { settings: { padding: { top: 48, bottom: 48 } } } },
      ]);
      if (!result?.ok) throw new Error(JSON.stringify(result));
    },
    { id: lesson.id, block: first },
  );
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Picking a pitch");
  const after = await shownFrame(page);
  expect(after).not.toBe(before);
  // The same lesson, scrolled as far, with the first continue still pressed.
  expect(await after.evaluate(() => [location.hash, scrollY])).toEqual([
    `#/lessons/${lesson.id}`,
    200,
  ]);
  await expect(frame.getByRole("button", { name: "I have read all three" })).toBeVisible();
  // Block settings reach the player under the desktop app's content security policy.
  await expect(frame.locator(`[data-block="${first}"]`)).toHaveCSS("padding-top", "48px");
  expect(await page.evaluate(() => window.previewRenders?.length)).toBe(2);
});

test("ENG-13: progress lasts through a live update, and Restart clears all of it and opens the start page again", async ({
  page,
}) => {
  const frame = await openPreview(page, corpusCourse("gated-continue"));
  await frame.getByRole("link", { name: "Begin course" }).click();
  await saved(page, () => frame.getByRole("button", { name: "Continue", exact: true }).click());
  await expect(frame.getByRole("button", { name: "I have read all three" })).toBeVisible();
  await frame.getByRole("link", { name: "Raising and packing", exact: true }).click();
  await page.evaluate(() =>
    window.previewEditor?.dispatch({ type: "updateCourse", set: { title: "Pitching a tent" } }),
  );
  await expect(frame.locator(".topbar-title")).toHaveText("Pitching a tent");
  await frame.getByRole("link", { name: "Choosing a spot", exact: true }).click();
  await expect(frame.getByRole("button", { name: "I have read all three" })).toBeVisible();

  await page.getByRole("button", { name: "Restart" }).click();
  // Back at the overview, as a learner who never started: no resume, nothing pressed.
  await expect(frame.getByRole("link", { name: "Begin course" })).toBeVisible();
  await expect(frame.getByRole("link", { name: "Resume where you stopped" })).toBeHidden();
  await frame.getByRole("link", { name: "Begin course" }).click();
  await expect(frame.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await expect(frame.getByRole("button", { name: "I have read all three" })).toBeHidden();
  expect((await page.evaluate(() => window.previewHandle?.calls() ?? []))[0]).toEqual({
    method: "initialize",
    args: [],
  });
});

test("[rise:R2] [rise:R3] ENG-13: the debug adapter in the preview gets the same calls as in the exported web package for the same steps", async ({
  page,
  browser,
}) => {
  const fixture = corpusCourse("gated-continue");
  /**
   * Begin the course, then press the first continue. Progress is saved a moment after it changes
   * (rise.md rule 3), so each step waits for its save, or two quick steps would share one.
   */
  async function steps(target: Page | FrameLocator, calls: () => Promise<AdapterCall[]>) {
    const saves = async () =>
      (await calls()).filter((call) => call.method === "writeResume").length;
    for (const step of [
      target.getByRole("link", { name: "Begin course" }),
      target.getByRole("button", { name: "Continue", exact: true }),
    ]) {
      const before = await saves();
      await step.click();
      await expect.poll(saves).toBe(before + 1);
    }
    return comparable(await calls());
  }

  const dir = await exportedWebPackage(fixture);
  const exported = await browser.newPage();
  try {
    await exported.addInitScript(() => {
      (window as { blocksPlayerHooks?: object }).blocksPlayerHooks = {};
    });
    await exported.goto(pathToFileURL(join(dir, "index.html")).href);
    const golden = await steps(exported, () =>
      exported.evaluate(() =>
        JSON.parse(
          JSON.stringify(
            (window as { blocksPlayerHooks?: { adapter?: { calls: unknown[] } } }).blocksPlayerHooks
              ?.adapter?.calls ?? [],
          ),
        ),
      ),
    );

    const frame = await openPreview(page, fixture);
    const calls = await steps(frame, () =>
      page.evaluate(() => window.previewHandle?.calls() ?? []),
    );
    expect(calls.map((call) => call.method)).toContain("initialize");
    expect(calls).toEqual(golden);
  } finally {
    await exported.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ENG-13: the preview makes no network request; the frame runs only on files held in memory", async ({
  page,
  baseURL,
}) => {
  const outside: string[] = [];
  const fromFrame: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (request.frame() !== page.mainFrame()) fromFrame.push(url);
    else if (!url.startsWith(`${baseURL}/`)) outside.push(url);
  });
  page.on("websocket", (socket) => outside.push(socket.url()));
  const fixture = corpusCourse("gated-continue");
  const frame = await openPreview(page, fixture);
  // Learner steps that track (begin, a continue, a lesson change) and a live update.
  await frame.getByRole("link", { name: "Begin course" }).click();
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await frame.getByRole("link", { name: "Raising and packing", exact: true }).click();
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Raising and packing");
  await page.evaluate(
    (id) => window.previewEditor?.dispatch({ type: "updateCourse", set: { title: id } }),
    "Pitching a tent, revised",
  );
  await expect(frame.locator(".topbar-title")).toHaveText("Pitching a tent, revised");
  expect(await page.evaluate(() => window.previewHandle?.calls() ?? [])).not.toEqual([]);

  expect(outside).toEqual([]);
  expect(fromFrame.length).toBeGreaterThan(0);
  expect(fromFrame.filter((url) => !/^(blob|data):/.test(url))).toEqual([]);
});

test("UI-BLOCKS-EDITOR-R52 keyboard only: pick a device, take the course in the frame, and return to the editor at that lesson", async ({
  page,
}) => {
  const frame = await openPreview(page, corpusCourse("gated-continue"));
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Restart" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Computer" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Tablet" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Tablet" })).toBeChecked();
  await expect.poll(() => page.locator(FRAME).evaluate((element) => element.clientWidth)).toBe(768);

  // Into the frame: the player's skip link comes first, then its controls.
  await page.keyboard.press("Tab");
  await expect(frame.getByRole("link", { name: "Skip to the course content" })).toBeFocused();
  const begin = frame.getByRole("link", { name: "Begin course" });
  await pressUntilFocused(page, "Tab", begin);
  await page.keyboard.press("Enter");
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Choosing a spot");

  // Back out of the frame to the toolbar, which remembers its last control, then along it to Edit.
  await pressUntilFocused(page, "Shift+Tab", page.getByRole("radio", { name: "Tablet" }));
  await pressUntilFocused(page, "ArrowLeft", page.getByRole("button", { name: "Edit" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Editing Choosing a spot");
});

test("UI-BLOCKS-EDITOR-R52 pointer: the edit button returns to the editor at the lesson on show, or at the overview", async ({
  page,
}) => {
  const frame = await openPreview(page, corpusCourse("gated-continue"));
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("status")).toHaveText("Editing the course overview");
  await frame.getByRole("link", { name: "Begin course" }).click();
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Choosing a spot");
  await page.getByRole("radio", { name: "Phone" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("status")).toHaveText("Editing Choosing a spot");
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-BLOCKS-EDITOR-R52 no axe violation in the ${theme} theme, in the pane or in the course`, async ({
    page,
  }) => {
    const errors = errorsOf(page);
    await openPreview(page, corpusCourse("gated-continue"), { theme });
    expect(await violations(page)).toEqual([]);
    expect(await violations(await shownFrame(page))).toEqual([]);
    await page.getByRole("radio", { name: "Phone" }).click();
    expect(await violations(page)).toEqual([]);
    expect(await violations(await shownFrame(page))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("ENG-13: time to first render of the largest corpus course", async ({ page }) => {
  const largest = [...COURSES].sort(
    (a, b) =>
      readFileSync(join(corpus, b, "course.json")).length -
      readFileSync(join(corpus, a, "course.json")).length,
  )[0] as string;
  await openPreview(page, corpusCourse(largest));
  const [ms] = (await page.evaluate(() => window.previewRenders)) ?? [];
  expect(ms).toBeGreaterThan(0);
  test.info().annotations.push({ type: "first render", description: `${largest}: ${ms} ms` });
  console.log(`Preview first render, ${largest}: ${Math.round(ms ?? 0)} ms`);
});
