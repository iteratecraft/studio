import type { Block, LessonEntry, QuizEntry } from "@course-suite/format";
import { decodeResume, encodeResume, RESUME_CAPS } from "@course-suite/tracking";
import { describe, expect, test } from "vitest";
import {
  answersOf,
  check,
  continueBlock,
  course,
  lesson,
  newId,
  question,
  quiz,
  text,
} from "../test/courses.js";
import {
  createProgress,
  ESTIMATED_ATTEMPTS,
  largestResume,
  requirement,
  shownItems,
} from "./progress.js";

const texts = (count: number) => Array.from({ length: count }, text);

/** A clip in the media index, and a multimedia block that plays `key` (null: no file chosen). */
const clip = {
  id: "mediaclip1",
  key: "clip.mp4",
  mimeType: "video/mp4",
  source: "upload",
} as const;
const media = (
  variant: string,
  forwardSeeking?: boolean,
  key: string | null = clip.key,
): Block => ({
  id: newId("m"),
  category: "multimedia",
  variant,
  ...(forwardSeeking !== undefined && { variantSettings: { forwardSeeking } }),
  ...(key !== null && { media: [{ key }] }),
});

describe("lesson and course percentages", () => {
  test("[rise:R5] 2 of 3 blocks is 67% and 13 of 20 is 65%", () => {
    const short = lesson(text(), text(), continueBlock());
    const long = lesson(...texts(13), continueBlock(), ...texts(6));
    const progress = createProgress(course([short, long]));
    progress.view(short);
    progress.view(long);
    expect(progress.percent(short)).toBe(67);
    expect(progress.percent(long)).toBe(65);
  });

  test("[rise:R5] 1 of 4 lessons is 25% and 1 of 2 is 50%", () => {
    const four = [lesson(text()), lesson(text()), lesson(text()), lesson(text())];
    const progress = createProgress(course(four));
    progress.view(four[0] as LessonEntry);
    expect(progress.coursePercent()).toBe(25);
    const two = [lesson(text()), lesson(text())];
    const other = createProgress(course(two));
    other.view(two[1] as LessonEntry);
    expect(other.coursePercent()).toBe(50);
  });

  test("a lesson without gates is done as soon as it is viewed, an empty one too", () => {
    const plain = lesson(text(), check(), text());
    const empty = lesson();
    const progress = createProgress(course([plain, empty]));
    expect(progress.status(plain)).toBe("not-started");
    progress.view(plain);
    progress.view(empty);
    expect(progress.status(plain)).toBe("done");
    expect(progress.percent(empty)).toBe(100);
    expect(progress.courseDone()).toBe(true);
  });

  test("[rise:R16] a microlearning course is done when it has been viewed in full", () => {
    const only = lesson(text(), continueBlock(), text());
    const progress = createProgress(course([only], { kind: "microlearning" }));
    progress.view(only);
    expect(progress.courseDone()).toBe(false);
    progress.pressContinue(only, only.blocks[1] as never);
    expect(progress.courseDone()).toBe(true);
  });
});

describe("continue blocks", () => {
  test("UI-BLOCKS-R43: a continue block hides every block below it until it is pressed", () => {
    const gated = lesson(text(), continueBlock(), text(), continueBlock(), text());
    const progress = createProgress(course([gated]));
    expect(progress.shownBlocks(gated)).toBe(2);
    progress.view(gated);
    progress.pressContinue(gated, gated.blocks[1] as never);
    expect(progress.shownBlocks(gated)).toBe(4);
    expect(progress.percent(gated)).toBe(60);
    progress.pressContinue(gated, gated.blocks[3] as never);
    expect(progress.status(gated)).toBe("done");
  });

  test("UI-BLOCKS-R44: with no requirement the button works at once", () => {
    const gated = lesson(check(), continueBlock());
    const progress = createProgress(course([gated]));
    progress.view(gated);
    expect(progress.continueReady(gated, gated.blocks[1] as never)).toBe(true);
  });

  test("UI-BLOCKS-R44: 'directly above' waits for the block above to be done", () => {
    const kc = check();
    const gated = lesson(text(), kc, continueBlock("block-above"));
    const gate = gated.blocks[2] as never;
    const progress = createProgress(course([gated]));
    progress.view(gated);
    expect(progress.continueReady(gated, gate)).toBe(false);
    progress.answerCheck(gated, kc, answersOf(kc.question as never).wrong, false);
    expect(progress.continueReady(gated, gate)).toBe(true);
  });

  test("[rise:R13] 'all above' counts only the blocks since the previous continue block", () => {
    const first = check();
    const second = check();
    const gated = lesson(first, continueBlock(), second, text(), continueBlock("all-above"));
    const gate = gated.blocks[4] as never;
    const progress = createProgress(course([gated]));
    progress.view(gated);
    progress.pressContinue(gated, gated.blocks[1] as never);
    expect(progress.continueReady(gated, gate)).toBe(false);
    progress.answerCheck(gated, second, answersOf(second.question as never).right, true);
    // The first check was never answered; it is before the previous continue block.
    expect(progress.continueReady(gated, gate)).toBe(true);
  });

  test("UI-BLOCKS-R44: the completion type is read from completionType; empty or unknown is none", () => {
    const gate = (completionType?: unknown): Block => ({
      ...continueBlock(),
      ...(completionType === undefined ? {} : { variantSettings: { completionType } }),
    });
    expect(requirement(gate("block-above"))).toBe("block-above");
    expect(requirement(gate("all-above"))).toBe("all-above");
    expect(requirement(gate("none"))).toBe("none");
    expect(requirement(gate(""))).toBe("none");
    expect(requirement(gate("above"))).toBe("none");
    expect(requirement(gate())).toBe("none");
  });

  test("UI-BLOCKS-R45: a requirable block above is not done by being seen; a button is", () => {
    const interactive = (variant: string): Block => ({
      id: newId("x"),
      category: "interactive",
      variant,
    });
    const accordion = lesson(interactive("accordion"), continueBlock("block-above"));
    const checklist = lesson(
      {
        id: newId("x"),
        category: "list",
        variant: "checkbox",
        items: [{ id: newId("i"), kind: "content", text: "<p>Pack a torch</p>" }],
      },
      continueBlock("all-above"),
    );
    // UI-BLOCKS-R19: a button can never be a requirement.
    const button = lesson(interactive("button"), continueBlock("block-above"));
    const progress = createProgress(course([accordion, checklist, button]));
    for (const page of [accordion, checklist, button]) progress.view(page);
    expect(progress.continueReady(accordion, accordion.blocks[1] as Block)).toBe(false);
    expect(progress.continueReady(checklist, checklist.blocks[1] as Block)).toBe(false);
    expect(progress.continueReady(button, button.blocks[1] as Block)).toBe(true);
  });

  test("[rise:3G] UI-BLOCKS-EDITOR-R37, UI-BLOCKS-R45: audio and video are requirable only with forward seeking off, and finish when played through", () => {
    const free = lesson(media("video"), continueBlock("block-above"));
    const locked = lesson(media("audio", false), continueBlock("block-above"));
    const file = lesson(media("attachment"), continueBlock("block-above"));
    const progress = createProgress(course([free, locked, file], { media: [clip] }));
    for (const page of [free, locked, file]) progress.view(page);
    expect(progress.continueReady(free, free.blocks[1] as Block)).toBe(true);
    expect(progress.continueReady(file, file.blocks[1] as Block)).toBe(true);
    expect(progress.continueReady(locked, locked.blocks[1] as Block)).toBe(false);
    const audio = locked.blocks[0] as Block;
    progress.itemDone(locked, audio, audio.id);
    expect(progress.continueReady(locked, locked.blocks[1] as Block)).toBe(true);
    // A block that needs no action is never saved as done by its own id.
    const attachment = file.blocks[0] as Block;
    progress.itemDone(file, attachment, attachment.id);
    expect(progress.isDone(attachment.id)).toBe(false);
    expect(largestResume(course([locked], { media: [clip] })).done).toContain(audio.id);
  });

  test("UI-BLOCKS-R45: audio or video with forward seeking off but no file to play is finished when seen, so it never holds the course", () => {
    const unplayable = [
      media("audio", false, null),
      media("video", false, null),
      media("video", false, "gone.mp4"),
    ];
    const pages = unplayable.map((block) => lesson(block, continueBlock("block-above")));
    const progress = createProgress(course(pages, { media: [clip] }));
    for (const page of pages) {
      progress.view(page);
      expect(progress.continueReady(page, page.blocks[1] as Block)).toBe(true);
      progress.itemDone(page, page.blocks[0] as Block, (page.blocks[0] as Block).id);
      expect(progress.isDone((page.blocks[0] as Block).id)).toBe(false);
    }
    expect(largestResume(course(pages, { media: [clip] })).done).not.toContain(unplayable[0]?.id);
  });
});

describe("knowledge checks", () => {
  test("UI-BLOCKS-R27: a check without the require option counts once viewed, even answered wrong", () => {
    const kc = check();
    const plain = lesson(text(), kc);
    const progress = createProgress(course([plain]));
    progress.view(plain);
    expect(progress.percent(plain)).toBe(100);
    progress.answerCheck(plain, kc, answersOf(kc.question as never).wrong, false);
    expect(progress.percent(plain)).toBe(100);
    expect(progress.response(kc.question?.id as string)).toBe(
      answersOf(kc.question as never).wrong,
    );
  });

  test("UI-BLOCKS-R25: a required check is a gate that opens only on a right answer; gates chain", () => {
    const first = check(true);
    const second = check(true);
    const gated = lesson(first, text(), second, text());
    const progress = createProgress(course([gated]));
    progress.view(gated);
    expect(progress.shownBlocks(gated)).toBe(1);
    expect(progress.percent(gated)).toBe(0);
    progress.answerCheck(gated, first, answersOf(first.question as never).wrong, false);
    expect(progress.shownBlocks(gated)).toBe(1);
    progress.answerCheck(gated, first, answersOf(first.question as never).right, true);
    expect(progress.shownBlocks(gated)).toBe(3);
    expect(progress.percent(gated)).toBe(50);
    progress.answerCheck(gated, second, answersOf(second.question as never).right, true);
    expect(progress.status(gated)).toBe("done");
  });

  test("UI-BLOCKS-R26: an unanswered required check locks every later lesson, even with free navigation", () => {
    const required = check(true);
    const pages = [lesson(text()), lesson(required), lesson(text()), lesson(text())];
    const [one, two, three, four] = pages as LessonEntry[];
    const progress = createProgress(course(pages));
    expect(progress.lockedBy(one as LessonEntry)).toBeUndefined();
    expect(progress.lockedBy(two as LessonEntry)).toBeUndefined();
    expect(progress.lockedBy(three as LessonEntry)).toBe(two);
    expect(progress.status(four as LessonEntry)).toBe("locked");
    progress.view(two as LessonEntry);
    progress.answerCheck(
      two as LessonEntry,
      required,
      answersOf(required.question as never).right,
      true,
    );
    expect(progress.lockedBy(four as LessonEntry)).toBeUndefined();
  });
});

describe("navigation", () => {
  test("[rise:R14] restricted navigation opens lessons in order and turns off mark-done", () => {
    const pages = [lesson(text()), lesson(text()), lesson(text())];
    const [one, two, three] = pages as LessonEntry[];
    const progress = createProgress(
      course(pages, { navigation: { restricted: true, learnerMarkDone: true } }),
    );
    expect(progress.restricted).toBe(true);
    expect(progress.lockedBy(two as LessonEntry)).toBe(one);
    expect(progress.lockedBy(three as LessonEntry)).toBe(one);
    expect(progress.canMarkDone(one as LessonEntry)).toBe(false);
    progress.view(one as LessonEntry);
    expect(progress.lockedBy(two as LessonEntry)).toBeUndefined();
    expect(progress.lockedBy(three as LessonEntry)).toBe(two);
  });

  test("[rise:R14] any quiz with skip-ahead turns restricted navigation on", () => {
    const target = lesson(text());
    const skipping = quiz(1, { skipAhead: { entry: target.id } });
    const progress = createProgress(course([skipping, lesson(text()), target]));
    expect(progress.restricted).toBe(true);
  });

  test("learners mark a lesson done only with free navigation, when the author allows it, never a quiz", () => {
    const gated = lesson(text(), continueBlock(), text());
    const test1 = quiz(1);
    const allowed = createProgress(
      course([gated, test1], { navigation: { learnerMarkDone: true } }),
    );
    expect(allowed.canMarkDone(test1)).toBe(false);
    expect(allowed.canMarkDone(gated)).toBe(true);
    allowed.markDone(gated);
    expect(allowed.status(gated)).toBe("done");
    expect(allowed.canMarkDone(gated)).toBe(false);
    expect(createProgress(course([gated])).canMarkDone(gated)).toBe(false);
  });
});

/** Answers every question of the attempt, right for the first `right` of them. */
function answerAttempt(
  progress: ReturnType<typeof createProgress>,
  entry: QuizEntry,
  right: number,
) {
  const attempt = progress.startAttempt(entry);
  attempt.questions.forEach((q, i) => {
    const { right: yes, wrong: no } = answersOf(q as never);
    progress.answerQuestion(entry, q, i < right ? yes : no);
  });
  return progress.submitAttempt(entry);
}

describe("quiz lessons", () => {
  test("UI-BLOCKS-R31: the quiz's percentage is the share of questions answered", () => {
    const entry = quiz(10);
    const progress = createProgress(course([entry]));
    const attempt = progress.startAttempt(entry);
    expect(progress.status(entry)).toBe("in-progress");
    const first = attempt.questions[0];
    if (!first) throw new Error("no question");
    progress.answerQuestion(entry, first, answersOf(first as never).right);
    expect(progress.percent(entry)).toBe(10);
  });

  test("UI-BLOCKS-R32, R33: the score is the share fully right, and pass or fail is set at submit", () => {
    const entry = quiz(5, { passingScore: 80 });
    const progress = createProgress(course([entry, lesson(text())]));
    expect(answerAttempt(progress, entry, 4)).toEqual({ correct: 4, total: 5, percent: 80 });
    expect(progress.quiz(entry).passed).toBe(true);
    expect(progress.status(entry)).toBe("done");
  });

  test("[rise:R15] questions left unanswered at submit (the timer ran out) are wrong", () => {
    const entry = quiz(4);
    const progress = createProgress(course([entry]));
    const attempt = progress.startAttempt(entry);
    const first = attempt.questions[0];
    if (!first) throw new Error("no question");
    progress.answerQuestion(entry, first, answersOf(first as never).right);
    expect(progress.submitAttempt(entry)).toEqual({ correct: 1, total: 4, percent: 25 });
  });

  test("UI-BLOCKS-R36: without require-passing a failed quiz counts as finished and shows as failed", () => {
    const entry = quiz(2);
    const pages = [entry, lesson(text()), lesson(text()), lesson(text())];
    const progress = createProgress(course(pages));
    answerAttempt(progress, entry, 0);
    expect(progress.coursePercent()).toBe(25);
    expect(progress.status(entry)).toBe("failed");
    expect(progress.lockedBy(pages[1] as LessonEntry)).toBeUndefined();
  });

  test("UI-BLOCKS-R37, R38: with require-passing a failed quiz does not count and later lessons wait", () => {
    const entry = quiz(2, { requirePassing: true, retries: 1 });
    const after = lesson(text());
    const progress = createProgress(course([entry, after]));
    answerAttempt(progress, entry, 0);
    expect(progress.coursePercent()).toBe(0);
    expect(progress.lockedBy(after)).toBe(entry);
    progress.resetQuiz(entry);
    answerAttempt(progress, entry, 1);
    expect(progress.quiz(entry).attemptsLeft).toBe(0);
    expect(progress.lockedBy(after)).toBe(entry);
    expect(progress.courseDone()).toBe(false);
  });

  test("UI-BLOCKS-R35: retake puts the quiz back to not started and the course percentage follows", () => {
    const entry = quiz(1);
    const progress = createProgress(course([entry, lesson(text())]));
    answerAttempt(progress, entry, 1);
    expect(progress.coursePercent()).toBe(50);
    progress.resetQuiz(entry);
    expect(progress.status(entry)).toBe("not-started");
    expect(progress.quiz(entry).reset).toBe(true);
    expect(progress.coursePercent()).toBe(0);
  });

  test("[rise:R8] the best score is kept across retries", () => {
    const entry = quiz(4);
    const progress = createProgress(course([entry]));
    answerAttempt(progress, entry, 4);
    progress.resetQuiz(entry);
    answerAttempt(progress, entry, 1);
    expect(progress.quiz(entry).scores).toEqual([100, 25]);
    expect(progress.quiz(entry).best).toBe(100);
    expect(progress.quiz(entry).passed).toBe(true);
  });

  test("UI-BLOCKS-R41: skip-ahead after a pass counts the skipped lessons as done", () => {
    const skipped = [lesson(text()), lesson(text())];
    const target = lesson(text());
    const chooses = quiz(1, { skipAhead: { entry: target.id, learnerChooses: true } });
    const progress = createProgress(course([chooses, ...skipped, target]));
    answerAttempt(progress, chooses, 1);
    expect(progress.isDone(skipped[0]?.id as string)).toBe(false);
    expect(progress.skipAhead(chooses)).toBe(target);
    expect(skipped.every((page) => progress.isDone(page.id))).toBe(true);
    expect(progress.lockedBy(target)).toBeUndefined();

    const automatic = quiz(1, { skipAhead: { entry: target.id } });
    const other = createProgress(course([automatic, ...skipped, target]));
    answerAttempt(other, automatic, 0);
    expect(other.isDone(skipped[0]?.id as string)).toBe(false);
    other.resetQuiz(automatic);
    answerAttempt(other, automatic, 1);
    expect(skipped.every((page) => other.isDone(page.id))).toBe(true);
  });

  test("random draws: the drawn questions and their order are saved and survive a resume", () => {
    const pool = Array.from({ length: 6 }, () => ({
      bankQuestion: "bankques01",
      question: question(),
    }));
    const entry: QuizEntry = {
      ...quiz(1, { shuffleQuestions: true }),
      questions: [
        question(),
        {
          id: "drawpool01",
          kind: "draw",
          bank: { containerId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", id: "bank000001" },
          count: 3,
          pool,
        },
      ],
    };
    const progress = createProgress(course([entry]));
    const attempt = progress.startAttempt(entry);
    expect(attempt.questions).toHaveLength(4);
    const first = attempt.questions[0];
    if (!first) throw new Error("no question");
    progress.answerQuestion(entry, first, answersOf(first as never).right);
    progress.setElapsed(entry, 61_500);

    const resumed = createProgress(course([entry]), progress.snapshot());
    expect(resumed.quiz(entry).attempt).toEqual({
      questions: attempt.questions,
      answers: { [first.id]: answersOf(first as never).right },
    });
    expect(resumed.elapsed(entry)).toBe(61_000);
  });
});

describe("saved state", () => {
  test("snapshot then restore is the identity, through the SCORM 1.2 resume codec", () => {
    const kc = check(true);
    const target = lesson(text());
    const entry = quiz(3, { skipAhead: { entry: target.id, learnerChooses: true } });
    const pages = [lesson(text(), continueBlock(), text()), lesson(kc, text()), entry, target];
    const progress = createProgress(course(pages));
    progress.view(pages[0] as LessonEntry);
    progress.view(pages[1] as LessonEntry);
    progress.answerCheck(pages[1] as LessonEntry, kc, answersOf(kc.question as never).wrong, false);
    answerAttempt(progress, entry, 3);
    progress.resetQuiz(entry);
    progress.startAttempt(entry);

    const snapshot = progress.snapshot();
    const encoded = encodeResume(snapshot, { packageVersion: "1", cap: RESUME_CAPS.scorm12 });
    if (!encoded.ok) throw new Error("does not fit");
    const decoded = decodeResume(encoded.payload);
    if (decoded.status !== "ok") throw new Error(decoded.status);
    const restored = createProgress(course(pages), decoded.state);
    // Sets keep no order, so the identity is the same saved payload.
    const again = encodeResume(restored.snapshot(), {
      packageVersion: "1",
      cap: RESUME_CAPS.scorm12,
    });
    expect(again).toEqual(encoded);
    for (const page of pages) {
      expect(restored.status(page)).toBe(progress.status(page));
      expect(restored.percent(page)).toBe(progress.percent(page));
    }
    expect(restored.quiz(entry)).toEqual(progress.quiz(entry));
  });
});

describe("largest saved state", () => {
  test("standards.md §4.2: holds everything a learner can save, so the publish check never underestimates", () => {
    const kc = check(true);
    const gated = lesson(text(), kc, continueBlock(), text());
    const limited = quiz(3, { retries: 1, timer: { minutes: 5 } });
    const unlimited = quiz(2);
    const all = course([gated, limited, unlimited]);
    const largest = largestResume(all);

    expect(largest.visited).toEqual({ [gated.id]: gated.blocks.map((block) => block.id) });
    expect(new Set(largest.done)).toEqual(
      new Set([gated.id, limited.id, unlimited.id, kc.id, gated.blocks[2]?.id]),
    );
    expect(largest.attempts).toEqual({
      [limited.id]: [100, 100],
      [unlimited.id]: Array(ESTIMATED_ATTEMPTS).fill(100),
    });
    expect(largest.variables).toEqual({ [limited.id]: 300 });
    expect(Object.keys(largest.answers ?? {})).toHaveLength(1 + 3 + 2);

    // A learner who does everything there is to do saves no more than the estimate.
    const progress = createProgress(all);
    progress.view(gated);
    progress.answerCheck(gated, kc, answersOf(kc.question as never).right, true);
    progress.pressContinue(gated, gated.blocks[2] as never);
    const attempt = (entry: QuizEntry) => {
      for (const q of progress.startAttempt(entry).questions) {
        progress.answerQuestion(entry, q, answersOf(q as never).wrong);
      }
    };
    for (let i = 0; i < 2; i++) {
      attempt(limited);
      progress.submitAttempt(limited);
    }
    for (let i = 0; i < ESTIMATED_ATTEMPTS; i++) {
      attempt(unlimited);
      progress.submitAttempt(unlimited);
    }
    attempt(unlimited);
    const size = (state: ReturnType<typeof largestResume>) => {
      const encoded = encodeResume(state, { packageVersion: "1", cap: RESUME_CAPS.scorm2004 });
      return encoded.ok ? encoded.payload.length : Number.POSITIVE_INFINITY;
    };
    expect(size(progress.snapshot())).toBeLessThanOrEqual(size(largest));
  });
});

describe("blocks finished item by item (BLK-04)", () => {
  const items = (n: number) =>
    Array.from({ length: n }, () => ({
      id: newId("i"),
      kind: "content" as const,
      text: "<p>x</p>",
    }));
  const checklist = (): Block => ({
    id: newId("l"),
    category: "list",
    variant: "checkbox",
    items: items(2),
  });
  const carousel = (): Block => ({
    id: newId("g"),
    category: "gallery",
    variant: "carousel",
    items: items(3),
  });

  test("[rise:3C] UI-BLOCKS-R45, R51: a checklist is done once every box is ticked, and a continue block below it waits for that", () => {
    const list = checklist();
    const gate = continueBlock("block-above");
    const page = lesson(list, gate);
    const progress = createProgress(course([page]));
    progress.view(page);
    const [first, second] = list.items ?? [];
    expect(progress.continueReady(page, gate)).toBe(false);
    progress.itemDone(page, list, first?.id ?? "");
    expect(progress.isDone(first?.id ?? "")).toBe(true);
    expect(progress.continueReady(page, gate)).toBe(false);
    progress.itemDone(page, list, first?.id ?? "", false);
    progress.itemDone(page, list, second?.id ?? "");
    expect(progress.isDone(list.id)).toBe(false);
    progress.itemDone(page, list, first?.id ?? "");
    expect(progress.isDone(list.id)).toBe(true);
    expect(progress.continueReady(page, gate)).toBe(true);
    // Clearing a box afterwards keeps the block done.
    progress.itemDone(page, list, first?.id ?? "", false);
    expect(progress.isDone(list.id)).toBe(true);
  });

  test("[rise:3C] UI-BLOCKS-R52: a carousel is done once every slide has been shown; ticks and slides resume", () => {
    const slides = carousel();
    const page = lesson(slides, continueBlock("all-above"));
    const progress = createProgress(course([page]));
    for (const item of slides.items ?? []) progress.itemDone(page, slides, item.id);
    expect(progress.isDone(slides.id)).toBe(true);
    // Once done, only the block's id is kept.
    expect(progress.snapshot().done).toEqual([slides.id]);
    const resumed = createProgress(course([page]), progress.snapshot());
    expect(resumed.isDone(slides.id)).toBe(true);
    // Only items of the block count, and only for blocks finished item by item.
    const plain = text();
    resumed.itemDone(page, plain, "nothing00");
    expect(resumed.isDone("nothing00")).toBe(false);
  });

  test("standards.md §4.2: the largest saved state counts all items but one of a checklist or carousel in progress", () => {
    const list = checklist();
    const slides = carousel();
    const largest = largestResume(course([lesson(list, slides, text())]));
    expect(largest.done).toContain(list.id);
    expect(largest.done).toEqual(
      expect.arrayContaining((slides.items ?? []).slice(1).map((item) => item.id)),
    );
    const progress = createProgress(course([lesson(list, slides, text())]));
    progress.itemDone(progress.pages[0] as LessonEntry, slides, slides.items?.[0]?.id ?? "");
    progress.itemDone(progress.pages[0] as LessonEntry, slides, slides.items?.[1]?.id ?? "");
    expect(progress.snapshot().done?.length).toBeLessThanOrEqual((largest.done ?? []).length);
  });

  test("[rise:3C] UI-BLOCKS-R45, R51: a point or quote whose text was cleared neither shows nor holds the block back", () => {
    // The editor removes an item's text when it is cleared (setItem unsets it).
    const list = checklist();
    const [first, second] = list.items ?? [];
    if (second?.kind === "content") delete second.text;
    const quotes: Block = {
      id: newId("q"),
      category: "quote",
      variant: "carousel",
      items: [...items(1), { id: newId("i"), kind: "content", title: "<p>Name only</p>" }],
    };
    const gate = continueBlock("all-above");
    const page = lesson(list, quotes, gate);
    const progress = createProgress(course([page]));
    progress.view(page);
    // The renderer and progress read the same items.
    expect(shownItems(list).map((item) => item.id)).toEqual([first?.id]);
    expect(shownItems(quotes)).toHaveLength(1);
    progress.itemDone(page, list, first?.id ?? "");
    expect(progress.isDone(list.id)).toBe(true);
    progress.itemDone(page, quotes, quotes.items?.[0]?.id ?? "");
    expect(progress.continueReady(page, gate)).toBe(true);
    // An item that is not shown cannot be done.
    expect(progress.isDone(second?.id ?? "")).toBe(false);
  });

  test("[rise:3C] UI-BLOCKS-R45: a checklist with no point left to show leaves its continue block free", () => {
    const list = checklist();
    for (const item of list.items ?? []) if (item.kind === "content") delete item.text;
    const gate = continueBlock("block-above");
    const page = lesson(list, gate);
    const progress = createProgress(course([page]));
    progress.view(page);
    expect(progress.continueReady(page, gate)).toBe(true);
  });

  test("[rise:3C] UI-BLOCKS-R51: ticks saved before a point was cleared finish the block on return", () => {
    const list = checklist();
    const page = lesson(list, continueBlock("block-above"));
    const progress = createProgress(course([page]));
    progress.view(page);
    progress.itemDone(page, list, list.items?.[0]?.id ?? "");
    // The author clears the other point and publishes again; the learner comes back.
    const second = list.items?.[1];
    if (second?.kind === "content") delete second.text;
    const resumed = createProgress(course([page]), progress.snapshot());
    expect(resumed.continueReady(page, page.blocks[1] as Block)).toBe(true);
  });
});
