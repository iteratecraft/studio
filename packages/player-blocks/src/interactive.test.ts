// The completion rules of the interactive blocks in the progress engine (M2-14, BLK-06): the items
// each block waits for before a continue block below it opens, which are the items it shows.
import type { Block, Item, LessonEntry } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import { continueBlock, course, lesson, newId } from "../test/courses.js";
import {
  createProgress,
  flashcards,
  largestResume,
  shownMarkers,
  shownSections,
  shownSteps,
} from "./progress.js";

const picture = { id: "mediapict1", key: "bike.svg", source: "upload" } as const;
const block = (variant: string, items: Item[], more: Partial<Block> = {}): Block => ({
  id: newId("b"),
  category: "interactive",
  variant,
  items,
  ...more,
});
const section = (title?: string): Item => ({
  id: newId("s"),
  kind: "content",
  ...(title !== undefined && { title }),
  text: "<p>Body</p>",
});
const marker = (): Item => ({ id: newId("m"), kind: "marker", x: 10, y: 20 });
const step = (role: "intro" | "step" | "summary", hidden?: boolean): Item => ({
  id: newId("p"),
  kind: "step",
  role,
  ...(hidden !== undefined && { hidden }),
});
const card = (): Item => ({ id: newId("f"), kind: "flashcard", front: {}, back: {} });

/** A lesson of `subject` and a continue block that waits for it, seen by the learner. */
function gated(subject: Block) {
  const gate = continueBlock("block-above");
  const page = lesson(subject, gate);
  const progress = createProgress(course([page], { media: [picture] }));
  progress.view(page);
  const ready = () => progress.continueReady(page, gate);
  const done = (item: Item | undefined) => progress.itemDone(page, subject, item?.id ?? "");
  return { page, progress, ready, done };
}

describe("interactive blocks finish item by item (BLK-06)", () => {
  test("[rise:3G] UI-BLOCKS-R1, R45: an accordion is done once every section with a title is opened; an untitled one is not waited for", () => {
    const subject = block("accordion", [section("Tyres"), section(""), section("Chain")]);
    expect(shownSections(subject).map((item) => item.title)).toEqual(["Tyres", "Chain"]);
    const { ready, done } = gated(subject);
    expect(ready()).toBe(false);
    done(subject.items?.[0]);
    expect(ready()).toBe(false);
    done(subject.items?.[2]);
    expect(ready()).toBe(true);
  });

  test("[rise:3G] UI-BLOCKS-R2, R52: tabs are done once every tab has been shown", () => {
    const subject = block("tabs", [section("Spring"), section("Summer")]);
    const { ready, done } = gated(subject);
    done(subject.items?.[0]);
    expect(ready()).toBe(false);
    done(subject.items?.[1]);
    expect(ready()).toBe(true);
  });

  test("[rise:3G] UI-BLOCKS-R3, R4: a labeled graphic is done once every marker is opened, and waits for none without its picture", () => {
    const subject = block("labeled-graphic", [marker(), marker()], {
      media: [{ key: picture.key }],
    });
    const { ready, done, progress } = gated(subject);
    expect(shownMarkers(course([]), subject)).toEqual([]);
    expect(ready()).toBe(false);
    done(subject.items?.[0]);
    done(subject.items?.[1]);
    expect(ready()).toBe(true);
    // Done for good: only the block's id is kept (standards.md 4.2).
    expect(progress.snapshot().done).toContain(subject.id);
    expect(progress.snapshot().done).not.toContain(subject.items?.[0]?.id);
    const bare = block("labeled-graphic", [marker()]);
    expect(gated(bare).ready()).toBe(true);
  });

  test("[rise:3C] [rise:3G] UI-BLOCKS-R7, BLK-06: hidden process steps neither show nor count toward completion", () => {
    const hidden = step("step", true);
    const subject = block("process", [step("intro"), step("step"), hidden, step("summary", true)]);
    expect(shownSteps(subject).map((item) => item.id)).not.toContain(hidden.id);
    const { ready, done } = gated(subject);
    done(subject.items?.[0]);
    expect(ready()).toBe(false);
    done(subject.items?.[1]);
    expect(ready()).toBe(true);
    // A hidden card cannot be done either: it is not one of the block's shown items.
    const again = gated(block("process", [step("step"), step("step", true)]));
    again.done(undefined);
    expect(again.ready()).toBe(false);
  });

  test("[rise:3G] UI-BLOCKS-R13, R56: flashcards are done once every card is turned over, and stay done", () => {
    for (const variant of ["flashcard-grid", "flashcard-stack"]) {
      const subject = block(variant, [card(), card()]);
      expect(flashcards(subject)).toHaveLength(2);
      const { ready, done } = gated(subject);
      done(subject.items?.[0]);
      expect(ready(), variant).toBe(false);
      done(subject.items?.[1]);
      expect(ready(), variant).toBe(true);
    }
    const single = block("flashcard-stack", [card()]);
    const one = gated(single);
    one.done(single.items?.[0]);
    one.progress.itemDone(one.page, single, single.items?.[0]?.id ?? "", false);
    expect(one.ready()).toBe(true);
  });

  test("[rise:3G] UI-BLOCKS-R19: a button never holds back a continue block", () => {
    const subject = block("button-stack", [
      { id: newId("u"), kind: "button", label: "Go", destination: { kind: "exit" } },
    ]);
    expect(gated(subject).ready()).toBe(true);
  });

  test("[rise:3G] BLK-06: a block with nothing to open, show or turn over never locks the lesson", () => {
    for (const subject of [
      block("accordion", [section("")]),
      block("tabs", []),
      block("process", [step("step", true)]),
      block("flashcard-grid", []),
    ]) {
      expect(gated(subject).ready(), subject.variant).toBe(true);
    }
  });

  test("[rise:3G] [standards:4.2] the largest saved state counts every item but one of an unfinished interactive block", () => {
    const accordion = block("accordion", [section("A"), section("B"), section("C")]);
    const page: LessonEntry = lesson(accordion, continueBlock("block-above"));
    const done = largestResume(course([page])).done ?? [];
    expect(done).toEqual(expect.arrayContaining(accordion.items?.slice(1).map((i) => i.id) ?? []));
  });
});
