// Knowledge checks and quiz lessons in the blocks editor (M2-15, BLK-07; rise.md 3C, 3I, rules 8,
// 14 and 15; blocks-interactions.md 2.12, 2.13, A15 to A17, W10 to W13, UI-BLOCKS-R20 to R41;
// D-46), in Chromium against the in-memory host: knowledge checks of every type edited in place
// with their options, the quiz lesson's question list and settings, by keyboard and by pointer;
// the real player shows them in the preview and in an exported package; axe on every new screen
// in both themes and on the player's output.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Block, Course, LessonEntry, QuizEntry } from "@course-suite/format";
import { SCHEMA_VERSION } from "@course-suite/format";
import { quizCourse } from "@course-suite/format/test/courses";
import { memoryProjectFiles, openProject, readAsset } from "@course-suite/project";
import { readZip } from "@course-suite/zip";
import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { bytesOf, courseIn, launch, openFixture } from "./helpers.ts";

const FILE = "Pond study.crs";
const FROG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 4 3"><rect width="4" height="3" fill="#2f7d32"/></svg>';
/** The quiz course's media: a drawing, and stand-in bytes for the audio and the video. */
const POND_MEDIA = { "frog.svg": FROG, "croak.mp3": "ID3", "pond.webm": "webm" };

/** A lesson, an empty quiz and a lesson after it. */
function pondStudy(): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "6c3e1f2a-4b5d-4e6f-8a7b-9c0d1e2f3a4b",
    kind: "course",
    title: "Pond study",
    entries: [
      {
        id: "lesspond01",
        kind: "lesson",
        title: "Ponds",
        blocks: [
          {
            id: "blkpondtxt",
            category: "text",
            variant: "paragraph",
            items: [{ id: "itmpondtxt", kind: "content", text: "<p>Ponds are still water.</p>" }],
          },
        ],
      },
      { id: "quizpond02", kind: "quiz", title: "Pond quiz", questions: [] },
      { id: "lessafter2", kind: "lesson", title: "After", blocks: [] },
    ],
    media: [],
  };
}

const FRAME = "iframe[title='Course preview']:not([data-pending])";
const blocksOf = (page: Page) => page.getByRole("grid", { name: "Blocks of Ponds" });
const lastRow = (page: Page) => blocksOf(page).getByRole("row").last();
const saveState = (page: Page) => page.locator(".be-bar [role=status]");
const announced = (page: Page) => page.locator(".be-quiz > [aria-live]");
const lessonIn = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as LessonEntry;
const quizIn = (course: Course, id: string) =>
  course.entries.find((entry) => entry.id === id) as QuizEntry;

async function saved(page: Page, file = FILE): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(saveState(page)).toHaveText("Saved");
  return courseIn(page, file);
}

async function open(page: Page, title: string, level = 2): Promise<void> {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("heading", { level, name: title })).toBeFocused();
}

async function openPond(page: Page, entry = "Ponds", query = ""): Promise<void> {
  await launch(page, query);
  await openFixture(page, FILE, pondStudy());
  await open(page, entry);
}

/** Adds a block from the library at the end of the lesson, by keyboard. */
async function addBlock(page: Page, type: string): Promise<void> {
  await page.getByRole("button", { name: "All blocks" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type(type);
  const option = page
    .getByRole("listbox", { name: "Block library" })
    .getByRole("option", { name: type, exact: true });
  await expect(option).toBeVisible();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10 && !(await option.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(option).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Block library" })).toHaveCount(0);
}

/** Picks `option` in a drop-down by keyboard: open, arrows to it, Enter. */
async function pick(page: Page, select: Locator, option: string): Promise<void> {
  await select.focus();
  await page.keyboard.press("Enter");
  const wanted = page.getByRole("option", { name: option, exact: true });
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Home");
  for (let i = 0; i < 15 && !(await wanted.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(wanted).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Replaces the text of a field by keyboard and leaves it, so it is kept. */
async function retype(page: Page, field: Locator, text: string): Promise<void> {
  await field.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
  await page.keyboard.press("Tab");
}

/** Turns a switch or checkbox over by keyboard. */
async function toggle(page: Page, control: Locator): Promise<void> {
  const before = await control.isChecked();
  await control.focus();
  await page.keyboard.press("Space");
  await expect(control).toBeChecked({ checked: !before });
}

const select = (scope: Page | Locator, label: string) =>
  scope.getByRole("button", { name: new RegExp(`${label}$`) });

/** The preview opened from the editor, once the player shows it. */
async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator(FRAME);
  await expect(frame.locator("h1")).toBeVisible();
  return frame;
}

/** The preview frame on show, as a Playwright frame (for axe). */
async function previewFrame(page: Page): Promise<Frame> {
  const frame = await (await page.locator(FRAME).elementHandle())?.contentFrame();
  if (!frame) throw new Error("no preview frame");
  return frame;
}

test.describe("knowledge checks", () => {
  test("[rise:3C] blocks-interactions W10, 2.12, A17, UI-BLOCKS-R20 to R25: by keyboard, a check is added, switched to fill in the blank, given its accepted answers, case, feedback and options, and the preview gates the lesson on it", async ({
    page,
  }) => {
    await openPond(page);
    await addBlock(page, "Multiple response");
    const check = lastRow(page);
    const prompt = check.getByRole("textbox", { name: "Question" });
    await expect(prompt).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("A young frog is called a ____.");
    await page.keyboard.press("Tab");
    await expect(check).toHaveAccessibleName("Multiple response: A young frog is called a ____.");

    // A6, 2.12: the type switches in place, keeping the prompt; one undo step.
    await pick(page, select(check, "Question type"), "Fill in the blank");
    await expect(check).toHaveAccessibleName("Fill in the blank: A young frog is called a ____.");
    const accepted = check.getByRole("textbox", { name: "Accepted answers" });
    await expect(accepted).toHaveValue("A right answer");
    await accepted.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Tadpole");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Polliwog");
    await page.keyboard.press("Tab");
    await toggle(page, check.getByRole("switch", { name: "Capitals must match" }));
    await pick(page, select(check, "Feedback"), "One message for any answer");
    await retype(
      page,
      check.getByRole("textbox", { name: "Feedback message" }),
      "Tadpoles grow legs in spring.",
    );

    // A17, W10 step 4: the options in the format menu.
    await check.getByRole("button", { name: "Format", exact: true }).focus();
    await page.keyboard.press("Enter");
    const format = page.getByRole("dialog", { name: "Format" });
    await toggle(
      page,
      format.getByRole("switch", { name: "Learners must answer right to see what follows" }),
    );
    await pick(page, select(format, "Retries after a wrong answer"), "1");
    await expect(format.locator(".be-warning")).toHaveText(
      "Learners who use up their retries cannot see the rest of this lesson or finish the course.",
    );
    await toggle(
      page,
      format.getByRole("switch", { name: "Show the right answer after a wrong one" }),
    );
    await page.keyboard.press("Escape");
    await expect(format).toHaveCount(0);

    const block = lessonIn(await saved(page), "lesspond01").blocks[1] as Block;
    expect(block).toMatchObject({
      category: "knowledge-check",
      variant: "fill-in",
      variantSettings: { requireCorrect: true, retries: 1, reveal: false },
      question: {
        kind: "fill-in",
        prompt: "<p>A young frog is called a ____.</p>",
        acceptedAnswers: ["Tadpole", "Polliwog"],
        caseSensitive: true,
        feedbackMode: "any",
        feedback: "<p>Tadpoles grow legs in spring.</p>",
      },
    });

    // In the real player: the gate's notice, a miss in other capitals with no answer shown, one
    // retry, then the right answer opens the lesson below.
    await page.getByRole("button", { name: "Move up" }).last().focus();
    await page.keyboard.press("Enter");
    const frame = await preview(page);
    await expect(
      frame.getByText("Answer this question correctly to see the rest of the lesson"),
    ).toBeVisible();
    await expect(frame.getByText("Ponds are still water.")).toBeHidden();
    const answer = frame.getByRole("textbox", { name: "A young frog is called a ____." });
    await answer.fill("tadpole");
    await answer.press("Enter");
    await expect(frame.locator(".feedback p")).toHaveText([
      "Incorrect",
      "Tadpoles grow legs in spring.",
    ]);
    await expect(frame.getByText("Accepted answers")).toBeHidden();
    await frame.getByRole("button", { name: "Try again" }).press("Enter");
    await expect(answer).toBeFocused();
    await answer.fill("Tadpole");
    await answer.press("Enter");
    await expect(frame.locator(".feedback p").first()).toHaveText("Correct");
    await expect(frame.getByRole("button", { name: "Try again" })).toBeHidden();
    await expect(frame.getByText("Ponds are still water.")).toBeVisible();
    expect(await violations(await previewFrame(page))).toEqual([]);
  });

  test("[rise:3C] blocks-interactions 2.12, W10: by pointer, a single-choice check gets answers, a right one, feedback per answer, a picture and colours; matching gets its pairs; each change is one undo step", async ({
    page,
  }) => {
    await openPond(page);
    await page.getByRole("button", { name: "All blocks" }).click();
    await page.getByRole("searchbox", { name: "Search block types" }).fill("choice");
    await page.getByRole("option", { name: "Single choice" }).click();
    const check = lastRow(page);
    await check.getByRole("button", { name: "Add Answer 3" }).click();
    await check.getByRole("textbox", { name: "Answer 3" }).fill("A newt");
    await check.getByRole("textbox", { name: "Answer 3" }).press("Enter");
    await check.getByRole("group", { name: "Answer 3" }).getByText("Correct").click();
    await expect(check.getByRole("checkbox", { name: "Correct" }).nth(0)).not.toBeChecked();
    await check.getByRole("button", { name: "Remove Answer 2" }).click();
    await expect(check.getByRole("group", { name: /^Answer/ })).toHaveCount(2);
    await check.getByRole("button", { name: /Feedback$/ }).click();
    await page.getByRole("option", { name: "A message for each answer" }).click();
    const feedback = check.getByRole("textbox", { name: "Feedback for this answer" });
    await expect(feedback).toHaveCount(2);
    await feedback.nth(1).click();
    await page.keyboard.type("Newts start life in water too.");
    await check.getByRole("textbox", { name: "Question" }).click();

    // A picture for the question, decorative.
    await page.evaluate((svg) => {
      window.editorTest.host.disk.set("frog.svg", new TextEncoder().encode(svg));
      window.editorTest.open = ["frog.svg"];
    }, FROG);
    await check.getByRole("button", { name: "Choose an image" }).click();
    await expect(check.getByText("Picture: frog.svg")).toBeVisible();
    await check.getByText("Decorative: screen readers skip it").click();

    // Colours: a colour too light for text is flagged with one that works.
    await check.getByRole("button", { name: "Format", exact: true }).click();
    const format = page.getByRole("dialog", { name: "Format" });
    const right = format.getByRole("textbox", { name: "Colour of right answers" });
    await right.fill("#88ff88");
    await right.press("Enter");
    await expect(format.locator(".be-warning")).toContainText(
      "This colour is too light on white for text",
    );
    await right.fill("#0b6e2e");
    await right.press("Enter");
    await expect(format.locator(".be-warning")).toHaveCount(0);
    await page.keyboard.press("Escape");

    let block = lessonIn(await saved(page), "lesspond01").blocks[1] as Block;
    expect(block.variantSettings).toEqual({ correctColor: "#0b6e2e" });
    expect(block.question).toMatchObject({
      kind: "single-choice",
      feedbackMode: "perAnswer",
      media: { key: expect.stringMatching(/\.svg$/), alt: "" },
      answers: [
        { text: "A right answer", correct: false },
        { text: "A newt", correct: true, feedback: "<p>Newts start life in water too.</p>" },
      ],
    });

    // Matching: its pairs, added and removed; the switch is one undo step.
    await check.getByRole("button", { name: /Question type$/ }).click();
    await page.getByRole("option", { name: "Matching" }).click();
    await expect(check.getByRole("group", { name: /^Pair/ })).toHaveCount(3);
    await check.getByRole("button", { name: "Add Pair 4" }).click();
    await check.getByRole("textbox", { name: "Item 4", exact: true }).fill("Heron");
    await check.getByRole("textbox", { name: "Match for item 4" }).fill("Fish");
    await check.getByRole("textbox", { name: "Match for item 4" }).press("Enter");
    await check.getByRole("button", { name: "Remove Pair 1" }).click();
    block = lessonIn(await saved(page), "lesspond01").blocks[1] as Block;
    expect(block.variant).toBe("matching");
    expect(
      block.question?.kind === "matching" && block.question.pairs.map((p) => p.prompt),
    ).toEqual(["Open", "Early", "Heron"]);
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Undo" }).click();
    await expect(check).toHaveAccessibleName(/^Single choice/);
  });
});

test.describe("answers pasted and matching orders", () => {
  /**
   * Pastes `text` into the focused field, as Ctrl+V does with text on the clipboard: false when
   * the editor took the paste over, true when it left it to the field.
   */
  const paste = (page: Page, text: string) =>
    page.evaluate((pasted) => {
      const data = new DataTransfer();
      data.setData("text/plain", pasted);
      return document.activeElement?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, text);

  test("[rise:3C] blocks-interactions 2.12, A17, UI-BLOCKS-R28: by keyboard, lines pasted into an answer become answers in one undo step, and matching keeps the matches in the author's order on the preview's board", async ({
    page,
  }) => {
    await openPond(page);
    await addBlock(page, "Single choice");
    const check = lastRow(page);
    await expect(
      check.getByText("Paste several lines into an answer to add an answer for each line."),
    ).toBeVisible();
    await check.getByRole("textbox", { name: "Answer 2" }).focus();
    expect(await paste(page, "A newt\nA toad\r\n\nA heron\n")).toBe(false);
    await expect(check.getByRole("group", { name: /^Answer/ })).toHaveCount(4);
    await expect(check.getByRole("textbox", { name: "Answer 4" })).toHaveValue("A heron");
    let block = lessonIn(await saved(page), "lesspond01").blocks[1] as Block;
    expect(
      block.question?.kind === "single-choice" &&
        block.question.answers.map((a) => [a.text, a.correct]),
    ).toEqual([
      ["A right answer", true],
      ["A newt", false],
      ["A toad", false],
      ["A heron", false],
    ]);
    // One line is left to the field, as ordinary typing.
    await check.getByRole("textbox", { name: "Answer 3" }).focus();
    expect(await paste(page, "A frog")).toBe(true);
    // The paste is one step (the shortcut outside a text field).
    await check.getByRole("button", { name: "Format", exact: true }).focus();
    await page.keyboard.press("Control+Z");
    await expect(check.getByRole("group", { name: /^Answer/ })).toHaveCount(2);
    await expect(check.getByRole("textbox", { name: "Answer 2" })).toHaveValue("A wrong answer");

    // A17: matching keeps the matches column in the author's order.
    await pick(page, select(check, "Question type"), "Matching");
    await pick(page, select(check, "Order learners see"), "Keep the matches in my order");
    block = lessonIn(await saved(page), "lesspond01").blocks[1] as Block;
    expect(block.question).toMatchObject({ kind: "matching", freezeColumn: "matches" });
    const pairs = block.question?.kind === "matching" ? block.question.pairs : [];
    const plain = (html: string) => html.replace(/<[^>]+>/g, "");

    // In the preview: the board's matches in the author's order, paired by keyboard.
    const frame = await preview(page);
    const form = frame.locator("form.check");
    await expect(form.locator(".match-tile")).toHaveText(pairs.map((pair) => plain(pair.match)));
    expect(await violations(await previewFrame(page))).toEqual([]);
    for (const pair of pairs) {
      const item = form.getByRole("button", { name: new RegExp(`^${plain(pair.prompt)} `) });
      await item.focus();
      await item.press("Space");
      await item.press("ArrowRight");
      // The top of the matches column, then down to the match.
      for (const _ of pairs) await frame.locator(":focus").press("ArrowUp");
      for (let i = 0; i < pairs.length; i++) {
        const focused = await form
          .getByRole("button", { name: plain(pair.match), exact: true })
          .evaluate((element) => element === document.activeElement);
        if (focused) break;
        await frame.locator(":focus").press("ArrowDown");
      }
      await frame.locator(":focus").press("Space");
      await expect(item).toHaveAccessibleName(
        `${plain(pair.prompt)} Matched with ${plain(pair.match)}`,
      );
    }
    await frame.locator(":focus").press("Enter");
    await expect(form.locator(".feedback .outcome")).toHaveText("Correct");
    expect(await violations(await previewFrame(page))).toEqual([]);
  });
});

test.describe("quiz lessons", () => {
  test("[rise:3I] blocks-interactions W11, A15, A16, 2.13: by keyboard, questions are added, moved, duplicated and deleted, and every quiz setting is set", async ({
    page,
  }) => {
    await openPond(page, "Pond quiz");
    await expect(page.getByRole("heading", { name: "No questions yet" })).toBeVisible();
    await page.getByRole("button", { name: "Add a question" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Single choice" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Question 1 of 1" })).toBeFocused();
    await expect(announced(page)).toHaveText("1. Single choice: Which answer is right? added");
    await retype(page, page.getByRole("textbox", { name: "Question" }), "Where do frogs lay eggs?");

    await page.getByRole("button", { name: "Add a question" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Matching" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Question 2 of 2" })).toBeFocused();
    const list = page.getByRole("list", { name: "Questions in order" });
    await expect(list.getByRole("button")).toHaveText([
      "1. Single choice: Where do frogs lay eggs?",
      "2. Matching: Match each word with its opposite.",
    ]);

    // Move the matching question up, duplicate it, delete the copy.
    await page.getByRole("button", { name: "Move up" }).focus();
    await page.keyboard.press("Enter");
    await expect(announced(page)).toHaveText(
      "1. Matching: Match each word with its opposite. moved",
    );
    await expect(list.getByRole("button", { name: /^1\. Matching/ })).toBeFocused();
    await page.getByRole("button", { name: "Duplicate" }).focus();
    await page.keyboard.press("Enter");
    await expect(list.getByRole("button")).toHaveCount(3);
    await expect(list.getByRole("button", { name: /^2\. Matching/ })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Question 2 of 3" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(announced(page)).toHaveText(
      "2. Matching: Match each word with its opposite. deleted",
    );
    await expect(list.getByRole("button")).toHaveCount(2);

    // A16: every setting, from the settings button.
    await page.getByRole("button", { name: "Quiz settings" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Quiz settings" });
    const score = dialog.getByRole("spinbutton", { name: "Passing score (Percent)" });
    await score.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("60");
    await page.keyboard.press("Enter");
    await pick(page, select(dialog, "Retries"), "1");
    await toggle(page, dialog.getByRole("switch", { name: "Learners must pass to go on" }));
    await toggle(page, dialog.getByRole("switch", { name: "Let learners who pass skip ahead" }));
    await expect(
      dialog.getByRole("switch", { name: "Let learners who pass skip ahead" }),
    ).toHaveAccessibleDescription(
      "This makes navigation restricted for the whole course: lessons open in order.",
    );
    await expect(select(dialog, "Skip to")).toHaveAccessibleName(/After/);
    await toggle(page, dialog.getByRole("switch", { name: "Learners choose whether to skip" }));
    await retype(
      page,
      dialog.getByRole("textbox", { name: "Skip button label" }),
      "Skip to the end",
    );
    await toggle(page, dialog.getByRole("switch", { name: "Ask the questions in a random order" }));
    await toggle(page, dialog.getByRole("switch", { name: "Shuffle the answers" }));
    await pick(page, select(dialog, "After each answer show"), "Only wrong answers, with feedback");
    await retype(page, dialog.getByRole("textbox", { name: "Colour of right answers" }), "#0b6e2e");
    await retype(page, dialog.getByRole("textbox", { name: "Colour of wrong answers" }), "#ff9999");
    await expect(dialog.locator(".be-warning")).toContainText("too light on white");
    await toggle(page, dialog.getByRole("switch", { name: "Time limit" }));
    await expect(dialog.getByRole("spinbutton", { name: "Length (Minutes)" })).toHaveValue("10");
    await pick(page, select(dialog, "Timer shows"), "Time taken of the limit");
    await toggle(page, dialog.getByRole("switch", { name: "Count the quiz as a lesson" }));
    await pick(page, select(dialog, "Button after the result"), "Continue button");
    await dialog.getByRole("switch", { name: "Count the quiz as a lesson" }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quiz settings" })).toBeFocused();

    const quiz = quizIn(await saved(page), "quizpond02");
    expect(quiz.questions.map((q) => q.kind)).toEqual(["matching", "single-choice"]);
    expect(quiz.settings).toEqual({
      passingScore: 60,
      retries: 1,
      requirePassing: true,
      skipAhead: { entry: "lessafter2", learnerChooses: true, buttonLabel: "Skip to the end" },
      shuffleQuestions: true,
      shuffleAnswers: true,
      revealAnswers: "incorrect",
      correctColor: "#0b6e2e",
      incorrectColor: "#ff9999",
      timer: { minutes: 10, learnerCanHide: true, display: "elapsed-of-total" },
      countAsLesson: false,
      finishButton: "continue",
    });
  });

  test("[rise:3I] [rise:R14] UI-BLOCKS-R41, blocks-interactions 2.12: by pointer, a question changes type in its place and takes audio beside a picture; the last lesson offers no skip ahead, and turning it off clears it", async ({
    page,
  }) => {
    await openPond(page, "Pond quiz");
    for (const type of ["Fill in the blank", "Multiple response"]) {
      await page.getByRole("button", { name: "Add a question" }).first().click();
      await page.getByRole("menuitem", { name: type }).click();
    }
    const list = page.getByRole("list", { name: "Questions in order" });
    await list.getByRole("button", { name: /^1\./ }).click();
    await page.getByRole("button", { name: /Question type$/ }).click();
    await page.getByRole("option", { name: "Single choice" }).click();
    await expect(list.getByRole("button")).toHaveText([
      // Each question by its type and its first 40 characters.
      "1. Single choice: Fill in the blank: the opposite of hot …",
      "2. Multiple response: Which answers are right? Choose every o…",
    ]);
    await page.evaluate(() => {
      window.editorTest.host.disk.set("croak.mp3", new Uint8Array([0x49, 0x44, 0x33, 4, 0]));
      window.editorTest.open = ["croak.mp3"];
    });
    await page.getByRole("button", { name: "Choose audio" }).click();
    await expect(page.getByText("Audio: croak.mp3")).toBeVisible();
    // 2.12 "prompt + media + audio": a picture joins the audio rather than taking its place.
    await page.evaluate((svg) => {
      window.editorTest.host.disk.set("frog.svg", new TextEncoder().encode(svg));
      window.editorTest.open = ["frog.svg"];
    }, FROG);
    await page.getByRole("button", { name: "Choose an image" }).click();
    await expect(page.getByText("Picture: frog.svg")).toBeVisible();
    await page.getByText("Decorative: screen readers skip it").click();
    await expect(page.getByText("Audio: croak.mp3")).toBeVisible();

    await page.getByRole("button", { name: "Quiz settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Quiz settings" });
    await dialog.getByText("Let learners who pass skip ahead").click();
    await dialog.getByText("Let learners who pass skip ahead").click();
    await dialog.getByRole("button", { name: "Close" }).click();
    let quiz = quizIn(await saved(page), "quizpond02");
    expect(quiz.settings).toBeUndefined();
    const [first] = quiz.questions;
    expect(first).toMatchObject({
      kind: "single-choice",
      answers: [{ text: "cold", correct: true }, { correct: false }],
      media: { key: expect.stringMatching(/\.svg$/), alt: "" },
      audio: { key: expect.stringMatching(/\.mp3$/) },
    });

    // The last entry: nothing to skip to.
    await page.getByRole("button", { name: /Go to/ }).click();
    await page.getByRole("option", { name: "Course overview" }).click();
    await page.getByRole("button", { name: "Actions for Pond quiz" }).click();
    await page.getByRole("menuitem", { name: "Move down" }).click();
    await open(page, "Pond quiz");
    await page.getByRole("button", { name: "Quiz settings" }).click();
    await expect(
      dialog.getByRole("switch", { name: "Let learners who pass skip ahead" }),
    ).toBeDisabled();
    await expect(dialog.getByText("Add a lesson after this quiz to skip ahead to.")).toBeVisible();
    quiz = quizIn(await saved(page), "quizpond02");
    expect(quiz.settings).toBeUndefined();
  });
});

test.describe("the quiz in the player", () => {
  /**
   * The quiz course open in the editor at its quiz, its media on the disk; its first check no
   * longer required, so the quiz is open from the start.
   */
  async function openQuiz(page: Page, minutes = 5) {
    const course = quizCourse();
    const check = (course.entries[0] as LessonEntry).blocks[0] as Block;
    check.variantSettings = { retries: 1, reveal: false };
    const settings = (course.entries[1] as QuizEntry).settings;
    if (settings?.timer) settings.timer.minutes = minutes;
    await launch(page);
    await openFixture(page, "Pond life.crs", course, POND_MEDIA);
    await open(page, "Pond quiz");
  }

  /** Takes the quiz course's quiz: every answer right, or every one wrong. */
  async function takeQuiz(frame: ReturnType<Page["frameLocator"]>, right: boolean) {
    await frame.getByRole("radio", { name: right ? "In water" : "In trees" }).check();
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "Next question" }).click();
    await frame.getByRole("checkbox", { name: "Dragonfly" }).check();
    if (right) await frame.getByRole("checkbox", { name: "Water beetle" }).check();
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "Next question" }).click();
    await frame.getByRole("textbox").fill(right ? "Water Lily" : "reed");
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "Next question" }).click();
    // Matching on the board: an item picked, then its match (UI-BLOCKS-R28).
    const matches = right ? ["Frog", "Dragonfly"] : ["Dragonfly", "Frog"];
    for (const [i, item] of ["Tadpole", "Nymph"].entries()) {
      await frame.getByRole("button", { name: new RegExp(`^${item} `) }).click();
      await frame.getByRole("button", { name: matches[i] as string, exact: true }).click();
    }
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "See your result" }).click();
  }

  test("[rise:3I] [rise:R8] UI-BLOCKS-R29 to R38, D-46: in the preview, a question per screen with its media, wrong answers marked in the quiz's colours, results with retry; with require-passing and retries spent the course cannot be completed", async ({
    page,
  }) => {
    await openQuiz(page);
    const frame = await preview(page);
    await expect(frame.getByText("Time limit: 5 min")).toBeVisible();
    await frame.getByRole("button", { name: "Begin quiz" }).click();
    await expect(frame.getByRole("heading", { name: "Question 1 of 4" })).toBeFocused();
    await expect(frame.locator(".question-media img")).toHaveAttribute("alt", "");
    await expect(frame.getByRole("timer")).toContainText("of 5:00");
    await frame.getByRole("radio", { name: "In trees" }).check();
    await frame.getByRole("button", { name: "Submit" }).click();
    // Only wrong answers are revealed, in the quiz's own colour for wrong answers.
    await expect(frame.locator(".feedback")).toHaveClass(/is-wrong/);
    const wrong = await frame
      .locator(".quiz")
      .evaluate((quiz) => getComputedStyle(quiz).getPropertyValue("--wrong").trim());
    expect(wrong).toBe("#9b1c1c");
    expect(await violations(await previewFrame(page))).toEqual([]);
    await frame.getByRole("button", { name: "Next question" }).click();
    await expect(frame.locator(".question-media audio")).toHaveCount(0);
    await frame.getByRole("checkbox", { name: "Dragonfly" }).check();
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "Next question" }).click();
    await expect(frame.locator(".question-media audio")).toHaveCount(1);
    await frame.getByRole("textbox").fill("reed");
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "Next question" }).click();
    await frame.getByRole("button", { name: "Submit" }).click();
    await expect(frame.locator(".hint")).toHaveClass(/is-needed/);
    await frame.getByRole("button", { name: /^Tadpole / }).click();
    await frame.getByRole("button", { name: "Dragonfly", exact: true }).click();
    await frame.getByRole("button", { name: "Submit" }).click();
    await frame.getByRole("button", { name: "See your result" }).click();
    await expect(frame.locator(".quiz-score")).toHaveText("Your score: 0%");
    await expect(frame.locator(".quiz-outcome")).toHaveText("Not passed");
    await expect(frame.getByText("Attempts left: 2")).toBeVisible();
    expect(await violations(await previewFrame(page))).toEqual([]);

    // Two more failed attempts: no retry left, the lesson after stays locked.
    for (const left of ["Attempts left: 1", "No attempts left"]) {
      await frame.getByRole("button", { name: "Retake quiz" }).click();
      await frame.getByRole("button", { name: "Retake quiz" }).click();
      await takeQuiz(frame, false);
      await expect(frame.getByText(left)).toBeVisible();
    }
    await expect(frame.getByRole("button", { name: "Retake quiz" })).toHaveCount(0);
    await expect(frame.getByText("You need a passing score to go on")).toBeVisible();
    await expect(frame.locator(".page-link-next")).toHaveClass(/is-locked/);
    await expect(frame.getByRole("link", { name: "Continue" })).toHaveCount(0);
  });

  // The preview's sandboxed frame takes no fake clock, so this checks the wiring only: the time
  // running out, the unanswered questions counted wrong and the restart on retake run under a fake
  // clock in the exported player (player-blocks-harness quiz.e2e.ts, a11y.e2e.ts) and in every
  // standard's LMS trace (conformance quiz.e2e.ts).
  test("[rise:R15] UI-BLOCKS-R39, R59, BLK-07: in the preview a timed quiz shows its limit, starts its timer on the start button and says so once; the learner can hide the timer", async ({
    page,
  }) => {
    await openQuiz(page, 1);
    const frame = await preview(page);
    await expect(frame.getByText("Time limit: 1 min")).toBeVisible();
    await expect(frame.getByRole("timer")).toHaveCount(0);
    await frame.getByRole("button", { name: "Begin quiz" }).click();
    await expect(
      frame.getByRole("timer", { name: "Quiz timer" }).locator(".timer-time"),
    ).toHaveText(/^\d:\d\d of 1:00$/);
    await expect(frame.locator(".layout ~ [role=status]")).toHaveText(
      "The quiz timer has started. Time limit: 1 min",
    );
    await frame.getByRole("button", { name: "Hide timer" }).click();
    await expect(frame.locator(".timer-time")).toBeHidden();
    await frame.getByRole("button", { name: "Show timer" }).click();
    await expect(frame.locator(".timer-time")).toBeVisible();
    expect(await violations(await previewFrame(page))).toEqual([]);
  });

  test("[rise:3C] [rise:3I] UI-BLOCKS-R24 UI-BLOCKS-R26: the exported web package shows the checks and the quiz with their media; a required check out of tries keeps the quiz locked, a right answer opens it", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, "Pond life.crs", quizCourse(), POND_MEDIA);
    await page.keyboard.press("Control+S");
    await expect(saveState(page)).toHaveText("Saved");
    const disk = memoryProjectFiles();
    disk.files.set("Pond life.crs", await bytesOf(page, "Pond life.crs"));
    const opened = await openProject(disk, "Pond life.crs");
    if (!opened.ok) throw new Error(JSON.stringify(opened.problems));
    const { project } = opened;
    const built = await buildPackage({
      course: project.course,
      player: blocksPlayer(),
      exporter: webExporter(),
      media: (key) => readAsset(project, key),
      fonts: nodeFonts,
      packageVersion: 1,
    });
    if (!built.ok) throw new Error(JSON.stringify(built.problems));
    const zip = await readZip(built.value.zip);
    if (!zip.ok) throw new Error("unreadable package");
    expect(zip.value.names).toEqual(
      expect.arrayContaining(["media/frog.svg", "media/croak.mp3", "media/pond.webm"]),
    );
    const dir = mkdtempSync(join(tmpdir(), "quiz-package-"));
    for (const name of zip.value.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
    }
    await page.goto(`${pathToFileURL(join(dir, "index.html")).href}#/lessons/lesschecks`);
    const checks = page.locator("form.check");
    await expect(checks).toHaveCount(4);
    await expect(page.locator(".question-media img")).toHaveAttribute(
      "alt",
      "A green frog on a lily pad",
    );
    await expect(page.locator(".question-media audio, .question-media video")).toHaveCount(2);
    expect(await violations(page)).toEqual([]);

    // A required check with one retry: two misses leave no tries and the rest hidden.
    await page.getByRole("radio", { name: "A duck" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.locator(".feedback p")).toHaveText(["Incorrect", "No: ducks hatch."]);
    // Reveal is off: the right answer is not marked.
    await expect(page.locator(".choice.is-correct")).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("radio", { name: "A snail" }).check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.locator("form.check").first().locator(".check-spent")).toHaveText(
      "You have no tries left for this question",
    );
    await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();
    await expect(page.getByText("Frogs lay their eggs in spring.")).toBeHidden();
    expect(await violations(page)).toEqual([]);

    // UI-BLOCKS-R26: the quiz after it stays locked.
    const index = pathToFileURL(join(dir, "index.html")).href;
    await page.goto(`${index}#/lessons/quizpond01`);
    await expect(page.locator(".locked-notice")).toBeVisible();

    // A new visit (web output keeps nothing): the right answer opens the quiz.
    await page.goto(`${index}#/lessons/lesschecks`);
    await page.reload();
    await page.getByRole("radio", { name: "A frog" }).check();
    await page.getByRole("radio", { name: "A frog" }).press("Enter");
    await expect(page.getByText("Frogs lay their eggs in spring.")).toBeVisible();
    await page.goto(`${index}#/lessons/quizpond01`);
    await expect(page.getByText("Time limit: 5 min")).toBeVisible();
    await page.getByRole("button", { name: "Begin quiz" }).click();
    await page.getByRole("radio", { name: "In trees" }).check();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.locator(".feedback")).toHaveClass(/is-wrong/);
    await expect(page.locator(".question-media img")).toHaveAttribute("alt", "");
    expect(await violations(page)).toEqual([]);
  });
});

for (const theme of ["light", "dark"] as const) {
  test.describe(`UI-ACCESSIBILITY: no axe violation on the knowledge-check and quiz screens in the ${theme} theme`, () => {
    const check = async (page: Page, state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);

    test("the checks of every type and their format menu", async ({ page }) => {
      await launch(page, `?theme=${theme}`);
      await openFixture(page, "Pond life.crs", quizCourse(), POND_MEDIA);
      await open(page, "Who lives in a pond");
      await check(page, "a check of each type");
      await page
        .getByRole("row")
        .filter({ hasText: "Which animal starts life as a tadpole?" })
        .first()
        .getByRole("button", { name: "Format", exact: true })
        .click();
      await check(page, "the format menu of a required check with a retry limit");
    });

    test("the quiz editor, its add menu and its settings", async ({ page }) => {
      await openPond(page, "Pond quiz", `?theme=${theme}`);
      await check(page, "a quiz with no questions");
      await page.getByRole("button", { name: "Add a question" }).click();
      await check(page, "the add-question menu");
      await page.getByRole("menuitem", { name: "Matching" }).click();
      await check(page, "a matching question");
      await page.getByRole("button", { name: "Quiz settings" }).click();
      await page.getByRole("dialog").getByText("Time limit").click();
      await page.getByRole("dialog").getByText("Let learners who pass skip ahead").click();
      await check(page, "the quiz settings with the timer and skip ahead");
    });
  });
}
