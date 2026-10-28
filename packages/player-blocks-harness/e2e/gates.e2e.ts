// Knowledge checks and quiz lessons (M2-15) at the gates of M2-16 in the published player, from
// file:// (rise.md 3G, rules 14 and 16; blocks-interactions.md UI-BLOCKS-R24, R25, R44, R45, R54,
// R55, R58, R62, R63): a continue block waiting for the check above it, a stepped microlearning
// holding a check whose tries run out, and a quiz with skip-ahead keeping lessons in order, by
// keyboard and by pointer, with axe on a light and a dark theme colour; and every colour pair of
// the checks, the quiz result and their outline marks beside the continue button and the menus,
// with the colours themeVariables gives random themes in each contrast mode.
import {
  type Block,
  type Course,
  contrastOf,
  type MenuStyle,
  type Theme,
  themeColors,
} from "@course-suite/format";
import type { Locator, Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { hex, pairs, themes } from "./contrast.ts";
import { check, continueBlock, course, lesson, paragraph, quiz } from "./courses.ts";
import { expect, playerEvents, test, useHooks } from "./fixture.ts";

const THEMES = [
  [undefined, "the default theme"],
  [{ color: "#1b2a49" }, "a dark theme colour"],
] as const;

/** A check whose right answer is "Yes", with no retry after a wrong answer. */
const oneTry = (id: string, prompt: string, requireCorrect = false): Block => {
  const block = check(id, prompt, requireCorrect);
  return { ...block, variantSettings: { ...block.variantSettings, retries: 0 } };
};

const withTheme = (subject: Course, theme: Theme | undefined): Course =>
  theme ? { ...subject, theme } : subject;

/** Presses Tab (or `key`) until `target` has the focus, at most 40 times. */
async function tabTo(page: Page, target: Locator, key = "Tab"): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

const hint = (page: Page) => page.getByText("Finish the activities above to go on");
const spent = (page: Page) => page.getByText("You have no tries left for this question");

test.describe("a continue block waiting for a knowledge check", () => {
  const gated = (theme?: Theme) =>
    withTheme(
      course([
        lesson(
          "lessongate",
          "Worms",
          oneTry("kworms0001", "Do worms eat paper?"),
          continueBlock("cworms0001", "block-above"),
          paragraph("tworms0001", "Behind the gate."),
        ),
      ]),
      theme,
    );

  test("[rise:3G] UI-BLOCKS-R44, R45, R54, R55, R24: by keyboard, the hint stands in for the button until the check is answered; a wrong answer with no tries left still opens it", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: gated() });
    const visit = await open("#/lessons/lessongate");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Worms");
    await expect(hint(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByText("Behind the gate.")).toBeHidden();

    await tabTo(page, page.getByRole("radio", { name: "Yes" }));
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "No" })).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback")).toBeFocused();
    await expect(spent(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();
    // The check was submitted: the button takes the hint's place (UI-BLOCKS-R54, R55).
    await expect(hint(page)).toBeHidden();
    const gate = page.getByRole("button", { name: "Continue" });
    await tabTo(page, gate);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Behind the gate.")).toBeVisible();
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
  });

  for (const [theme, name] of THEMES) {
    test(`[rise:3G] UI-BLOCKS-R44, R54, R55: by pointer, the gate opens on the answer to the check above it, with no axe violation, in ${name}`, async ({
      write,
      open,
      page,
    }) => {
      await write({ course: gated(theme) });
      await open("#/lessons/lessongate");
      await expect(hint(page)).toBeVisible();
      await expectAccessible(page, "a continue block waiting for a check");
      await page.getByRole("radio", { name: "Yes" }).check();
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(page.locator(".feedback")).toContainText("Correct");
      await expect(hint(page)).toBeHidden();
      await expectAccessible(page, "the check answered, the continue button shown");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("Behind the gate.")).toBeVisible();
    });
  }
});

test.describe("a stepped microlearning holding a knowledge check", () => {
  /** Steps: an introduction, a check (with a continue block in the same step), the end. */
  const micro = (checkBlock: Block, theme?: Theme, withGate = false): Course =>
    withTheme(
      course(
        [
          lesson(
            "lessonmicr",
            "Worms in five minutes",
            paragraph("tmicro0001", "Worms turn scraps into soil."),
            withGate ? { ...checkBlock, settings: { connectToNext: true } } : checkBlock,
            ...(withGate ? [continueBlock("cmicro0001", "block-above")] : []),
            paragraph("tmicro0002", "You made it to the end."),
          ),
        ],
        {
          kind: "microlearning",
          title: "Worms in five minutes",
          navigation: { steps: true, stepIndicator: "numbers" },
        },
      ),
      theme,
    );
  const step = (page: Page, n: number) => page.getByRole("button", { name: `Step ${n} of 3` });
  const finished = async (page: Page) =>
    (await playerEvents(page)).some((event) => event.type === "course-finished");

  for (const [theme, name] of THEMES) {
    test(`[rise:R16] UI-BLOCKS-R25, R58, R24: a required check with no tries left keeps the later steps locked with their reason; the learner still moves back by pointer and keys, and the microlearning is not finished, in ${name}`, async ({
      write,
      open,
      page,
    }) => {
      await useHooks(page);
      // Tall enough that each step fits: the next arrow moves on rather than scrolling.
      await page.setViewportSize({ width: 1280, height: 1200 });
      await write({ course: micro(oneTry("kmicro0001", "Do worms eat paper?", true), theme) });
      await open("#/lessons/lessonmicr");
      await page.getByRole("button", { name: "Next step" }).click();
      await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
      await expect(page.locator(".check-notice")).toBeVisible();
      await expect(step(page, 3)).toHaveAttribute("aria-disabled", "true");

      await page.getByRole("radio", { name: "No" }).check();
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(spent(page)).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeHidden();
      // UI-BLOCKS-R58: the step after the check stays locked, disabled with its reason.
      await expect(step(page, 3)).toHaveAttribute("aria-disabled", "true");
      await expect(step(page, 3)).toHaveAccessibleDescription(
        "Locked until the step before it is done",
      );
      await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
      await step(page, 3).click({ force: true });
      await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
      await expectAccessible(page, "a stepped check with no tries left");

      // Not trapped in the step: back by the previous arrow, forward by the down arrow key, and
      // no further.
      await page.getByRole("button", { name: "Previous step" }).click();
      await expect(step(page, 1)).toHaveAttribute("aria-current", "step");
      await expect(page.getByText("Worms turn scraps into soil.")).toBeVisible();
      await page.locator("h1").focus();
      await page.keyboard.press("ArrowDown");
      await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
      await expect(spent(page)).toBeVisible();
      await page.locator("h1").focus();
      await page.keyboard.press("ArrowDown");
      await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
      await expect(page.getByText("You made it to the end.")).toBeHidden();
      expect(await finished(page)).toBe(false);
    });
  }

  test("[rise:R16] [rise:3G] UI-BLOCKS-R54, R58, R24: by keyboard, a check that is not required opens its step's continue block on a wrong answer with no tries left; the continue block opens the last step and the microlearning finishes", async ({
    write,
    open,
    page,
  }) => {
    await useHooks(page);
    await page.setViewportSize({ width: 1280, height: 1200 });
    await write({ course: micro(oneTry("kmicro0001", "Do worms eat paper?"), undefined, true) });
    await open("#/lessons/lessonmicr");
    await page.locator("h1").focus();
    await page.keyboard.press("ArrowDown");
    await expect(step(page, 2)).toHaveAttribute("aria-current", "step");
    await expect(hint(page)).toBeVisible();
    await expect(step(page, 3)).toHaveAttribute("aria-disabled", "true");

    await tabTo(page, page.getByRole("radio", { name: "Yes" }));
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(spent(page)).toBeVisible();
    await expect(hint(page)).toBeHidden();
    await tabTo(page, page.getByRole("button", { name: "Continue" }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("You made it to the end.")).toBeVisible();
    await expect(step(page, 3)).toHaveAttribute("aria-current", "step");
    await expect.poll(() => finished(page)).toBe(true);
  });
});

test.describe("a quiz with skip-ahead keeping lessons in order", () => {
  const [single] = (quiz("quizworm01", "Worm quiz").questions ?? []).slice(0, 1);
  const subject = (theme?: Theme) =>
    withTheme(
      course(
        [
          lesson("lessbefore", "Before", paragraph("tbefore001", "Worms like it damp.")),
          quiz(
            "quizworm01",
            "Worm quiz",
            { skipAhead: { entry: "lesstarget", learnerChooses: true } },
            single ? [single] : [],
          ),
          lesson("lessbetwee", "Between", paragraph("tbetween01", "Feed them greens.")),
          lesson("lesstarget", "Target", paragraph("ttarget001", "Harvest the castings.")),
        ],
        // The author allowed mark-done and search; skip-ahead turns both off (rise.md rule 14).
        { navigation: { learnerMarkDone: true, search: true } },
      ),
      theme,
    );
  const contents = (page: Page) => page.getByRole("navigation", { name: "Course contents" });
  const markDone = (page: Page) => page.getByRole("button", { name: "Mark this lesson done" });

  for (const [theme, name] of THEMES) {
    test(`[rise:R14] UI-BLOCKS-R62, R63: by keyboard, the quiz waits for the lesson before it, no page offers mark-done or search, and a pass skips the lesson between, in ${name}`, async ({
      write,
      open,
      page,
    }) => {
      await write({ course: subject(theme) });
      // Opened by its address first, the quiz says it is locked and points back.
      await open("#/lessons/quizworm01");
      await expect(page.getByRole("main")).toContainText(
        "Locked until the earlier lessons are done",
      );
      await expect(page.getByRole("button", { name: "Begin quiz" })).toHaveCount(0);
      await expect(contents(page).getByRole("link", { name: /Worm quiz/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByRole("searchbox")).toHaveCount(0);
      await expect(markDone(page)).toHaveCount(0);
      await expectAccessible(page, "a quiz locked by lessons in order");

      await tabTo(page, page.getByRole("link", { name: "Finish Before first" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Before");
      await expect(markDone(page)).toHaveCount(0);
      const quizLink = contents(page).getByRole("link", { name: /Worm quiz/ });
      await expect(quizLink).toHaveAttribute("href", "#/lessons/quizworm01");
      await expect(contents(page).getByRole("link", { name: /Target/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      await page.evaluate(() => {
        location.hash = "#/lessons/quizworm01";
      });
      await tabTo(page, page.getByRole("button", { name: "Begin quiz" }));
      await page.keyboard.press("Enter");
      await expect(markDone(page)).toHaveCount(0);
      const right = page.getByRole("radio", { name: "Brown" });
      await tabTo(page, right);
      await page.keyboard.press("Space");
      await expect(right).toBeChecked();
      await tabTo(page, page.getByRole("button", { name: "Submit" }));
      await page.keyboard.press("Enter");
      await tabTo(page, page.getByRole("button", { name: "See your result" }));
      await page.keyboard.press("Enter");
      await expectAccessible(page, "a passed quiz's result with skip ahead");
      await tabTo(page, page.getByRole("link", { name: "Skip ahead to Target" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Target");
      // The lesson skipped counts as done (UI-BLOCKS-R62); the menu says so in words.
      await expect(
        contents(page).getByRole("link", { name: /Between/ }),
      ).toHaveAccessibleDescription(/Done/);
      await expect(markDone(page)).toHaveCount(0);
    });
  }
});

test.describe("colour pairs of the checks and the quiz beside the gates and menus", () => {
  /** Text on a fill of the theme's button colour (`--button`, `--button-text`). */
  const BUTTON_FILLS = [".check .actions .button:not([hidden])", ".continue:not([hidden])"];
  /** Outcome words, marks, notices and outline statuses on the page, the panel or the menu. */
  const ON_PAGE = [
    ".check-notice",
    ".feedback.is-correct .outcome",
    ".feedback.is-wrong .outcome",
    ".choice.is-wrong .mark-chosen",
    ".mark-correct",
  ];
  const RESULT = [".quiz .actions .button", ".quiz-score", ".quiz-must-pass"];
  const STATUSES = [
    '[data-status="done"] > .outline-status',
    '[data-status="failed"] > .outline-status',
  ];
  /** The menus of M2-16 in turn: on the page's panel, and filled. */
  const MENUS: MenuStyle[] = ["light", "theme", "dark", "tint"];

  const subject = (theme: Theme | undefined, menuStyle: MenuStyle): Course =>
    withTheme(
      course(
        [
          lesson(
            "lesscolour",
            "Colours",
            check("kcolour001", "Is a worm an animal?", true),
            {
              ...check("kcolour002", "Do worms have eyes?"),
              variantSettings: { reveal: true },
            },
            continueBlock("ccolour001", "block-above"),
            paragraph("tcolour001", "The end of the lesson."),
          ),
          quiz(
            "quizcolour",
            "Colour quiz",
            { requirePassing: true, retries: 1 },
            (quiz("quizcolour", "Colour quiz").questions ?? []).slice(0, 1),
          ),
        ],
        { navigation: { menuStyle } },
      ),
      theme,
    );

  async function expectReadable(page: Page, theme: Theme | undefined, selectors: string[]) {
    const name = theme ? JSON.stringify(theme) : "the default theme";
    const button = themeColors(theme).button;
    const found = await pairs(page, selectors);
    for (const selector of selectors) {
      expect(
        found.some((pair) => pair.selector === selector),
        `${selector} in ${name}`,
      ).toBe(true);
    }
    for (const { selector, fill, text } of found) {
      if (BUTTON_FILLS.includes(selector) || selector === RESULT[0]) {
        expect(hex(fill), `${selector} fill in ${name}`).toBe(button);
      }
      expect(contrastOf(hex(fill), hex(text)), `${selector} in ${name}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  }

  const cases: [string, (Theme | undefined)[]][] = [
    ["the default theme and a dark theme colour", [undefined, { color: "#1b2a49" }]],
    ["random colours with automatic contrast", themes("auto", 4, 0x9a7e1)],
    ["random colours with light text", themes("light", 4, 0x9a7e2)],
    ["random colours with dark text", themes("dark", 4, 0x9a7e3)],
  ];

  for (const [name, list] of cases) {
    test(`[rise:R18] [rise:3C] [rise:3I] UI-BLOCKS-R20, R23, R55, ENG-08: the check's buttons, outcome words and marks, the continue button, the quiz result and the outline's done and failed marks in each menu keep 4.5:1 in ${name}`, async ({
      write,
      open,
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      for (const [i, theme] of list.entries()) {
        await write({ course: subject(theme, MENUS[i % MENUS.length] as MenuStyle) });
        // A new document for each theme: the same address again would only move to its fragment.
        await page.goto("about:blank");
        await open("#/lessons/lesscolour");
        await page.getByRole("radio", { name: "Yes" }).first().check();
        await page.getByRole("button", { name: "Check answer" }).first().click();
        const second = page.locator("form.check").nth(1);
        await second.getByRole("radio", { name: "No" }).check();
        await second.getByRole("button", { name: "Check answer" }).click();
        await expect(second.getByRole("button", { name: "Try again" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
        await expectReadable(page, theme, [...BUTTON_FILLS, ...ON_PAGE]);
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByText("The end of the lesson.")).toBeVisible();

        await page.evaluate(() => {
          location.hash = "#/lessons/quizcolour";
        });
        await page.getByRole("button", { name: "Begin quiz" }).click();
        await page.getByRole("radio", { name: "Green" }).check();
        await page.getByRole("button", { name: "Submit" }).click();
        await page.getByRole("button", { name: "See your result" }).click();
        await expect(page.getByRole("button", { name: "Retake quiz" })).toBeVisible();
        await expectReadable(page, theme, [...RESULT, ...STATUSES]);
      }
    });
  }
});
