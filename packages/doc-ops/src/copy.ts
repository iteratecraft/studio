// Duplicating a whole course (rise.md 3J, BLK-01 "a duplicated course shares no ids with its
// source"): a new project id and a new content id for every object, with references kept. And
// copying one lesson to another course (rise.md 3B, BLK-02).
import type { Block, Course, Entry, MediaEntry } from "@course-suite/format";
import { newContentId, newProjectId } from "@course-suite/format";
import type { Command } from "./commands.js";
import type { Kind } from "./walk.js";
import { idsIn, indexDocument } from "./walk.js";

type Obj = Record<string, unknown>;

/**
 * A copy of the course that shares no id with it: a new project id, a new id for every object
 * with a content id, and every reference to one of them (a button's lesson, a quiz's skip-ahead,
 * course tracking, a sorting card's category, a block's custom-block document) pointing at its
 * copy. References into other containers (`{ containerId, id }`) are kept as they are.
 * shortcut: ids inside rich-text HTML are not rewritten; the format puts none there yet.
 */
export function copyCourse(course: Course): Course {
  const old = [...indexDocument(course).keys()];
  const taken = new Set(old);
  const renamed = new Map<string, string>();
  for (const id of old) {
    const fresh = newContentId(taken);
    taken.add(fresh);
    renamed.set(id, fresh);
  }
  const copy = (value: unknown): unknown => {
    if (typeof value === "string") return renamed.get(value) ?? value;
    if (Array.isArray(value)) return value.map(copy);
    if (value === null || typeof value !== "object") return value;
    // Documents are never changed in place, so the copy may share what it keeps as it is.
    if (Object.hasOwn(value, "containerId")) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  };
  return { ...(copy(course) as Course), id: newProjectId() };
}

/** Commands that copy part of one course into another, and the media files they need. */
export interface CopyCommands {
  /** Commands for the target course, applied as one list. */
  commands: Command[];
  /** Storage keys of the media files the copy uses, whose bytes the target project needs. */
  keys: string[];
}

/** What copying an outline entry to another course needs, or why it cannot be copied. */
export type EntryCopy =
  | ({ ok: true } & CopyCommands)
  | {
      ok: false;
      /**
       * `not-found`: `source` has no such entry. `custom-block`: the entry uses a custom-block
       * document, which has no commands yet. `microlearning`: the target is a microlearning, which
       * holds exactly one lesson and no quiz (rise.md 3A, BLK-02).
       */
      reason: "not-found" | "custom-block" | "microlearning";
    };

/**
 * Copies outline entry `id` of `source` to the end of `target`'s outline (rise.md 3B,
 * UI-BLOCKS-EDITOR-R10, BLK-02): the entry with a new id for every object in it, unused in both
 * courses, and a media index entry for each media file it uses that `target` has not. What cannot
 * point across courses goes as when the entry it points at is deleted (D-36): a button to another
 * entry is removed and a quiz's skip-ahead is turned off.
 */
export function copyEntryTo(source: Course, id: string, target: Course): EntryCopy {
  const entry = source.entries.find((candidate) => candidate.id === id);
  if (!entry) return { ok: false, reason: "not-found" };
  if (target.kind === "microlearning") return { ok: false, reason: "microlearning" };
  if (entry.kind === "lesson" && entry.blocks.some((block) => block.customBlock)) {
    return { ok: false, reason: "custom-block" };
  }
  const copier = copierFor([entry], "entry", source, target, () => false, [
    ...indexDocument(source).keys(),
  ]);
  return {
    ok: true,
    ...copier.result([{ type: "insertEntry", value: copier.copies[0] as Entry }]),
  };
}

/** Blocks taken from a course, with the media index entries they use: what copy puts aside. */
export interface BlockClip {
  /** Id of the course the blocks come from. */
  course: string;
  blocks: Block[];
  /** The source course's media index entries for the files the blocks use. */
  media: MediaEntry[];
}

/** The blocks with ids `ids` of `course`, in lesson order, and the media index entries they use. */
export function clipBlocks(course: Course, ids: Iterable<string>): BlockClip {
  const wanted = new Set(ids);
  const blocks = course.entries.flatMap((entry) =>
    entry.kind === "lesson" ? entry.blocks.filter((block) => wanted.has(block.id)) : [],
  );
  const keys = new Set(mediaKeysIn(blocks));
  return { course: course.id, blocks, media: course.media.filter((media) => keys.has(media.key)) };
}

/**
 * Pastes copies of the clipped blocks into lesson `lesson` of `target`, from `index` on (the end
 * when left out), in their order (rise.md 3J, UI-BLOCKS-EDITOR-R24, W12, W13; BLK-03): new ids,
 * unused in the target, and a media index entry for each file the target lacks, whose bytes it
 * needs (`keys`). Pasted into another course, a button to a lesson is removed (D-36); in its own
 * course it keeps pointing at the lesson. Undefined when `lesson` is not a lesson of `target`, or
 * when a block from another course uses a custom-block document, which has no commands yet.
 */
export function pasteBlocks(
  clip: BlockClip,
  target: Course,
  lesson: string,
  index?: number,
): CopyCommands | undefined {
  const into = target.entries.find((entry) => entry.id === lesson);
  const sameCourse = clip.course === target.id;
  if (into?.kind !== "lesson") return undefined;
  if (!sameCourse && clip.blocks.some((block) => block.customBlock)) return undefined;
  const entries = new Set(target.entries.map((entry) => entry.id));
  const copier = copierFor(
    clip.blocks,
    "block",
    clip,
    target,
    (id) => sameCourse && entries.has(id),
  );
  const at = index ?? into.blocks.length;
  return copier.result(
    copier.copies.map((value, i) => ({
      type: "insertBlock",
      parent: lesson,
      index: at + i,
      value: value as Block,
    })),
  );
}

/** Storage keys of the media files used by `values`: every `key` of a media reference. */
function mediaKeysIn(values: unknown): string[] {
  const keys: string[] = [];
  const visit = (value: unknown, name?: string) => {
    if (typeof value === "string" && name === "key") keys.push(value);
    else if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object" && !Object.hasOwn(value, "containerId")) {
      for (const [field, item] of Object.entries(value)) visit(item, field);
    }
  };
  visit(values);
  return keys;
}

/**
 * Copies of `values` (objects of `kind`) for `target`: a new id, unused in either course, for every
 * object in them (and none of `alsoTaken`) and every reference to one pointing at its copy; a button to an outline entry that
 * was not copied stays only when `keepEntry` says so; a quiz's skip-ahead goes. `result` adds a
 * media index entry for each file the copies use that `target` lacks.
 */
function copierFor(
  values: readonly object[],
  kind: Kind,
  source: { media: readonly MediaEntry[] },
  target: Course,
  keepEntry: (id: string) => boolean,
  alsoTaken: readonly string[] = [],
) {
  const old = values.flatMap((value) => idsIn(value as Obj, kind));
  const taken = new Set([...indexDocument(target).keys(), ...old, ...alsoTaken]);
  const fresh = () => {
    const next = newContentId(taken);
    taken.add(next);
    return next;
  };
  const renamed = new Map(old.map((id) => [id, fresh()]));
  const known = new Map(source.media.map((media) => [media.key, media]));
  const keys = new Set<string>();
  const dropped = (value: unknown) => {
    const item = value as { kind?: unknown; destination?: { kind?: unknown; entry?: unknown } };
    const entry = item?.destination?.entry as string;
    return (
      item?.kind === "button" &&
      item.destination?.kind === "lesson" &&
      !renamed.has(entry) &&
      !keepEntry(entry)
    );
  };
  const copy = (value: unknown, name?: string): unknown => {
    if (typeof value === "string") {
      if (name === "key" && known.has(value)) keys.add(value);
      return renamed.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.filter((item) => !dropped(item)).map((v) => copy(v));
    if (value === null || typeof value !== "object") return value;
    if (Object.hasOwn(value, "containerId")) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([field]) => field !== "skipAhead")
        .map(([field, item]) => [field, copy(item, field)]),
    );
  };
  const copies = values.map((value) => copy(value));
  return {
    copies,
    result(inserts: Command[]): CopyCommands {
      const present = new Set(target.media.map((media) => media.key));
      const commands: Command[] = [...keys]
        .filter((key) => !present.has(key))
        .map((key) => ({
          type: "insertMedia",
          value: { ...(known.get(key) as MediaEntry), id: fresh() },
        }));
      commands.push(...inserts);
      return { commands, keys: [...keys] };
    },
  };
}
