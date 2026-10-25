// ENG-10 done-when: random command sequences followed by full undo restore the original document
// byte for byte, and rejected commands leave it unchanged. A small seeded generator instead of a
// property-testing library: a failing seed and step are printed and replay exactly.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "@course-suite/format";
import { openCourse, serializeCourse, validateCourse } from "@course-suite/format";
import { fullCourse, minimalCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import type { Command, CommandType } from "./commands.js";
import { COLLECTIONS, COMMAND_TYPES } from "./commands.js";
import { createEditor } from "./editor.js";
import type { Kind } from "./walk.js";
import { indexDocument } from "./walk.js";

/** mulberry32: a tiny seeded generator, good enough to pick test cases. */
function seeded(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)] as T;
  let counter = 0;
  // Fresh content ids; "z" keeps them apart from the fixtures' ids.
  const id = () => `z${(counter++).toString(36).padStart(9, "0")}`;
  return { next, int, pick, id };
}
type Random = ReturnType<typeof seeded>;

const TYPES = [...COMMAND_TYPES.keys()];

function value(kind: Kind, r: Random): unknown {
  const answers = () => [
    { id: r.id(), text: "<p>Yes</p>", correct: true },
    { id: r.id(), text: "<p>No</p>", correct: false },
  ];
  switch (kind) {
    case "entry":
      return r.pick([
        () => ({ id: r.id(), kind: "section", title: "Part" }),
        () => ({ id: r.id(), kind: "lesson", title: "Lesson", blocks: [] }),
        () => ({ id: r.id(), kind: "quiz", title: "Quiz", questions: [] }),
      ])();
    case "block": {
      const category = r.id();
      return r.pick([
        () => ({ id: r.id(), category: "text", variant: "paragraph", items: [value("item", r)] }),
        () => ({
          id: r.id(),
          category: "interactive",
          variant: "sorting",
          items: [
            { id: category, kind: "category", title: "Safe" },
            { id: r.id(), kind: "sorting", text: "Guard on", category },
          ],
        }),
        () => ({
          id: r.id(),
          category: "knowledge-check",
          variant: "single-choice",
          question: { id: r.id(), kind: "single-choice", prompt: "<p>?</p>", answers: answers() },
        }),
        // Invalid: a block needs a variant.
        () => ({ id: r.id(), category: "text" }),
      ])();
    }
    case "item":
      return r.pick([
        () => ({ id: r.id(), kind: "content", title: "Title", text: "<p>Text</p>" }),
        () => ({ id: r.id(), kind: "button", label: "Go", destination: { kind: "exit" } }),
      ])();
    case "question":
      return r.pick([
        () => ({ id: r.id(), kind: "multiple-response", prompt: "<p>?</p>", answers: answers() }),
        () => ({ id: r.id(), kind: "fill-in", prompt: "<p>?</p>", acceptedAnswers: ["a"] }),
      ])();
    case "answer":
      return { id: r.id(), text: "<p>Maybe</p>", correct: r.next() < 0.5 };
    case "pair":
      return { id: r.id(), prompt: "<p>A</p>", match: "<p>B</p>" };
    case "media":
      return { id: r.id(), key: `file-${r.int(1000)}.png`, source: "upload" };
  }
}

/** Field changes to try per kind, valid and invalid. */
const CHANGES: Record<Kind | "course", { set?: object; unset?: string[] }[]> = {
  course: [
    { set: { title: "Renamed" } },
    { set: { description: "<p>About</p>", navigation: { restricted: true } } },
    { unset: ["description", "authors"] },
    { set: { labelSet: { language: "de" } } },
    { set: { sourceLanguage: "not a tag" } },
  ],
  entry: [
    { set: { title: "Renamed" } },
    { set: { icon: "star" } },
    { unset: ["description", "author", "settings"] },
    { set: { settings: { passingScore: 50 } } },
  ],
  block: [
    { set: { variant: "switched" } },
    { set: { settings: { connectToNext: true, padding: { top: 10, bottom: 20 } } } },
    { unset: ["settings", "createdAt", "question"] },
    { set: { variantSettings: { columns: 2 } } },
  ],
  item: [
    { set: { text: "<p>Changed</p>" } },
    { set: { title: "Changed" } },
    { unset: ["title", "media"] },
  ],
  question: [
    { set: { prompt: "<p>Changed?</p>", feedbackMode: "perAnswer" } },
    { unset: ["feedbackMode", "media", "correctFeedback"] },
    { set: { acceptedAnswers: ["x", "y"] } },
  ],
  answer: [
    { set: { correct: true } },
    { set: { correct: false, feedback: "<p>Hm</p>" } },
    { unset: ["feedback"] },
  ],
  pair: [{ set: { match: "<p>C</p>" } }, { unset: ["ext"] }],
  media: [
    { set: { width: 640, height: 480 } },
    { unset: ["mimeType", "variantKey"] },
    { set: { source: "ai" } },
  ],
};

function randomCommand(course: Course, r: Random): Command {
  const type = r.pick(TYPES) as CommandType;
  const { verb, kind } = COMMAND_TYPES.get(type) as { verb: string; kind: Kind | "course" };
  if (kind === "course") return { type: "updateCourse", ...r.pick(CHANGES.course) } as Command;
  const objects = [...indexDocument(course).values()];
  const ofKind = (k: string) =>
    objects.filter((o) => o.kind === k).map((o) => o.value.id as string);
  // Mostly an object of the right kind; sometimes any object, or one that does not exist.
  const target = () => {
    const roll = r.next();
    if (roll < 0.05) return "missing001";
    const pool = roll < 0.15 ? objects.map((o) => o.value.id as string) : ofKind(kind);
    return pool.length > 0 ? r.pick(pool) : "missing001";
  };
  const parentKind = COLLECTIONS[kind].parent?.kind;
  const parent = () => (parentKind ? r.pick([...ofKind(parentKind), "missing002"]) : undefined);
  const index = () => r.int(8);
  switch (verb) {
    case "insert":
      return {
        type,
        parent: parent(),
        index: r.next() < 0.3 ? undefined : index(),
        value: value(kind, r),
      } as never;
    case "update":
      return { type, id: target(), ...r.pick(CHANGES[kind]) } as never;
    case "move":
      return {
        type,
        id: target(),
        index: index(),
        parent: r.next() < 0.5 ? undefined : parent(),
      } as never;
    case "duplicate":
      return { type, id: target(), parent: r.next() < 0.7 ? undefined : parent() } as never;
    default:
      return { type, id: target() } as never;
  }
}

/** The command without undefined properties, as JSON would carry it. */
const plain = (command: Command): Command => JSON.parse(JSON.stringify(command));

function run(course: Course, seed: number, steps: number) {
  const r = seeded(seed);
  const editor = createEditor(course, { historyLimit: Number.POSITIVE_INFINITY });
  const original = serializeCourse(course);
  const applied = new Set<string>();
  let rejected = 0;
  for (let step = 0; step < steps; step += 1) {
    const where = `seed ${seed}, step ${step}`;
    if (r.next() < 0.05) editor.beginGroup();
    if (r.next() < 0.05) editor.endGroup();
    const commands = Array.from({ length: 1 + (r.next() < 0.2 ? r.int(3) : 0) }, () =>
      plain(randomCommand(editor.document, r)),
    );
    const before = editor.document;
    const text = serializeCourse(before);
    const result = editor.dispatch(commands);
    if (result.ok) {
      expect(validateCourse(editor.document), where).toEqual([]);
      for (const command of commands) applied.add(command.type);
    } else {
      rejected += 1;
      expect(editor.document, where).toBe(before);
      expect(serializeCourse(editor.document), where).toBe(text);
    }
    if (r.next() < 0.1) editor.undo();
    if (r.next() < 0.05) editor.redo();
  }
  editor.endGroup();
  while (editor.redo()) {}
  const final = serializeCourse(editor.document);
  while (editor.undo()) {}
  expect(serializeCourse(editor.document), `seed ${seed}: full undo`).toBe(original);
  while (editor.redo()) {}
  expect(serializeCourse(editor.document), `seed ${seed}: full redo`).toBe(final);
  return { applied, rejected };
}

const corpusDir = join(import.meta.dirname, "..", "..", "..", "test-courses", "blocks");
const corpus = existsSync(corpusDir)
  ? readdirSync(corpusDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const opened = openCourse(readFileSync(join(corpusDir, entry.name, "course.json"), "utf8"));
        if (opened.status !== "ok") throw new Error(`${entry.name} does not open`);
        return [entry.name, opened.document] as const;
      })
  : [];

describe("random command sequences", () => {
  test("full undo restores the document byte for byte, and rejected commands change nothing", () => {
    const applied = new Set<string>();
    let rejected = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const course = seed % 5 === 0 ? minimalCourse() : fullCourse();
      const outcome = run(course, seed, 150);
      for (const type of outcome.applied) applied.add(type);
      rejected += outcome.rejected;
    }
    // The generator reaches every command, and both outcomes.
    expect([...applied].sort()).toEqual([...TYPES].sort());
    expect(rejected).toBeGreaterThan(100);
  });

  test.skipIf(corpus.length === 0).each(corpus)("on the corpus course %s", (_name, course) => {
    for (let seed = 100; seed < 105; seed += 1) run(course, seed, 100);
  });
});
