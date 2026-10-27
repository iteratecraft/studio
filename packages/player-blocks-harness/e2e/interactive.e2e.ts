// The interactive blocks in the real player (M2-14, BLK-06; rise.md 3C, 3G, 3N; blocks-interactions.md
// 2.2 to 2.10, 4, UI-BLOCKS-R1 to R8, R12, R13, R18, R19, R52, R56; accessibility.md
// UI-ACCESSIBILITY-R36): every variant shows with no WCAG 2.2 A or AA violation and no sideways
// scrolling from 320 to 1280 px, on the default theme and a dark one; each works by keyboard and by
// pointer, and holds back a continue block until its own completion rule is met.
import {
  type Block,
  type Course,
  contrastOf,
  type LessonEntry,
  type Theme,
  themeColors,
} from "@course-suite/format";
import { interactiveBlocksCourse } from "@course-suite/format/test/courses";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./axe.ts";
import { continueBlock, course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const read = () => interactiveBlocksCourse();
const WIDTHS = [320, 375, 768, 1280] as const;
const lessonOf = (subject: Course, index: number) =>
  subject.entries.filter((entry): entry is LessonEntry => entry.kind === "lesson")[
    index
  ] as LessonEntry;
const block = (subject: Course, id: string) =>
  subject.entries
    .flatMap((entry) => (entry.kind === "lesson" ? entry.blocks : []))
    .find((b) => b.id === id) as Block;

/** The block `id` of the fixture alone in a lesson, with a continue block waiting for it. */
function gated(id: string): Course {
  const subject = read();
  return course(
    [lesson("lessongate", "Gate", block(subject, id), continueBlock("cgate00001", "block-above"))],
    {
      media: subject.media,
    },
  );
}

const gate = (page: Page) => page.getByRole("button", { name: "Continue" });
const expectLocked = (page: Page) => expect(gate(page)).toHaveAttribute("aria-disabled", "true");
const expectOpen = (page: Page) => expect(gate(page)).not.toHaveAttribute("aria-disabled");

for (const [theme, name] of [
  [undefined, "the default theme"],
  [{ color: "#1b2a49" }, "a dark theme colour"],
] as const) {
  test(`[rise:3C] [rise:3N] BLK-06: every interactive variant shows in the player, accessible and without sideways scrolling at 320, 375, 768 and 1280 px, in ${name}`, async ({
    write,
    open,
    page,
  }) => {
    const subject = read();
    if (theme) subject.theme = theme as Theme;
    await write({ course: subject });
    for (const [index, title] of [
      [0, "Sections and tabs"],
      [1, "Pictures and steps"],
      [2, "Cards and buttons"],
    ] as const) {
      const entry = lessonOf(subject, index);
      await page.goto("about:blank");
      const visit = await open(`#/lessons/${entry.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator(".blocks > [data-block]")).toHaveCount(entry.blocks.length);
      expect(visit.errors).toEqual([]);
      expect(visit.badRequests).toEqual([]);
      await expectAccessible(page, `${title} in ${name}`, WIDTHS);
    }
    // Opened states: a section, a marker's card, a process step and turned cards.
    await open(`#/lessons/${lessonOf(subject, 0).id}`);
    await page.getByRole("button", { name: "Tyres" }).click();
    await expectAccessible(page, `an open section in ${name}`, [320, 1280]);
    await open(`#/lessons/${lessonOf(subject, 1).id}`);
    await page.getByRole("button", { name: /^Marker 2/ }).click();
    await page.getByRole("button", { name: "Begin" }).click();
    await expectAccessible(page, `an open marker and a process step in ${name}`, [320, 1280]);
    await open(`#/lessons/${lessonOf(subject, 2).id}`);
    for (const turn of await page.getByRole("button", { name: "Turn card" }).all()) {
      if (await turn.isVisible()) await turn.click();
    }
    await expectAccessible(page, `turned flashcards in ${name}`, [320, 1280]);
  });
}

test("[rise:3C] UI-BLOCKS-R1, blocks-interactions 4: by keyboard an accordion opens and closes its sections, each a named region, one at a time where the author asked", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 0).id}`);
  const tyres = page.getByRole("button", { name: "Tyres" });
  await expect(tyres).toHaveAttribute("aria-expanded", "false");
  // The section titles sit in headings one level below the lesson title.
  await expect(page.getByRole("heading", { level: 2, name: "Tyres" })).toBeVisible();
  await tyres.focus();
  await page.keyboard.press("Enter");
  await expect(tyres).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "Tyres" })).toContainText("Pump them");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Chain" })).toBeFocused();
  await page.keyboard.press("Space");
  // Several may be open at once.
  await expect(page.getByRole("region", { name: "Tyres" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Chain" })).toBeVisible();
  await tyres.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Tyres" })).toBeHidden();
  // One at a time: opening a section closes the other.
  const before = page.getByRole("button", { name: "Before a ride" });
  const after = page.getByRole("button", { name: "After a ride" });
  await before.click();
  await after.click();
  await expect(before).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "After a ride" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Before a ride" })).toBeHidden();
});

test("[rise:3C] [rise:3N] UI-BLOCKS-R2, blocks-interactions 4: tabs choose the first tab, move with arrows that wrap, keep only the chosen panel, and scroll sideways in their own strip at phone width", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 0).id}`);
  const list = page.getByRole("tablist");
  const tabs = list.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel")).toContainText("rust");
  await tabs.first().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(list.getByRole("tab", { name: "Every season" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Every season" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tabpanel", { name: "Winter" })).toContainText("salt");
  // Tab goes from the strip into the panel.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "Winter" })).toBeFocused();
  // By pointer.
  await list.getByRole("tab", { name: "Summer" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("dust");
  // At phone width the strip scrolls, the page does not (rise.md 3N, WCAG 1.4.10).
  await page.setViewportSize({ width: 320, height: 700 });
  const sizes = await list.evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(sizes[0]).toBeGreaterThan(sizes[1] as number);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await list.getByRole("tab", { name: "Every season" }).focus();
  await expect(list.getByRole("tab", { name: "Every season" })).toBeInViewport();
});

test("[rise:3C] BLK-06: a marker placed at given percentages lands on the same point of the picture at every width", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 1).id}`);
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const points = await page.locator(".graphic").evaluate((figure) => {
      const image = figure.querySelector("img")?.getBoundingClientRect() as DOMRect;
      return [...figure.querySelectorAll<HTMLElement>(".marker")].map((marker) => {
        const box = marker.getBoundingClientRect();
        return [
          ((box.x + box.width / 2 - image.x) / image.width) * 100,
          ((box.y + box.height / 2 - image.y) / image.height) * 100,
        ];
      });
    });
    const expected = [
      [20, 70],
      [50.5, 40],
      [82, 66],
    ];
    points.forEach(([x, y], i) => {
      expect(x, `marker ${i + 1} across at ${width} px`).toBeCloseTo(expected[i]?.[0] as number, 0);
      expect(y, `marker ${i + 1} down at ${width} px`).toBeCloseTo(expected[i]?.[1] as number, 0);
    });
  }
});

test("[rise:3C] UI-BLOCKS-R3 to R5, UI-ACCESSIBILITY-R36: markers announce their number, icon, title and viewed state; one card opens at a time, steps on with its buttons and arrows, and Escape closes it", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 1).id}`);
  const figure = page.getByRole("figure", { name: "Labelled image" });
  const markers = figure.getByRole("listitem").getByRole("button");
  await expect(markers).toHaveCount(3);
  await expect(markers.nth(0)).toHaveAccessibleName("Marker 1: Back wheel, not viewed");
  await expect(markers.nth(1)).toHaveAccessibleName("Marker 2 (star): Saddle, not viewed");
  await expect(markers.nth(2)).toHaveAccessibleName(
    "Marker 3 (information sign): Front wheel, not viewed",
  );
  await markers.nth(0).focus();
  await page.keyboard.press("Enter");
  const card = page.getByRole("dialog", { name: "Back wheel" });
  await expect(card).toBeFocused();
  await expect(card).toContainText("quick release");
  await expect(markers.nth(0)).toHaveAccessibleName("Marker 1: Back wheel, viewed");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Saddle" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(markers.nth(1)).toHaveAccessibleName("Marker 2 (star): Saddle, viewed");
  await page.getByRole("button", { name: "Next marker" }).click();
  await expect(page.getByRole("dialog", { name: "Front wheel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next marker" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("button", { name: "Next marker" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(markers.nth(2)).toBeFocused();
  // By pointer: the close button, and focus back on the marker.
  await markers.nth(1).click();
  await page.getByRole("button", { name: "Close marker" }).click();
  await expect(markers.nth(1)).toBeFocused();
  // Coming back to the lesson starts the markers again (UI-BLOCKS-R5).
  await open(`#/lessons/${lessonOf(subject, 0).id}`);
  await open(`#/lessons/${lessonOf(subject, 1).id}`);
  await expect(markers.nth(0)).toHaveAccessibleName("Marker 1: Back wheel, not viewed");
});

test("[rise:3C] UI-BLOCKS-R6 to R8, BLK-06: a process starts on its introduction, begins, moves by its strip and arrows, leaves out the hidden step and starts again from its summary", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 1).id}`);
  const process = page.getByRole("region", { name: "Process" });
  await expect(process).toHaveAttribute("aria-roledescription", "carousel");
  const strip = process.getByRole("group", { name: "Steps" }).getByRole("button");
  // Introduction, three steps (one hidden is left out), summary.
  await expect(strip).toHaveCount(5);
  await expect(strip.nth(0)).toHaveAccessibleName("Introduction");
  await expect(strip.nth(3)).toHaveAccessibleName("Step 3");
  await expect(process).not.toContainText("A step left out for now");
  const previous = process.getByRole("button", { name: "Previous step" });
  const next = process.getByRole("button", { name: "Next step" });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(process.getByRole("group", { name: "1 of 5" })).toContainText("Fixing a puncture");
  await process.getByRole("button", { name: "Begin" }).focus();
  await page.keyboard.press("Enter");
  // Focus lands on the strip, not the card (UI-BLOCKS-R8).
  await expect(strip.nth(1)).toBeFocused();
  await expect(strip.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(process.getByRole("group", { name: "2 of 5" })).toContainText("Step 1");
  await page.keyboard.press("ArrowRight");
  await expect(strip.nth(2)).toBeFocused();
  await expect(process.getByRole("group", { name: "3 of 5" })).toContainText("Find the hole");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(process.getByRole("group", { name: "5 of 5" })).toContainText("Ready to ride");
  await process.getByRole("button", { name: "Start again" }).click();
  await expect(strip.nth(0)).toBeFocused();
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  // By pointer: the arrows and a strip button.
  await next.click();
  await expect(process.getByRole("group", { name: "2 of 5" })).toBeVisible();
  await strip.nth(4).click();
  await expect(process.getByRole("group", { name: "5 of 5" })).toBeVisible();
});

test("[rise:3C] UI-BLOCKS-R12, R70, blocks-interactions 4: flashcards turn by their button or a press, keep both sides as groups, and a stack moves card by card keeping each card's side", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 2).id}`);
  const grid = page.locator("[data-block=iacardgrid]");
  const first = grid.locator(".flashcard").first();
  await expect(first.getByRole("group", { name: "Front" })).toContainText("Cassette");
  await expect(first.getByRole("group", { name: "Back" })).toContainText("gears");
  const turn = first.getByRole("button", { name: "Turn card" });
  await expect(turn).toHaveAttribute("aria-pressed", "false");
  await turn.focus();
  await page.keyboard.press("Enter");
  await expect(turn).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveClass(/is-turned/);
  await expect(first.locator(".card-hint")).toHaveText("Turn the card over to see the other side");
  // A press on the card turns it back.
  await first.locator(".card-faces").click();
  await expect(turn).toHaveAttribute("aria-pressed", "false");

  const stack = page.getByRole("region", { name: "Flashcards" });
  await expect(stack.locator(".carousel-position")).toHaveText("Card 1 of 3");
  await expect(stack.locator(".card-hint")).toHaveCount(0);
  const turnFirst = stack
    .getByRole("group", { name: "Card 1 of 3" })
    .getByRole("button", { name: "Turn card" });
  await turnFirst.click();
  await stack.getByRole("button", { name: "Next card" }).focus();
  await page.keyboard.press("Enter");
  await expect(stack.locator(".carousel-position")).toHaveText("Card 2 of 3");
  await page.keyboard.press("ArrowLeft");
  await expect(stack.locator(".carousel-position")).toHaveText("Card 1 of 3");
  await expect(turnFirst).toHaveAttribute("aria-pressed", "true");
});

test("[rise:3C] UI-BLOCKS-R18, R19, BLK-06: buttons go to a lesson in the same window, a web page in a new tab, and exit ends the course", async ({
  write,
  open,
  page,
}) => {
  const subject = read();
  await write({ course: subject });
  await open(`#/lessons/${lessonOf(subject, 2).id}`);
  const back = page.getByRole("link", { name: "Back to the sections" });
  await expect(back).toHaveAttribute("href", "#/lessons/ialessfold");
  await expect(back).not.toHaveAttribute("target");
  await expect(page.locator("[data-block=iabutton01]")).toContainText("Read the sections again");
  const guide = page.getByRole("link", { name: /^A maintenance guide/ });
  await expect(guide).toHaveAttribute("target", "_blank");
  await expect(guide).toHaveAttribute("rel", "noopener noreferrer");
  await expect(guide).toHaveAccessibleName("A maintenance guide (opens in a new tab)");
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sections and tabs");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cards and buttons");
  await page.getByRole("button", { name: "Leave the course" }).click();
  await expect(
    page.getByText("You have left the course. You can close this window now."),
  ).toBeVisible();
});

test("[rise:3G] BLK-06, UI-BLOCKS-R1, R2, R4, R6, R13, R19: each block holds back the continue block below it until its own rule is met, by keyboard", async ({
  write,
  open,
  page,
}) => {
  // Accordion: every section opened.
  await write({ course: gated("iaaccord01") });
  await open("#/lessons/lessongate");
  await expectLocked(page);
  for (const name of ["Tyres", "Chain", "Brakes"]) {
    await page.getByRole("button", { name }).focus();
    await page.keyboard.press("Enter");
  }
  await expectOpen(page);

  // Tabs: every tab shown; the first counts on sight.
  await write({ course: gated("iatabs0001") });
  await page.goto("about:blank");
  await open("#/lessons/lessongate");
  await page.getByRole("tab").first().focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expectLocked(page);
  await page.keyboard.press("ArrowRight");
  await expectOpen(page);

  // Labeled graphic: every marker opened.
  await write({ course: gated("ialabeled1") });
  await page.goto("about:blank");
  await open("#/lessons/lessongate");
  await page.getByRole("button", { name: /^Marker 1/ }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expectLocked(page);
  await page.keyboard.press("ArrowRight");
  await expectOpen(page);

  // Process: every card shown, the hidden one not waited for.
  await write({ course: gated("iaprocess1") });
  await page.goto("about:blank");
  await open("#/lessons/lessongate");
  await page.getByRole("button", { name: "Begin" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expectLocked(page);
  await page.keyboard.press("ArrowRight");
  await expectOpen(page);

  // Flashcards: every card turned over.
  await write({ course: gated("iacardgrid") });
  await page.goto("about:blank");
  await open("#/lessons/lessongate");
  const turns = page.getByRole("button", { name: "Turn card" });
  for (let i = 0; i < 4; i++) {
    if (i === 3) await expectLocked(page);
    await turns.nth(i).focus();
    await page.keyboard.press("Space");
  }
  await expectOpen(page);

  // Buttons never hold anything back.
  await write({ course: gated("iabuttons1") });
  await page.goto("about:blank");
  await open("#/lessons/lessongate");
  await expectOpen(page);
});

test("[rise:3G] UI-BLOCKS-R52, R56: a flashcard stack waits for turned cards, not shown ones, and one turned back stays done", async ({
  write,
  open,
  page,
}) => {
  await write({ course: gated("iacardstak") });
  await open("#/lessons/lessongate");
  const stack = page.getByRole("region", { name: "Flashcards" });
  await stack.getByRole("button", { name: "Next card" }).click();
  await stack.getByRole("button", { name: "Next card" }).click();
  await expectLocked(page);
  for (const n of [3, 2, 1]) {
    const turn = stack
      .getByRole("group", { name: `Card ${n} of 3` })
      .getByRole("button", { name: "Turn card" });
    await turn.click();
    await turn.click();
    if (n > 1) await stack.getByRole("button", { name: "Previous card" }).click();
  }
  await expectOpen(page);
});

/** Text on the interactive blocks' fills and on the page, with the fill behind it. */
async function pairs(page: Page, selectors: string[]) {
  return page.evaluate((list) => {
    const fillOf = (element: Element | null): string => {
      for (let at = element; at; at = at.parentElement) {
        const fill = getComputedStyle(at).backgroundColor;
        if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") return fill;
      }
      return "rgb(255, 255, 255)";
    };
    return list.flatMap((selector) =>
      [...document.querySelectorAll(selector)].map((found) => {
        const style = getComputedStyle(found);
        return { selector, fill: fillOf(found), text: style.color };
      }),
    );
  }, selectors);
}

const hex = (color: string) =>
  `#${(color.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map((c) => Number(c).toString(16).padStart(2, "0"))
    .join("")}`;

for (const theme of [
  undefined,
  { color: "#ffd400" },
  { color: "#1b2a49" },
  { color: "#e63946", contrast: "auto" as const },
]) {
  const name = theme ? JSON.stringify(theme) : "the default theme";
  test(`[rise:R18] BLK-06, ENG-08: the buttons, the chosen step, the markers and turned cards keep 4.5:1 with the colours themeVariables gives ${name}`, async ({
    write,
    open,
    page,
  }) => {
    const subject = read();
    if (theme) subject.theme = theme;
    await write({ course: subject });
    await open(`#/lessons/${lessonOf(subject, 2).id}`);
    await page.locator("[data-block=iacardgrid] .card-turn").first().click();
    const button = themeColors(theme).button;
    const fills = await pairs(page, [".block-button", ".card-turn[aria-pressed=true]"]);
    expect(fills.length).toBeGreaterThan(4);
    for (const { selector, fill, text } of fills) {
      if (selector === ".block-button") expect(hex(fill), `${selector} in ${name}`).toBe(button);
      expect(contrastOf(hex(fill), hex(text)), `${selector} in ${name}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    await open(`#/lessons/${lessonOf(subject, 1).id}`);
    const accent = themeColors(theme).accent;
    for (const { selector, fill, text } of await pairs(page, [
      ".marker",
      ".process-strip-button[aria-current=step]",
    ])) {
      expect(hex(fill), `${selector} in ${name}`).toBe(accent);
      expect(contrastOf(hex(fill), hex(text)), `${selector} in ${name}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
}
