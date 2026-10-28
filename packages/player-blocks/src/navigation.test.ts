// M2-16 (BLK-08): which blocks a continue block may wait for, the steps of a stepped microlearning
// and how much of it counts as viewed, and restricted navigation in the progress engine; with
// M2-15, knowledge checks and quiz lessons at those gates.
import type { Block, LessonEntry } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  answersOf,
  check,
  continueBlock,
  course,
  lesson,
  newId,
  quiz,
  text,
} from "../test/courses.js";
import { canBeRequired, createProgress, stepsOf } from "./progress.js";

const block = (category: string, variant: string, extra: Partial<Block> = {}): Block => ({
  id: newId("b"),
  category: category as Block["category"],
  variant,
  ...extra,
});

describe("blocks a continue block may wait for", () => {
  const plain = course([]);
  test("[rise:3G] UI-BLOCKS-R19: buttons and attachments never can", () => {
    for (const one of [
      block("interactive", "button"),
      block("interactive", "buttons"),
      block("multimedia", "attachment"),
    ]) {
      expect(canBeRequired(plain, one)).toBe(false);
    }
  });

  test("[rise:3G] UI-BLOCKS-R45: blocks finished by an action can; blocks finished by being seen cannot", () => {
    for (const one of [
      block("interactive", "accordion"),
      block("interactive", "tabs"),
      block("interactive", "process"),
      block("list", "checkbox"),
      block("gallery", "carousel"),
      check(),
    ]) {
      expect(canBeRequired(plain, one), `${one.category}/${one.variant}`).toBe(true);
    }
    for (const one of [text(), block("image", "centered"), continueBlock()]) {
      expect(canBeRequired(plain, one), `${one.category}/${one.variant}`).toBe(false);
    }
  });

  test("UI-BLOCKS-EDITOR-R37: audio can only with forward seeking off and a file to play", () => {
    const withClip = course([], {
      media: [{ id: "mediaclip1", key: "clip.mp3", mimeType: "audio/mpeg", source: "upload" }],
    });
    const audio = (forwardSeeking: boolean) =>
      block("multimedia", "audio", {
        variantSettings: { forwardSeeking },
        media: [{ key: "clip.mp3" }],
      });
    expect(canBeRequired(withClip, audio(false))).toBe(true);
    expect(canBeRequired(withClip, audio(true))).toBe(false);
    expect(canBeRequired(plain, audio(false))).toBe(false);
  });
});

describe("continue blocks", () => {
  test("[rise:R13] all above counts only the blocks since the previous continue block", () => {
    const earlier = check();
    const first = continueBlock();
    const later = check();
    const gate = continueBlock("all-above");
    const page = lesson(earlier, first, text(), later, gate);
    const progress = createProgress(course([page]));
    progress.view(page);
    progress.pressContinue(page, first);
    // The check above the first continue block was never answered, and does not count.
    expect(progress.continueReady(page, gate)).toBe(false);
    progress.answerCheck(page, later, "x", false);
    expect(progress.continueReady(page, gate)).toBe(true);
  });
});

// Knowledge checks and quiz lessons (M2-15) at the gates and steps of M2-16.
describe("knowledge checks and quiz lessons at the gates", () => {
  const limited = (retries: number, requireCorrect = false): Block => ({
    ...check(),
    variantSettings: { retries, ...(requireCorrect && { requireCorrect }) },
  });
  const wrong = (kc: Block) => answersOf(kc.question as never).wrong;
  /** Which steps of `page` the stepper locks: those from the first block not shown on. */
  const lockedSteps = (progress: ReturnType<typeof createProgress>, page: LessonEntry) =>
    stepsOf(page.blocks).map((step) => step.start >= progress.shownBlocks(page));

  test("[rise:3G] UI-BLOCKS-R45: a continue block can wait for a knowledge check the player shows, by the renderer's rule, and for no other", () => {
    const plain = course([]);
    const otherType: Block = { ...check(), variant: "fill-in" };
    expect(canBeRequired(plain, check())).toBe(true);
    for (const one of [
      otherType,
      block("knowledge-check", "single-choice"),
      block("knowledge-check", "bank-draw"),
    ]) {
      expect(canBeRequired(plain, one), one.variant).toBe(false);
    }
    // Even marked required, a check the player shows nothing for holds nothing back.
    const page = lesson(
      { ...otherType, variantSettings: { requireCorrect: true } },
      continueBlock("all-above"),
      text(),
    );
    const progress = createProgress(course([page]));
    expect(progress.shownBlocks(page)).toBe(2);
    progress.view(page);
    expect(progress.continueReady(page, page.blocks[1] as Block)).toBe(true);
  });

  test("UI-BLOCKS-R54, R24: a continue block waiting for a check opens once it is submitted, wrong with no tries left too", () => {
    const kc = limited(0);
    const gate = continueBlock("block-above");
    const page = lesson(kc, gate, text());
    const progress = createProgress(course([page]));
    progress.view(page);
    expect(progress.continueReady(page, gate)).toBe(false);
    progress.answerCheck(page, kc, wrong(kc), false);
    expect(progress.check(kc).triesLeft).toBe(0);
    expect(progress.continueReady(page, gate)).toBe(true);
  });

  test("[rise:R16] UI-BLOCKS-R25, R58: in a stepped microlearning a required check with no tries left keeps the steps after it locked, the steps before it open, and the microlearning not done", () => {
    const kc = limited(0, true);
    const page = lesson(text(), kc, text(), text());
    const micro = course([page], { kind: "microlearning", navigation: { steps: true } });
    const progress = createProgress(micro);
    progress.view(page);
    progress.showStep(page, 1);
    expect(lockedSteps(progress, page)).toEqual([false, false, true, true]);
    progress.answerCheck(page, kc, wrong(kc), false);
    expect(progress.check(kc)).toMatchObject({ triesLeft: 0, canRetry: false });
    expect(lockedSteps(progress, page)).toEqual([false, false, true, true]);
    progress.showStep(page, 0);
    expect(progress.percent(page)).toBe(25);
    expect(progress.courseDone()).toBe(false);

    // Not required, the same wrong answer opens the steps after it.
    const free = lesson(text(), limited(0), text(), text());
    const other = createProgress(
      course([free], { kind: "microlearning", navigation: { steps: true } }),
    );
    other.view(free);
    other.showStep(free, 1);
    other.answerCheck(free, free.blocks[1] as Block, wrong(free.blocks[1] as Block), false);
    expect(lockedSteps(other, free)).toEqual([false, false, false, false]);
    other.showStep(free, 2);
    other.showStep(free, 3);
    expect(other.courseDone()).toBe(true);
  });

  test("[rise:R14] UI-BLOCKS-R62, R63: a quiz with skip-ahead puts lessons in order: the quiz waits for the lesson before it, mark-done is offered on no page, and a pass marks the lessons skipped done", () => {
    const before = lesson(text());
    const between = lesson(text());
    const target = lesson(text());
    const skipping = quiz(1, { skipAhead: { entry: target.id } });
    const progress = createProgress(
      course([before, skipping, between, target], { navigation: { learnerMarkDone: true } }),
    );
    expect(progress.restricted).toBe(true);
    expect(progress.lockedBy(skipping)).toBe(before);
    expect(progress.lockedBy(target)).toBe(before);
    for (const page of progress.pages) expect(progress.canMarkDone(page), page.id).toBe(false);
    progress.view(before);
    expect(progress.lockedBy(skipping)).toBeUndefined();
    expect(progress.lockedBy(target)).toBe(skipping);
    const [only] = progress.startAttempt(skipping).questions;
    if (!only) throw new Error("no question");
    progress.answerQuestion(skipping, only, answersOf(only as never).right);
    progress.submitAttempt(skipping);
    expect(progress.isDone(between.id)).toBe(true);
    expect(progress.lockedBy(target)).toBeUndefined();
    expect(progress.status(target)).toBe("not-started");
  });
});

describe("stepped microlearning", () => {
  const connected = (): Block => ({ ...text(), settings: { connectToNext: true } });

  test("[rise:3D] a block connected to the next shows with it in one step; the last block cannot join a next one", () => {
    const blocks = [text(), connected(), text(), connected()];
    expect(stepsOf(blocks)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
      { start: 3, end: 4 },
    ]);
  });

  test("[rise:R16] UI-BLOCKS-R46: only the steps shown count as viewed, so the lesson is done once every step was shown", () => {
    const page = lesson(text(), connected(), text(), text());
    const micro = course([page], { kind: "microlearning", navigation: { steps: true } });
    const progress = createProgress(micro);
    progress.view(page);
    expect(progress.percent(page)).toBe(25);
    progress.showStep(page, 1);
    expect(progress.percent(page)).toBe(75);
    expect(progress.isDone(page.id)).toBe(false);
    progress.showStep(page, 2);
    expect(progress.courseDone()).toBe(true);
  });

  test("[rise:R16] UI-BLOCKS-R46: jumping ahead to the last step does not count the steps jumped over", () => {
    const page = lesson(text(), text(), connected(), text(), text());
    const micro = course([page], { kind: "microlearning", navigation: { steps: true } });
    const progress = createProgress(micro);
    progress.view(page);
    // Steps: [0], [1], [2, 3], [4]. From step 1 the learner presses the last step's button.
    progress.showStep(page, 3);
    expect(progress.percent(page)).toBe(40);
    expect(progress.courseDone()).toBe(false);
    expect(progress.status(page)).toBe("in-progress");
    // Going back to the steps jumped over finishes the lesson.
    progress.showStep(page, 2);
    expect(progress.percent(page)).toBe(80);
    progress.showStep(page, 1);
    expect(progress.courseDone()).toBe(true);
  });

  test("[rise:R16] a microlearning that scrolls counts the whole lesson when seen", () => {
    const page = lesson(text(), text());
    const progress = createProgress(course([page], { kind: "microlearning" }));
    progress.view(page);
    expect(progress.courseDone()).toBe(true);
  });
});

describe("restricted navigation", () => {
  test("[rise:R14] lessons open in order, and learners cannot mark one done", () => {
    const pages: LessonEntry[] = [lesson(check(), continueBlock("block-above")), lesson(text())];
    const restricted = createProgress(
      course(pages, { navigation: { restricted: true, learnerMarkDone: true } }),
    );
    expect(restricted.lockedBy(pages[1] as LessonEntry)).toBe(pages[0]);
    expect(restricted.canMarkDone(pages[0] as LessonEntry)).toBe(false);
    const free = createProgress(course(pages, { navigation: { learnerMarkDone: true } }));
    expect(free.lockedBy(pages[1] as LessonEntry)).toBeUndefined();
    expect(free.canMarkDone(pages[0] as LessonEntry)).toBe(true);
  });

  test("[rise:R14] a quiz with skip-ahead turns it on, and quizzes are never marked done", () => {
    const target = lesson(text());
    const skipping = quiz(1, { skipAhead: { entry: target.id } });
    const progress = createProgress(
      course([lesson(text()), skipping, target], { navigation: { learnerMarkDone: true } }),
    );
    expect(progress.restricted).toBe(true);
    const free = createProgress(course([quiz(1)], { navigation: { learnerMarkDone: true } }));
    expect(free.canMarkDone(free.pages[0] as LessonEntry)).toBe(false);
  });
});
