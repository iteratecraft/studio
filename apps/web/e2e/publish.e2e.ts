// The publish panel and export (M2-18; BLK-10, STD-08) in Chromium against the in-memory host, under
// the desktop app's content security policy: every option with its default, kept in the course and
// used again on a republish; invalid and incoherent choices that block export on their field; the
// checks before an export; export through the save dialog in the background, with progress, cancel
// and keep-working; a missing file; the web package opened from a folder, matching the preview pixel
// for pixel at 375, 768 and 1280 px; and the continue hint in place of its button (D-55,
// UI-BLOCKS-R55) in the preview and in the exported package. By pointer and by keyboard, with axe
// on every new screen in both editor themes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Course, SCHEMA_VERSION } from "@course-suite/format";
import { readZip } from "@course-suite/zip";
import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { bytesOf, courseIn, files, launch, openFixture, status } from "./helpers.ts";

const FILE = "Ponds.crs";
const ID = "8c1e4f2a-3b5d-4e6f-9a7b-0c1d2e3f4a5b";
const FRAME = "iframe[title='Course preview']:not([data-pending])";

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph",
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/** Two lessons and a quiz; the first lesson's continue block waits for its knowledge check. */
function ponds(extra: Partial<Course> = {}): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ID,
    kind: "course",
    title: "Ponds",
    entries: [
      {
        id: "lesspond01",
        kind: "lesson",
        title: "The pond",
        blocks: [
          paragraph("bpara00001", "A pond holds still fresh water."),
          {
            id: "bcheck0001",
            category: "knowledge-check",
            variant: "single-choice",
            question: {
              id: "qcheck0001",
              kind: "single-choice",
              prompt: "<p>Is pond water fresh?</p>",
              answers: [
                { id: "ayes000001", text: "Yes", correct: true },
                { id: "ano0000001", text: "No", correct: false },
              ],
            },
          },
          {
            id: "bgate00001",
            category: "divider",
            variant: "continue",
            variantSettings: {
              completionType: "block-above",
              hintText: "Answer the question above to go on.",
            },
          },
          paragraph("bpara00002", "Frogs lay their eggs in spring."),
        ],
      },
      {
        id: "lesslife01",
        kind: "lesson",
        title: "Pond life",
        blocks: [paragraph("bpara00003", "Dragonflies hunt over the water.")],
      },
      {
        id: "quizpond01",
        kind: "quiz",
        title: "Pond check",
        questions: [
          {
            id: "qquiz00001",
            kind: "single-choice",
            prompt: "<p>Do frogs lay eggs in water?</p>",
            answers: [
              { id: "aqyes00001", text: "Yes", correct: true },
              { id: "aqno000001", text: "No", correct: false },
            ],
          },
        ],
      },
    ],
    media: [],
    ...extra,
  } as Course;
}

async function openPonds(page: Page, course = ponds(), query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, course);
}

const tools = (page: Page) => page.getByRole("toolbar", { name: "Course tools" });
const panel = (page: Page) => page.locator(".be-publish");

async function openPublish(page: Page): Promise<void> {
  await tools(page).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Publish" })).toBeFocused();
}

/** A select of the panel by its label; its button is named by its value, then its label. */
const select = (page: Page, label: string) =>
  panel(page).getByRole("button", { name: new RegExp(`${label}$`) });

async function choose(page: Page, label: string, option: string): Promise<void> {
  await select(page, label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(select(page, label)).toContainText(option);
}

const toggle = (page: Page, name: string) => panel(page).getByText(name, { exact: true }).click();
const switchOf = (page: Page, name: string) => panel(page).getByRole("switch", { name });
const exportButton = (page: Page) =>
  panel(page).getByRole("button", { name: "Export", exact: true });

/** The editor's save state: the one status in its top bar. */
const saveState = (page: Page) => status(page).and(page.locator(".be-bar *"));

async function saved(page: Page): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, FILE);
}

/** Presses Tab until `target` has the focus, at most 60 times. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((element) => element === element.ownerDocument.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

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

/** The file a package was exported to, read back as a zip. */
async function zipOn(page: Page, id: string) {
  const zip = await readZip(await bytesOf(page, id));
  if (!zip.ok) throw new Error(`${id} is not a readable zip`);
  return zip.value;
}

const text = async (zip: Awaited<ReturnType<typeof zipOn>>, name: string) =>
  new TextDecoder().decode(await zip.read(name));

/** Exports with the dialog's suggested name and waits for the package to be saved. */
async function exportPackage(page: Page): Promise<Locator> {
  await exportButton(page).click();
  const done = page.getByRole("dialog", { name: "Package saved" });
  await expect(done).toBeVisible();
  return done;
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

test("[rise:3M] blocks-publish-collab A8, A9, 2.1, 2.2, UI-PUBCOLLAB-R4, R5, BLK-10, STD-08: the panel shows every option with its default, keeps each change in the course, and a republish uses them unchanged", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await openPonds(page);
  await openPublish(page);

  // The defaults (blocks-publish-collab.md 2.1, 2.2): SCORM 1.2, by lessons viewed at 100 %,
  // passed or incomplete, no exit link, cover shown, LMS-only on, no reset.
  await expect(select(page, "Output")).toContainText("SCORM 1.2");
  await expect(select(page, "The course is complete when")).toContainText(
    "Learners have viewed enough lessons",
  );
  await expect(panel(page).getByRole("slider", { name: "Lessons to view" })).toHaveValue("100");
  await expect(select(page, "What the learning system records")).toContainText(
    "Passed, or incomplete",
  );
  await expect(panel(page).getByRole("textbox", { name: "Package identifier" })).toHaveValue(
    `course-${ID}`,
  );
  await expect(switchOf(page, "Exit course link")).not.toBeChecked();
  await expect(switchOf(page, "Hide the cover page")).not.toBeChecked();
  // Reset on update and LMS-only launch are the advanced options (A10, W1 step 6).
  const advanced = panel(page).getByRole("region", { name: "Advanced" });
  await expect(advanced.getByRole("switch")).toHaveCount(2);
  await expect(
    advanced.getByRole("switch", { name: "Open only from a learning system" }),
  ).toBeChecked();
  await expect(
    advanced.getByRole("switch", { name: "Reset learner progress on update" }),
  ).not.toBeChecked();
  await expect(panel(page)).toContainText(
    /Learner progress needs up to \d+ of the 4,096 characters/,
  );
  // A web package has only the cover option (A11).
  await choose(page, "Output", "Web package");
  await expect(select(page, "The course is complete when")).toHaveCount(0);
  await expect(switchOf(page, "Exit course link")).toHaveCount(0);
  await expect(switchOf(page, "Hide the cover page")).toBeVisible();
  await expect(advanced).toHaveCount(0);

  // Reset asks first (2.2); cancelling leaves it off.
  await choose(page, "Output", "SCORM 1.2");
  await toggle(page, "Reset learner progress on update");
  const confirm = page.getByRole("alertdialog", { name: "Reset progress on update?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(switchOf(page, "Reset learner progress on update")).not.toBeChecked();
  // Back to the course.
  await panel(page).getByRole("button", { name: "Back to the course" }).click();
  await expect(page.getByRole("textbox", { name: "Course title" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("[standards:E-16] UI-PUBCOLLAB-R4, R5, BLK-10, STD-08: an invalid identifier blocks export on its field; every change is kept in the course and a republish uses it unchanged, one version higher", async ({
  page,
}) => {
  await openPonds(page);
  await openPublish(page);
  // xAPI with an identifier that is not an IRI: export is blocked with a message on that field.
  await choose(page, "Output", "xAPI");
  const identifier = panel(page).getByRole("textbox", { name: "Package identifier" });
  await expect(identifier).toHaveValue(`urn:uuid:${ID}`);
  await identifier.fill("ponds course");
  await identifier.press("Tab");
  await expect(panel(page).getByText(/Use an address with a scheme/)).toBeVisible();
  await exportButton(page).click();
  await expect(identifier).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await identifier.fill("https://example.org/courses/ponds");
  await identifier.press("Enter");
  await expect(identifier).not.toHaveAttribute("aria-invalid", "true");

  // Tracking by the quiz, which is offered first (UI-PUBCOLLAB-R5), with its own passing score.
  await choose(page, "The course is complete when", "Learners finish a quiz");
  await expect(select(page, "Quiz to track")).toContainText("Pond check");
  await expect(panel(page)).toContainText("Learners pass with 80% or more");
  await choose(page, "What the learning system records", "Passed, or failed");
  await panel(page).getByRole("textbox", { name: "Keywords" }).fill("ponds, water, ponds");
  await panel(page).getByRole("textbox", { name: "Keywords" }).press("Enter");
  await toggle(page, "Exit course link");
  await toggle(page, "Reset learner progress on update");
  const confirm = page.getByRole("alertdialog", { name: "Reset progress on update?" });
  await confirm.getByRole("button", { name: "Turn on" }).click();
  await expect(switchOf(page, "Reset learner progress on update")).toBeChecked();

  const settings = {
    standard: "xapi",
    statusWording: { done: "passed", notDone: "failed" },
    tracking: { kind: "quiz", quiz: "quizpond01" },
    exitLink: true,
    lmsOnly: true,
    resetOnUpdate: true,
    activityId: "https://example.org/courses/ponds",
    lom: { keywords: ["ponds", "water"] },
  };
  expect((await saved(page)).publish).toEqual(settings);

  // Export, then export again: the second package keeps every setting, one version higher.
  let done = await exportPackage(page);
  await expect(done).toContainText("Ponds-xapi.zip is saved");
  await expect(done).toContainText("Upload the zip to your learning system.");
  await done.getByRole("button", { name: "OK" }).click();
  const first = await zipOn(page, "Ponds-xapi.zip");
  expect(await text(first, "tincan.xml")).toContain('id="https://example.org/courses/ponds"');
  let course = await saved(page);
  expect([course.publish, course.packageVersion]).toEqual([settings, 1]);
  done = await exportPackage(page);
  await done.getByRole("button", { name: "OK" }).click();
  const second = await zipOn(page, "Ponds-xapi.zip");
  expect(await text(second, "tincan.xml")).toBe(await text(first, "tincan.xml"));
  expect(await text(second, "course-data.js")).not.toBe(await text(first, "course-data.js"));
  course = await saved(page);
  expect([course.publish, course.packageVersion]).toEqual([settings, 2]);
});

test("[standards:E-22] STD-08: cmi5 move-on follows the tracking, and waiting for a pass no quiz decides is marked and blocks export", async ({
  page,
}) => {
  await openPonds(page);
  await openPublish(page);
  await choose(page, "The course is complete when", "Learners finish a quiz");
  await choose(page, "Output", "cmi5");
  await expect(
    select(page, "The learning system counts the course as done when it is"),
  ).toContainText("Passed");
  // Its default follows the tracking: Passed for a quiz, Completed for lessons viewed.
  await choose(page, "The course is complete when", "Learners have viewed enough lessons");
  await expect(
    select(page, "The learning system counts the course as done when it is"),
  ).toContainText("Completed");
  await choose(page, "The learning system counts the course as done when it is", "Passed");
  await expect(panel(page).getByText(/No quiz decides a pass in this course/)).toBeVisible();
  await exportButton(page).click();
  await expect(
    select(page, "The learning system counts the course as done when it is"),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await choose(page, "The learning system counts the course as done when it is", "Completed");
  await expect(panel(page).getByText(/No quiz decides a pass in this course/)).toHaveCount(0);
});

test("BLK-10, STD-08, keyboard only: choose SCORM 2004, set the threshold, export through the save dialog and hear where the package is", async ({
  page,
}) => {
  await openPonds(page);
  // Into the top bar's toolbar, then its last tool (arrow keys move inside a toolbar).
  for (let i = 0; i < 20; i++) {
    if (await tools(page).evaluate((bar) => bar.contains(document.activeElement))) break;
    await page.keyboard.press("Tab");
  }
  const publish = tools(page).getByRole("button", { name: "Publish" });
  for (let i = 0; i < 12; i++) {
    if (await publish.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("ArrowRight");
  }
  await expect(publish).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Publish" })).toBeFocused();
  await chooseByKeyboard(page, "Output", "SCORM 2004 (4th edition)");
  const box = panel(page).getByRole("spinbutton", { name: "Lessons to view (percent)" });
  await tabTo(page, box);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("50");
  await page.keyboard.press("Enter");
  await expect(panel(page).getByRole("slider", { name: "Lessons to view" })).toHaveValue("50");
  await tabTo(page, switchOf(page, "Hide the cover page"));
  await page.keyboard.press("Space");
  await expect(switchOf(page, "Hide the cover page")).toBeChecked();
  await tabTo(page, exportButton(page));
  await page.keyboard.press("Enter");
  const done = page.getByRole("dialog", { name: "Package saved" });
  await expect(done.getByRole("button", { name: "OK" })).toBeFocused();
  await expect(done.getByRole("status")).toContainText("Ponds-scorm2004.zip is saved");
  await page.keyboard.press("Enter");
  await expect(done).toHaveCount(0);

  const zip = await zipOn(page, "Ponds-scorm2004.zip");
  expect(await text(zip, "imsmanifest.xml")).toContain("2004 4th Edition");
  const data = await text(zip, "course-data.js");
  expect(data.length).toBeGreaterThan(0);
  const course = await saved(page);
  expect(course.publish).toMatchObject({
    standard: "scorm2004",
    tracking: { kind: "completion", threshold: 50 },
  });
  expect(course.packageVersion).toBe(1);
  // An LMS package's cover setting is the theme's (BLK-09): the package opens at the first lesson.
  expect(course.theme?.cover?.skip).toBe(true);
});

test("UI-PUBCOLLAB-R1, A14, BLK-10: an export runs in the background with progress; cancel leaves no file, keep working ends with a notice", async ({
  page,
}) => {
  await openPonds(page, ponds(), "?hold-export");
  await openPublish(page);
  await exportButton(page).click();
  let running = page.getByRole("dialog", { name: "Exporting" });
  await expect(running.getByRole("progressbar", { name: "Export progress" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.editorTest.exports.held)).toBe(1);
  await running.getByRole("button", { name: "Cancel export" }).click();
  await expect(running).toHaveCount(0);
  await expect(page.getByText("Export cancelled.")).toBeAttached();
  expect(await page.evaluate(() => window.editorTest.exports.terminated)).toBe(1);
  expect(await files(page)).toEqual([FILE]);
  // The version was taken when the export started; a cancelled one is not handed out again.
  expect((await saved(page)).packageVersion).toBe(1);

  await exportButton(page).click();
  running = page.getByRole("dialog", { name: "Exporting" });
  await expect(running.getByRole("button", { name: "Keep working" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(running).toHaveCount(0);
  await page.evaluate(() => window.editorTest.exports.release());
  await expect(page.getByText("Ponds-scorm12.zip is saved.")).toBeVisible();
  expect(await files(page)).toEqual(["Ponds-scorm12.zip", FILE]);
});

test("[rise:R12] UI-PUBCOLLAB-R16, BLK-10: two exports started before the first ends get their own package versions; an export adds no undo step, and undo never takes a version back", async ({
  page,
}) => {
  await openPonds(page, ponds(), "?hold-export");
  await openPublish(page);
  const undo = tools(page).getByRole("button", { name: "Undo" });
  await expect(undo).toBeDisabled();
  await toggle(page, "Exit course link");
  await expect(switchOf(page, "Exit course link")).toBeChecked();
  // Two exports, each sent to the background before the first is built.
  for (let i = 0; i < 2; i++) {
    await exportButton(page).click();
    const running = page.getByRole("dialog", { name: "Exporting" });
    await running.getByRole("button", { name: "Keep working" }).click();
    await expect(running).toHaveCount(0);
  }
  await expect.poll(() => page.evaluate(() => window.editorTest.exports.held)).toBe(1);
  expect((await saved(page)).packageVersion).toBe(2);
  // Undo takes back the author's change only: the exports made no step and keep their versions.
  await page.keyboard.press("Control+Z");
  await expect(switchOf(page, "Exit course link")).not.toBeChecked();
  await expect(undo).toBeDisabled();
  expect((await saved(page)).packageVersion).toBe(2);

  const manifest = async () =>
    (await files(page)).includes("Ponds-scorm12.zip")
      ? (await text(await zipOn(page, "Ponds-scorm12.zip"), "imsmanifest.xml"))
          .match(/<manifest identifier="([^"]+)" version="(\d+)"/)
          ?.slice(1)
      : undefined;
  await page.evaluate(() => window.editorTest.exports.release());
  await expect.poll(manifest).toEqual([`course-${ID}_1`, "1"]);
  await expect.poll(() => page.evaluate(() => window.editorTest.exports.held)).toBe(1);
  await page.evaluate(() => window.editorTest.exports.release());
  await expect.poll(manifest).toEqual([`course-${ID}_2`, "2"]);
  // The next export comes after both.
  await exportButton(page).click();
  await expect.poll(() => page.evaluate(() => window.editorTest.exports.held)).toBe(1);
  await page.evaluate(() => window.editorTest.exports.release());
  await page
    .getByRole("dialog", { name: "Package saved" })
    .getByRole("button", { name: "OK" })
    .click();
  await expect.poll(manifest).toEqual([`course-${ID}_3`, "3"]);
});

for (const theme of ["light", "dark"] as const) {
  test(`[rise:3M] [rise:R16] a microlearning is tracked by viewing all of it: the panel offers no threshold and no quiz, and passes axe in the ${theme} theme`, async ({
    page,
  }) => {
    const lessonOnly = ponds().entries[1] as Course["entries"][number];
    await openPonds(
      page,
      ponds({ kind: "microlearning", entries: [lessonOnly] }),
      `?theme=${theme}`,
    );
    await openPublish(page);
    await expect(panel(page)).toContainText(
      "A microlearning is complete once the learner has viewed all of it.",
    );
    await expect(select(page, "The course is complete when")).toHaveCount(0);
    await expect(panel(page).getByRole("slider", { name: "Lessons to view" })).toHaveCount(0);
    await expect(
      panel(page).getByText("Add a quiz to the course to track its result."),
    ).toHaveCount(0);
    // It never fails, so no reporting pair says failed (rise.md 3M).
    await select(page, "What the learning system records").click();
    await expect(page.getByRole("option")).toHaveText([
      "Passed, or incomplete",
      "Completed, or incomplete",
    ]);
    await page.keyboard.press("Escape");
    expect(await violations(page)).toEqual([]);
  });
}

test("blocks-publish-collab 2.3, A11, UI-PUBCOLLAB-R4: the web package hides its cover by its own setting, kept apart from the theme's that LMS packages use", async ({
  page,
  browser,
}) => {
  await openPonds(page);
  await openPublish(page);
  await choose(page, "Output", "Web package");
  await toggle(page, "Hide the cover page");
  await expect(switchOf(page, "Hide the cover page")).toBeChecked();
  let course = await saved(page);
  expect(course.publish?.webSkipCover).toBe(true);
  expect(course.theme?.cover?.skip).toBeUndefined();
  // The LMS value is the theme's, still off; turning it on leaves the web value alone.
  await choose(page, "Output", "SCORM 1.2");
  await expect(switchOf(page, "Hide the cover page")).not.toBeChecked();
  await toggle(page, "Hide the cover page");
  await choose(page, "Output", "Web package");
  await toggle(page, "Hide the cover page");
  await expect(switchOf(page, "Hide the cover page")).not.toBeChecked();
  course = await saved(page);
  expect([course.publish?.webSkipCover, course.theme?.cover?.skip]).toEqual([undefined, true]);
  // With the web value on again and the theme's off, the web package opens at the first lesson.
  await toggle(page, "Hide the cover page");
  await choose(page, "Output", "SCORM 1.2");
  await toggle(page, "Hide the cover page");
  await choose(page, "Output", "Web package");
  await (await exportPackage(page)).getByRole("button", { name: "OK" }).click();
  const dir = await unzipToFolder(page, "Ponds-web.zip");
  try {
    const learner = await browser.newPage();
    await learner.goto(pathToFileURL(join(dir, "index.html")).href);
    await expect(learner.getByRole("heading", { level: 1, name: "The pond" })).toBeVisible();
    await learner.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("blocks-publish-collab A13, UI-PUBCOLLAB-R2, BLK-10: a missing file stops the export and says where it was used; other problems can be edited first or exported anyway", async ({
  page,
}) => {
  const course = ponds({
    media: [{ id: "mediapond1", key: "pond.svg", mimeType: "image/svg+xml", source: "upload" }],
  });
  const lessons = course.entries as Extract<Course["entries"][number], { kind: "lesson" }>[];
  lessons[1]?.blocks.push({
    id: "bimage0001",
    category: "image",
    variant: "centered",
    media: [{ key: "pond.svg", alt: "A pond" }],
  });
  await openPonds(page, course);
  await openPublish(page);
  await expect(panel(page)).toContainText(
    "The file pond.svg, used in “Pond life”, is missing from the course.",
  );
  await exportButton(page).click();
  const missing = page.getByRole("alertdialog", { name: "Files are missing" });
  await expect(missing).toContainText("pond.svg");
  await missing.getByRole("button", { name: "OK" }).click();
  expect(await files(page)).toEqual([FILE]);
});

test("blocks-publish-collab A13, UI-PUBCOLLAB-R2, BLK-10: an empty lesson, a broken lesson link and a picture without alt text are listed before an export, which goes back to edit or goes on", async ({
  page,
}) => {
  const course = ponds({
    media: [{ id: "mediapond1", key: "pond.svg", mimeType: "image/svg+xml", source: "upload" }],
  });
  course.entries.push({ id: "lessempty1", kind: "lesson", title: "Later", blocks: [] });
  const lessons = course.entries as Extract<Course["entries"][number], { kind: "lesson" }>[];
  lessons[1]?.blocks.push(paragraph("bpara00009", '<a href="#/lessons/lessgone01">More</a>'), {
    id: "bimage0001",
    category: "image",
    variant: "centered",
    media: [{ key: "pond.svg" }],
  });
  await launch(page);
  await openFixture(page, FILE, course, {
    "pond.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
  });
  await openPublish(page);
  for (const line of [
    "“Pond life” links to a lesson or block the course no longer has.",
    "“Pond life” has a picture without alt text.",
    "“Later” is empty.",
  ]) {
    await expect(panel(page)).toContainText(line);
  }
  await exportButton(page).click();
  const check = page.getByRole("alertdialog", { name: "Check the course before exporting" });
  await expect(check).toContainText("“Later” is empty.");
  expect(await violations(page)).toEqual([]);
  await check.getByRole("button", { name: "Go back and edit" }).click();
  expect(await files(page)).toEqual([FILE]);
  await exportButton(page).click();
  await check.getByRole("button", { name: "Export anyway" }).click();
  await expect(page.getByRole("dialog", { name: "Package saved" })).toBeVisible();
  expect(await files(page)).toEqual(["Ponds-scorm12.zip", FILE]);
});

for (const theme of ["light", "dark"] as const) {
  test(`STD-08: the publish panel, its dialogs and their states pass axe in the ${theme} theme`, async ({
    page,
  }) => {
    await openPonds(page, ponds(), `?theme=${theme}&hold-export`);
    await openPublish(page);
    expect(await violations(page)).toEqual([]);
    await choose(page, "Output", "cmi5");
    await choose(page, "The learning system counts the course as done when it is", "Passed");
    await expect(panel(page).getByText(/No quiz decides a pass/)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await choose(page, "Output", "Web package");
    expect(await violations(page)).toEqual([]);
    await choose(page, "Output", "SCORM 1.2");
    await toggle(page, "Reset learner progress on update");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.getByRole("button", { name: "Turn on" }).click();
    await exportButton(page).click();
    await expect(page.getByRole("dialog", { name: "Exporting" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.evaluate(() => window.editorTest.exports.release());
    await expect(page.getByRole("dialog", { name: "Package saved" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
}

/** Unzips the package in `id` into a new folder; returns the folder. */
async function unzipToFolder(page: Page, id: string): Promise<string> {
  const zip = await zipOn(page, id);
  const dir = mkdtempSync(join(tmpdir(), "publish-web-"));
  for (const name of zip.names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), (await zip.read(name)) as Uint8Array);
  }
  return dir;
}

/** The continue gate of the first lesson, as a learner meets it (UI-BLOCKS-R55, D-55). */
async function gate(learner: Frame | Page): Promise<void> {
  const block = learner.locator("[data-block=bgate00001]");
  const hint = block.getByText("Answer the question above to go on.");
  const button = block.getByRole("button", { name: "Continue" });
  await expect(hint).toBeVisible();
  // The hint stands in the button's place: plain text, no greyed-out button.
  await expect(button).toBeHidden();
  await expect(learner.getByText("Frogs lay their eggs in spring.")).toBeHidden();
  expect(await violations(learner)).toEqual([]);
  // By keyboard: answer, check, and the next stop is the button, now where the hint was.
  await learner.getByRole("radio", { name: "Yes" }).focus();
  await learner.getByRole("radio", { name: "Yes" }).press("Space");
  await learner.getByRole("button", { name: "Check answer" }).press("Enter");
  await expect(hint).toBeHidden();
  await expect(button).toBeVisible();
  await learner.locator(".feedback").focus();
  for (let i = 0; i < 6; i++) {
    if (await button.evaluate((element) => element === document.activeElement)) break;
    await learner.locator(":focus").press("Tab");
  }
  await expect(button).toBeFocused();
  expect(await violations(learner)).toEqual([]);
  await button.press("Enter");
  // What it held back shows, and focus moves into it.
  await expect(learner.getByText("Frogs lay their eggs in spring.")).toBeVisible();
  await expect(learner.locator("[data-block=bpara00002]")).toBeFocused();
}

test("D-55, UI-BLOCKS-R55, [rise:3G]: the continue hint replaces its button until the block above is done, in the preview and in the exported web package opened from a folder", async ({
  page,
  browser,
}) => {
  await openPonds(page, ponds(), "?theme=dark");
  await tools(page).getByRole("button", { name: "Preview" }).click();
  await page.frameLocator(FRAME).getByRole("link", { name: "Begin course" }).click();
  const shown = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!shown) throw new Error("the preview has no frame");
  await gate(shown);

  await tools(page).getByRole("button", { name: "Publish" }).click();
  await choose(page, "Output", "Web package");
  await (await exportPackage(page)).getByRole("button", { name: "OK" }).click();
  const dir = await unzipToFolder(page, "Ponds-web.zip");
  try {
    const learner = await browser.newPage();
    await learner.goto(pathToFileURL(join(dir, "index.html")).href);
    await learner.getByRole("link", { name: "Begin course" }).click();
    await gate(learner);
    await learner.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[rise:R20] [rise:3N] BLK-10, UI-BLOCKS-EDITOR-R58: the exported web package opens from a folder with only its own files, keeps nothing, and matches the preview pixel for pixel at 375, 768 and 1280 px", async ({
  page,
  browser,
}) => {
  await openPonds(page);
  await openPublish(page);
  await choose(page, "Output", "Web package");
  const done = await exportPackage(page);
  await expect(done).toContainText("Unzip it and open index.html");
  await done.getByRole("button", { name: "OK" }).click();
  const dir = await unzipToFolder(page, "Ponds-web.zip");
  const index = pathToFileURL(join(dir, "index.html")).href;
  const base = index.slice(0, index.lastIndexOf("/") + 1);
  try {
    const learner = await browser.newPage();
    const outside: string[] = [];
    learner.on("request", (request) => {
      if (!request.url().startsWith(base)) outside.push(request.url());
    });
    await learner.goto(index);
    await expect(learner.getByRole("heading", { level: 1, name: "Ponds" })).toBeVisible();
    await learner.getByRole("link", { name: "Begin course" }).click();
    await expect(learner.getByRole("heading", { level: 1, name: "The pond" })).toBeVisible();
    expect(outside).toEqual([]);
    expect(
      await learner.evaluate(
        "localStorage.length + sessionStorage.length + document.cookie.length",
      ),
    ).toBe(0);

    // The preview at each device width, and the package in a window of the frame's size.
    await tools(page).getByRole("button", { name: "Preview" }).click();
    const devices = page.getByRole("radiogroup", { name: "Device" });
    for (const [device, width] of [
      ["Phone", 375],
      ["Tablet", 768],
      ["Computer", 1280],
    ] as const) {
      await devices.getByRole("radio", { name: device }).click();
      const iframe = page.locator(FRAME);
      if (device === "Computer") {
        // The computer fills the pane: size the window so the pane is 1280 px wide.
        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        const box = await iframe.boundingBox();
        await page.setViewportSize({
          width: viewport.width + width - Math.round(box?.width ?? width),
          height: viewport.height,
        });
      }
      await expect
        .poll(async () => Math.round((await iframe.boundingBox())?.width ?? 0))
        .toBe(width);
      const box = await iframe.boundingBox();
      const height = Math.round(box?.height ?? 0);
      const frame = page.frameLocator(FRAME);
      await expect(frame.getByRole("heading", { level: 1, name: "Ponds" })).toBeVisible();
      const preview = await iframe.screenshot({ animations: "disabled", caret: "hide" });
      await learner.setViewportSize({ width, height });
      await learner.goto(index);
      await expect(learner.getByRole("heading", { level: 1, name: "Ponds" })).toBeVisible();
      const exported = await learner.screenshot({ animations: "disabled", caret: "hide" });
      expect(exported.equals(preview), `the cover, ${device} at ${width} px`).toBe(true);
      // And the first lesson, after the same press of the start link.
      await frame.getByRole("link", { name: "Begin course" }).click();
      await learner.getByRole("link", { name: "Begin course" }).click();
      await expect(frame.getByRole("heading", { level: 1, name: "The pond" })).toBeVisible();
      await expect(learner.getByRole("heading", { level: 1, name: "The pond" })).toBeVisible();
      const lesson = await iframe.screenshot({ animations: "disabled", caret: "hide" });
      const lessonExported = await learner.screenshot({ animations: "disabled", caret: "hide" });
      expect(lessonExported.equals(lesson), `the first lesson, ${device} at ${width} px`).toBe(
        true,
      );
      await page.getByRole("button", { name: "Restart" }).click();
    }
    await learner.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[standards:P-5] UI-PUBCOLLAB-R17: a package exported with the panel's defaults, opened from a web server outside a learning system, shows its one line, which passes axe in light and dark", async ({
  page,
  browser,
}) => {
  await openPonds(page);
  await openPublish(page);
  await (await exportPackage(page)).getByRole("button", { name: "OK" }).click();
  const zip = await zipOn(page, "Ponds-scorm12.zip");
  for (const colorScheme of ["light", "dark"] as const) {
    const learner = await browser.newPage({ colorScheme });
    const origin = "http://lms-only.test/";
    await learner.route(`${origin}**`, async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      const body = await zip.read(path);
      if (!body) return route.fulfill({ status: 404 });
      const type = path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".css")
          ? "text/css"
          : "text/javascript";
      await route.fulfill({ body: Buffer.from(body), contentType: type });
    });
    await learner.goto(`${origin}index.html`);
    await expect(learner.getByRole("alert")).toHaveText(
      "This course opens from a learning system only. Open it from there to keep your progress.",
    );
    expect(await violations(learner)).toEqual([]);
    await learner.close();
  }
});
