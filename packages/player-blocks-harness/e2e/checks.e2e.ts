// Knowledge-check options and quiz extras in the published player, from file:// (M2-15, BLK-07;
// rise.md 3C, 3I; blocks-interactions.md 2.12, 2.13, 4, UI-BLOCKS-R20 to R25, R28, R59): the retry
// limit kept across a visit, reveal off, the author's answer colours where they stay readable,
// feedback for any answer, a case-sensitive fill-in, a picture or video with audio beside it, a
// timed quiz's limit on its start screen and the skip button's own label, on the default theme and
// a dark theme colour; matching by dragging, by keyboard picks and by drop-down lists, with a
// column kept in the author's order.
import type { Block, Course, LessonEntry, QuizEntry, Theme } from "@course-suite/format";
import { quizCourse } from "@course-suite/format/test/courses";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { adapterCalls, expect, test, useHooks } from "./fixture.ts";

/** The quiz course with its checks' settings and its quiz's settings changed. */
function pond(edit: (checks: Block[], quiz: QuizEntry) => void = () => {}, theme?: Theme): Course {
  const course = quizCourse();
  edit((course.entries[0] as LessonEntry).blocks, course.entries[1] as QuizEntry);
  if (theme) course.theme = theme;
  return course;
}

const THEMES = [
  [undefined, "the default theme"],
  [{ color: "#1b2a49" }, "a dark theme colour"],
] as const;

const firstCheck = (page: Page) => page.locator("form.check").first();
const color = (page: Page, selector: string, name: string) =>
  page.locator(selector).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

for (const [theme, name] of THEMES) {
  test(`UI-BLOCKS-R20, R24, R25, blocks-interactions 2.12: one retry, then no tries left; reveal off marks only the learner's answer; audio beside the picture; the tries survive a new visit, in ${name}`, async ({
    write,
    open,
    page,
  }) => {
    await write({
      course: pond((checks) => {
        const question = checks[0]?.question;
        if (question) question.audio = { key: "croak.mp3" };
      }, theme),
    });
    await useHooks(page, { keep: true });
    await open("#/lessons/lesschecks");
    const check = firstCheck(page);
    await expect(check.locator(".check-notice")).toBeVisible();
    await expect(check.locator(".question-media img")).toHaveAttribute(
      "alt",
      "A green frog on a lily pad",
    );
    // 2.12 "prompt + media + audio": the audio plays beside the picture.
    await expect(check.locator(".question-media audio")).toHaveAttribute("src", /croak\.mp3$/);
    await check.getByRole("radio", { name: "A duck" }).check();
    await check.getByRole("radio", { name: "A duck" }).press("Enter");
    await expect(check.locator(".feedback p")).toHaveText(["Incorrect", "No: ducks hatch."]);
    await expect(check.locator(".choice.is-wrong")).toHaveCount(1);
    await expect(check.locator(".choice.is-correct")).toHaveCount(0);
    await expectAccessible(page, "a required check answered wrong, with a retry");
    await check.getByRole("button", { name: "Try again" }).click();
    await check.getByRole("radio", { name: "A snail" }).check();
    await check.getByRole("button", { name: "Check answer" }).click();
    await expect(check.locator(".check-spent")).toHaveText(
      "You have no tries left for this question",
    );
    await expect(check.getByRole("button", { name: "Try again" })).toBeHidden();
    await expect(page.getByText("Frogs lay their eggs in spring.")).toBeHidden();
    await expectAccessible(page, "a required check with no tries left");
    await expect
      .poll(async () => (await adapterCalls(page)).some((c) => c.method === "writeResume"))
      .toBe(true);

    // A new visit: the answer and the spent tries come back.
    await page.reload();
    await expect(check.getByRole("radio", { name: "A snail" })).toBeChecked();
    await expect(check.locator(".check-spent")).toBeVisible();
    await expect(check.getByRole("button", { name: "Try again" })).toBeHidden();
  });

  test(`UI-BLOCKS-R22, R23, blocks-interactions 2.12: a case-sensitive fill-in, feedback for any answer, and the author's colours only where readable, in ${name}`, async ({
    write,
    open,
    page,
  }) => {
    await write({
      course: pond((checks) => {
        delete checks[0]?.variantSettings;
        // A wrong-answer colour far too light for text on white: the player keeps its own.
        (checks[3] as Block).variantSettings = {
          retries: 0,
          incorrectColor: "#ffd0d0",
          correctColor: "#0b6e2e",
        };
      }, theme),
    });
    await open("#/lessons/lesschecks");
    await expect(page.locator(".question-media audio")).toHaveCount(1);
    await expect(page.locator(".question-media video")).toHaveCount(1);
    const fill = page.locator("form.check").nth(2);
    expect(await color(page, "form.check >> nth=2", "--correct")).toBe("#0b6e2e");
    expect(await color(page, "form.check >> nth=2", "--wrong")).toBe("#b42318");
    await fill.getByRole("textbox").fill("tadpole");
    await fill.getByRole("textbox").press("Enter");
    await expect(fill.locator(".feedback p")).toHaveText([
      "Incorrect",
      "Tadpoles grow legs after a few weeks.",
    ]);
    await expect(fill.getByRole("button", { name: "Try again" })).toBeHidden();
    await expect(fill.locator(".check-spent")).toBeVisible();
    const multi = page.locator("form.check").nth(1);
    expect(await color(page, "form.check >> nth=1", "--correct")).toBe("#0b6e2e");
    await multi.getByRole("checkbox", { name: "A stickleback" }).check();
    await multi.getByRole("checkbox", { name: "A dragonfly larva" }).check();
    await multi.getByRole("button", { name: "Check answer" }).click();
    await expect(multi.locator(".feedback p")).toHaveText([
      "Correct",
      "Right: both breathe under water.",
    ]);
    await expectAccessible(page, "checks with media, colours and feedback");
  });

  test(`UI-BLOCKS-R59, GI-O2: a timed quiz shows its limit before it starts and says it once to screen readers at the start; a passed quiz offers skip ahead under the author's label, in ${name}`, async ({
    write,
    open,
    page,
  }) => {
    await write({
      course: pond((checks, quiz) => {
        delete checks[0]?.variantSettings;
        quiz.settings = {
          timer: { minutes: 5 },
          skipAhead: { entry: "lessafter1", learnerChooses: true, buttonLabel: "Jump to the end" },
        };
        quiz.questions = quiz.questions.slice(0, 1);
      }, theme),
    });
    // Skip ahead makes navigation restricted (rise.md rule 14): the lesson before comes first.
    await open("#/lessons/lesschecks");
    await page.evaluate(() => {
      location.hash = "#/lessons/quizpond01";
    });
    await expect(page.locator(".quiz-limit")).toHaveText("Time limit: 5 min");
    await expectAccessible(page, "a timed quiz's start screen");
    await page.getByRole("button", { name: "Begin quiz" }).click();
    await expect(page.locator(".quiz-limit")).toHaveCount(0);
    await expect(page.locator(".layout ~ [role=status]")).toHaveText(
      "The quiz timer has started. Time limit: 5 min",
    );
    await expectAccessible(page, "a timed quiz's first question", [320, 1280]);
    await page.getByRole("radio", { name: "In water" }).check();
    await page.getByRole("button", { name: "Submit" }).click();
    await page.getByRole("button", { name: "See your result" }).click();
    await page.getByRole("link", { name: "Jump to the end" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("After the quiz");
  });
}

/** The lesson's matching check (Frog, Heron, Snail with Flies, Fish, Algae) on show. */
async function matching(
  page: Page,
  open: (hash?: string) => Promise<unknown>,
  write: (options: { course: Course }) => Promise<void>,
  freezeColumn: "prompts" | "matches",
  theme?: Theme,
) {
  await write({
    course: pond((checks) => {
      delete checks[0]?.variantSettings;
      const question = checks[4]?.question;
      if (question?.kind === "matching") question.freezeColumn = freezeColumn;
    }, theme),
  });
  await open("#/lessons/lesschecks");
  const check = page.locator("form.check").nth(3);
  return {
    check,
    item: (name: string) => check.getByRole("button", { name: new RegExp(`^${name} `) }),
    tile: (name: string) => check.getByRole("button", { name, exact: true }),
  };
}

for (const [theme, name] of THEMES) {
  test(`[rise:3C] UI-BLOCKS-R28, blocks-interactions 2.12, A17: by pointer, a match is dragged onto its item or picked and then placed; the matches keep the author's order; the drop-down lists hold the same answer, in ${name}`, async ({
    write,
    open,
    page,
  }) => {
    // Blocks slide in as they scroll into view; a drag needs its target to stay put.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { check, item, tile } = await matching(page, open, write, "matches", theme);
    await expect(check.locator(".hint")).toHaveText(
      "Drag each match onto its item, or pick an item and then its match",
    );
    await expect(check.locator(".match-tile")).toHaveText(["Flies", "Fish", "Algae"]);
    await expect(check.getByRole("combobox")).toHaveCount(0);

    await tile("Flies").dragTo(item("Frog"));
    await expect(item("Frog")).toHaveAccessibleName("Frog Matched with Flies");
    await expect(check.getByRole("status")).toHaveText("Frog matched with Flies");
    // Picked, then placed: an item first, or a match first.
    await item("Heron").click();
    await expect(item("Heron")).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page, `a picked matching item in ${name}`, [320, 1280]);
    await tile("Fish").click();
    await expect(item("Heron")).toHaveAccessibleName("Heron Matched with Fish");
    await expect(item("Heron")).toHaveAttribute("aria-pressed", "false");
    // A match used elsewhere stays available (UI-BLOCKS-R28).
    await tile("Fish").click();
    await item("Snail").click();
    await expect(item("Snail")).toHaveAccessibleName("Snail Matched with Fish");

    await check.getByRole("button", { name: "Check answer" }).click();
    await expect(check.locator(".feedback .outcome")).toHaveText("Incorrect");
    await expect(check.locator(".match.is-wrong")).toContainText("Correct answer: Algae");
    await expect(check.locator(".match.is-correct")).toHaveCount(2);
    await expect(item("Snail")).toBeDisabled();
    await expectAccessible(page, `a matching check marked on the board in ${name}`, [320, 1280]);

    // Try again clears the board; the drop-down lists take the answer and the board shows it.
    await check.getByRole("button", { name: "Try again" }).click();
    await expect(item("Frog")).toHaveAccessibleName("Frog Not matched yet");
    await check.getByRole("button", { name: "Answer with drop-down lists" }).click();
    await expect(check.locator(".hint")).toHaveText("Pair each item with its match");
    await expect(check.locator(".match-tiles")).toBeHidden();
    await check.getByRole("combobox", { name: "Frog" }).selectOption({ label: "Flies" });
    await check.getByRole("combobox", { name: "Heron" }).selectOption({ label: "Fish" });
    await check.getByRole("combobox", { name: "Snail" }).selectOption({ label: "Algae" });
    await expectAccessible(page, `matching by drop-down lists in ${name}`, [320, 1280]);
    await check.getByRole("button", { name: "Answer by dragging" }).click();
    await expect(item("Snail")).toHaveAccessibleName("Snail Matched with Algae");
    await check.getByRole("button", { name: "Check answer" }).click();
    await expect(check.locator(".feedback .outcome")).toHaveText("Correct");
  });
}

test("[rise:3C] UI-BLOCKS-R28, blocks-interactions 4, A17: by keyboard, Up and Down move in a column, Space picks, Left and Right cross, Space pairs, Escape lets go and Enter submits; the items keep the author's order", async ({
  write,
  open,
  page,
}) => {
  const { check, item } = await matching(page, open, write, "prompts");
  await expect(check.locator(".match-item > span:first-child")).toHaveText([
    "Frog",
    "Heron",
    "Snail",
  ]);
  const focused = (locator: ReturnType<typeof item>) =>
    locator.evaluate((element) => element === document.activeElement);
  /** Moves along the column on show with Up, then Down, until `name` has focus. */
  const moveTo = async (name: string) => {
    const target = check.getByRole("button", { name: new RegExp(`^${name}( |$)`) });
    for (const key of ["ArrowUp", "ArrowUp", "ArrowUp"]) await page.keyboard.press(key);
    for (let i = 0; i < 3 && !(await focused(target)); i++) await page.keyboard.press("ArrowDown");
    await expect(target).toBeFocused();
  };

  // One tab stop for each column, then the switch to the lists.
  await item("Frog").focus();
  await page.keyboard.press("Tab");
  await expect(check.locator(".match-tile:focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(check.getByRole("button", { name: "Answer with drop-down lists" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(item("Frog")).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(item("Heron")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(item("Heron")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(item("Heron")).toHaveAttribute("aria-pressed", "false");

  for (const [one, match] of [
    ["Frog", "Flies"],
    ["Heron", "Fish"],
    ["Snail", "Algae"],
  ] as const) {
    await moveTo(one);
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await moveTo(match);
    await page.keyboard.press("Space");
    await expect(item(one)).toHaveAccessibleName(`${one} Matched with ${match}`);
    await page.keyboard.press("ArrowLeft");
  }
  await page.keyboard.press("Enter");
  await expect(check.locator(".feedback .outcome")).toHaveText("Correct");
  await expect(check.locator(".feedback")).toBeFocused();
});
