// M2-16 (BLK-08): which blocks a continue block may wait for, the steps of a stepped microlearning
// and how much of it counts as viewed, and restricted navigation in the progress engine.
import type { Block, LessonEntry } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import { check, continueBlock, course, lesson, newId, quiz, text } from "../test/courses.js";
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

  test("[rise:R16] only the steps reached count as viewed, so the lesson is done at the last step", () => {
    const page = lesson(text(), connected(), text(), text());
    const micro = course([page], { kind: "microlearning", navigation: { steps: true } });
    const progress = createProgress(micro);
    progress.view(page);
    expect(progress.percent(page)).toBe(25);
    progress.reach(page, 3);
    expect(progress.percent(page)).toBe(75);
    expect(progress.isDone(page.id)).toBe(false);
    progress.reach(page, 4);
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
