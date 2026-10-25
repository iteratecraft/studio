// Duplicating a whole course (rise.md 3J, BLK-01 "a duplicated course shares no ids with its
// source"): a new project id and a new content id for every object, with references kept. And
// copying one lesson to another course (rise.md 3B, BLK-02).
import type { Course, Entry, MediaEntry } from "@course-suite/format";
import { newContentId, newProjectId } from "@course-suite/format";
import type { Command } from "./commands.js";
import { idsIn, indexDocument } from "./walk.js";

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

/** What copying an outline entry to another course needs: see copyEntryTo. */
export interface EntryCopy {
  /** Commands for the target course, applied as one list. */
  commands: Command[];
  /** Storage keys of the media files the copy uses, whose bytes the target project needs. */
  keys: string[];
}

/**
 * Copies outline entry `id` of `source` to the end of `target`'s outline (rise.md 3B,
 * UI-BLOCKS-EDITOR-R10, BLK-02): the entry with a new id for every object in it, unused in both
 * courses, and a media index entry for each media file it uses that `target` has not. What cannot
 * point across courses goes as when the entry it points at is deleted (D-36): a button to another
 * entry is removed and a quiz's skip-ahead is turned off. Undefined when `source` has no such
 * entry, or when the entry uses a custom-block document, which has no commands yet.
 */
export function copyEntryTo(source: Course, id: string, target: Course): EntryCopy | undefined {
  const entry = source.entries.find((candidate) => candidate.id === id);
  if (!entry || (entry.kind === "lesson" && entry.blocks.some((block) => block.customBlock))) {
    return undefined;
  }
  const taken = new Set([...indexDocument(source).keys(), ...indexDocument(target).keys()]);
  const fresh = () => {
    const next = newContentId(taken);
    taken.add(next);
    return next;
  };
  const renamed = new Map(
    idsIn(entry as unknown as Record<string, unknown>, "entry").map((old) => [old, fresh()]),
  );
  const known = new Map(source.media.map((media) => [media.key, media]));
  const keys = new Set<string>();
  const elsewhere = (value: unknown) => {
    const item = value as { kind?: unknown; destination?: { kind?: unknown; entry?: unknown } };
    return (
      item?.kind === "button" &&
      item.destination?.kind === "lesson" &&
      !renamed.has(item.destination.entry as string)
    );
  };
  const copy = (value: unknown, name?: string): unknown => {
    if (typeof value === "string") {
      if (name === "key" && known.has(value)) keys.add(value);
      return renamed.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.filter((item) => !elsewhere(item)).map((v) => copy(v));
    if (value === null || typeof value !== "object") return value;
    if (Object.hasOwn(value, "containerId")) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([field]) => field !== "skipAhead")
        .map(([field, item]) => [field, copy(item, field)]),
    );
  };
  const value = copy(entry) as Entry;
  const present = new Set(target.media.map((media) => media.key));
  const commands: Command[] = [...keys]
    .filter((key) => !present.has(key))
    .map((key) => ({
      type: "insertMedia",
      value: { ...(known.get(key) as MediaEntry), id: fresh() },
    }));
  commands.push({ type: "insertEntry", value });
  return { commands, keys: [...keys] };
}
