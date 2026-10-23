// Resume codec (STD-01, M1-08; standards.md §4.2, rise.md §4 "Learner state stored in the LMS"):
// learner state keyed by stable ids, never by position, so it survives a republish; bit-packed;
// in a versioned envelope with the package version; within a hard size cap per target, dropping
// the least important parts in a fixed order when it does not fit.
import type { Response } from "@course-suite/format";
import { BitReader, BitWriter } from "./packing.js";

/** The resume format this player writes. A payload is `<format>.<packed state>`. */
export const RESUME_FORMAT = 1;

/** Suspend-data caps in characters (standards.md §4.2). xAPI state has the cap the author sets. */
export const RESUME_CAPS = {
  scorm12: 4_096,
  scorm2004_2nd: 4_000,
  scorm2004: 64_000,
} as const;

/** What a player resumes from. Every key and id is a stable content id (ADR-0002). */
export interface ResumeState {
  /** The lesson or slide the learner was on. */
  location?: string;
  /** The language the learner chose. */
  language?: string;
  /** Completed objects: lessons, blocks, items, slides. A set: order is not kept. */
  done?: readonly string[];
  /** Visited children by container (scene or lesson). Sets: order is not kept. */
  visited?: Readonly<Record<string, readonly string[]>>;
  /** Responses by question id. */
  answers?: Readonly<Record<string, Response>>;
  /** Drawn question ids by quiz id, in the order shown. */
  draws?: Readonly<Record<string, readonly string[]>>;
  /** Attempt scores (0 to 100) by quiz id, oldest first. */
  attempts?: Readonly<Record<string, readonly number[]>>;
  variables?: Readonly<Record<string, string | number | boolean>>;
  /** Playback positions in seconds by media or block id. */
  media?: Readonly<Record<string, number>>;
  /** Scroll positions by lesson or slide id. */
  scroll?: Readonly<Record<string, number>>;
}

/** The parts dropped when a payload is over its cap, in this order (standards.md §4.2). */
export const DROP_ORDER = ["scroll", "media", "finished-visits"] as const;
export type DropPart = (typeof DROP_ORDER)[number];

export interface EncodeOptions {
  /** The version of the published package, kept in the envelope (rise.md rule 12). */
  packageVersion: string;
  /** The most characters the target stores (`RESUME_CAPS`). */
  cap: number;
}

export type EncodeResult =
  /** `dropped` lists the parts left out to fit, in drop order. */
  | { ok: true; payload: string; dropped: DropPart[] }
  /** Over the cap even with every droppable part left out; `size` is that smallest payload. */
  | { ok: false; size: number; dropped: DropPart[] };

/** Encodes a state within the cap. The same state always gives the same payload. */
export function encodeResume(state: ResumeState, options: EncodeOptions): EncodeResult {
  let current = canonical(state);
  let payload = pack(options.packageVersion, current);
  const dropped: DropPart[] = [];
  for (const part of DROP_ORDER) {
    if (payload.length <= options.cap) break;
    const smaller = drop(current, part);
    if (smaller === current) continue;
    current = smaller;
    dropped.push(part);
    payload = pack(options.packageVersion, current);
  }
  return payload.length <= options.cap
    ? { ok: true, payload, dropped }
    : { ok: false, size: payload.length, dropped };
}

export type DecodeResult =
  | { status: "ok"; state: ResumeState; packageVersion: string }
  /** Nothing stored: a first launch. */
  | { status: "empty" }
  /** Written by a newer player in a format this one cannot read. */
  | { status: "newer"; format: number }
  /** Damaged, or not a payload this player wrote. */
  | { status: "invalid" };

/**
 * Decodes a stored payload. Compare `packageVersion` with the running package to detect an update
 * (rise.md rule 12), and prune ids the update removed with `pruneResume`.
 */
export function decodeResume(payload: string): DecodeResult {
  if (payload === "") return { status: "empty" };
  const envelope = /^(\d{1,9})\.(.*)$/s.exec(payload);
  if (!envelope) return { status: "invalid" };
  const format = Number(envelope[1]);
  if (format > RESUME_FORMAT) return { status: "newer", format };
  if (format !== RESUME_FORMAT) return { status: "invalid" };
  try {
    return { status: "ok", ...unpack(envelope[2] as string) };
  } catch {
    return { status: "invalid" };
  }
}

/** The state without ids that no longer exist in the course, so an old payload still resumes. */
export function pruneResume(state: ResumeState, exists: (id: string) => boolean): ResumeState {
  const keep = <T>(record: Readonly<Record<string, T>> | undefined) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => exists(id)));
  const pruned = {
    ...state,
    location: state.location !== undefined && exists(state.location) ? state.location : undefined,
    done: state.done?.filter(exists),
    visited: mapValues(keep(state.visited), (ids) => ids.filter(exists)),
    answers: keep(state.answers),
    // A draw that lost a question is drawn again.
    draws: filterValues(keep(state.draws), (ids) => ids.every(exists)),
    attempts: keep(state.attempts),
    variables: keep(state.variables),
    media: keep(state.media),
    scroll: keep(state.scroll),
  };
  // canonical leaves out the parts that are now undefined or empty.
  return canonical(pruned as ResumeState);
}

export interface ResumeWarning {
  /** `parts-dropped`: fits once `dropped` is left out. `over-cap`: does not fit at all. */
  code: "parts-dropped" | "over-cap";
  /** Characters the state needs with nothing dropped. */
  size: number;
  cap: number;
  dropped: DropPart[];
  /** For the author, in English; the editor may show its own text for `code`. */
  message: string;
}

const PART_NAMES: Record<DropPart, string> = {
  scroll: "scroll positions",
  media: "media playback positions",
  "finished-visits": "visited pages of finished sections",
};

/**
 * Warns the author at publish time when a state, typically the largest one the course can produce,
 * does not fit the target's cap. No warning means it fits whole.
 */
export function checkResume(state: ResumeState, options: EncodeOptions): ResumeWarning[] {
  const result = encodeResume(state, options);
  if (result.ok && result.dropped.length === 0) return [];
  const size = pack(options.packageVersion, canonical(state)).length;
  const { cap } = options;
  const parts = result.dropped.map((part) => PART_NAMES[part]).join(", ");
  const needs = `Learner progress for this course can reach ${size} characters, more than the ${cap} this target stores.`;
  const base = { size, cap, dropped: result.dropped };
  if (result.ok) {
    return [
      {
        code: "parts-dropped",
        ...base,
        message: `${needs} To fit, these are not saved: ${parts}.`,
      },
    ];
  }
  const without = parts ? ` It does not fit even without ${parts}.` : "";
  return [
    {
      code: "over-cap",
      ...base,
      message: `${needs}${without} Progress stops being saved once it grows that large.`,
    },
  ];
}

// --- Canonical form, dropping ---

/** Sorted keys and sets, no empty parts, no numbers that cannot be stored. */
function canonical(state: ResumeState): ResumeState {
  const out: Record<string, unknown> = {};
  if (state.location !== undefined) out.location = state.location;
  if (state.language !== undefined) out.language = state.language;
  set(out, "done", state.done && sortedSet(state.done));
  set(out, "visited", mapValues(state.visited, sortedSet));
  set(out, "answers", state.answers);
  set(out, "draws", state.draws);
  set(
    out,
    "attempts",
    mapValues(state.attempts, (scores) => scores.filter(Number.isFinite)),
  );
  set(
    out,
    "variables",
    state.variables &&
      filterValues(state.variables, (v) => typeof v !== "number" || Number.isFinite(v)),
  );
  set(out, "media", state.media && filterValues(state.media, Number.isFinite));
  set(out, "scroll", state.scroll && filterValues(state.scroll, Number.isFinite));
  return out as ResumeState;
}

function set(out: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    if (value.length > 0) out[key] = value;
    return;
  }
  const entries = Object.entries(value as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length > 0) out[key] = Object.fromEntries(entries);
}

const sortedSet = (ids: readonly string[]) => [...new Set(ids)].sort();

function mapValues<T, U>(
  record: Readonly<Record<string, T>> | undefined,
  map: (value: T) => U,
): Record<string, U> | undefined {
  return record && Object.fromEntries(Object.entries(record).map(([k, v]) => [k, map(v)]));
}

function filterValues<T>(
  record: Readonly<Record<string, T>>,
  keep: (value: T) => boolean,
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => keep(v)));
}

/** The state without one droppable part; the same object when there is nothing to drop. */
function drop(state: ResumeState, part: DropPart): ResumeState {
  if (part !== "finished-visits") {
    if (!state[part]) return state;
    const { [part]: _, ...rest } = state;
    return rest;
  }
  const done = new Set(state.done);
  const visited = Object.entries(state.visited ?? {});
  if (!visited.some(([id]) => done.has(id))) return state;
  return canonical({
    ...state,
    visited: Object.fromEntries(visited.filter(([id]) => !done.has(id))),
  });
}

// --- Packing: the field order below is the format; change it only with RESUME_FORMAT ---

function pack(packageVersion: string, state: ResumeState): string {
  const w = new BitWriter();
  w.text(packageVersion);
  optional(w, state.location, () => w.id(state.location as string));
  optional(w, state.language, () => w.text(state.language as string));
  list(w, state.done ?? [], (id) => w.id(id));
  record(w, state.visited, (ids) => list(w, ids, (id) => w.id(id)));
  record(w, state.answers, (response) => {
    if (typeof response === "string") {
      w.bits(0, 2);
      w.id(response);
    } else if (isList(response)) {
      w.bits(1, 2);
      list(w, response, (id) => w.id(id));
    } else {
      w.bits(2, 2);
      record(w, response, (id) => w.id(id));
    }
  });
  record(w, state.draws, (ids) => list(w, ids, (id) => w.id(id)));
  record(w, state.attempts, (scores) => list(w, scores, (score) => w.number(score)));
  record(w, state.variables, (value) => {
    if (typeof value === "boolean") w.bits(value ? 1 : 0, 2);
    else if (typeof value === "number") {
      w.bits(2, 2);
      w.number(value);
    } else {
      w.bits(3, 2);
      w.text(value);
    }
  });
  record(w, state.media, (seconds) => w.number(seconds));
  record(w, state.scroll, (position) => w.number(position));
  return `${RESUME_FORMAT}.${w.end()}`;
}

function unpack(data: string): { state: ResumeState; packageVersion: string } {
  const r = new BitReader(data);
  const packageVersion = r.text();
  const state: Record<string, unknown> = {};
  if (r.bits(1)) state.location = r.id();
  if (r.bits(1)) state.language = r.text();
  state.done = readList(r, () => r.id());
  state.visited = readRecord(r, () => readList(r, () => r.id()));
  state.answers = readRecord(r, (): Response => {
    const kind = r.bits(2);
    if (kind === 0) return r.id();
    if (kind === 1) return readList(r, () => r.id());
    if (kind === 2) return readRecord(r, () => r.id());
    throw new Error("unknown response kind");
  });
  state.draws = readRecord(r, () => readList(r, () => r.id()));
  state.attempts = readRecord(r, () => readList(r, () => r.number()));
  state.variables = readRecord(r, () => {
    const kind = r.bits(2);
    return kind < 2 ? kind === 1 : kind === 2 ? r.number() : r.text();
  });
  state.media = readRecord(r, () => r.number());
  state.scroll = readRecord(r, () => r.number());
  r.end();
  return { state: canonical(state as ResumeState), packageVersion };
}

const isList = (value: Response): value is readonly string[] => Array.isArray(value);

function optional(w: BitWriter, value: unknown, write: () => void) {
  w.bits(value === undefined ? 0 : 1, 1);
  if (value !== undefined) write();
}

function list<T>(w: BitWriter, items: readonly T[], write: (item: T) => void) {
  w.uint(items.length, 4);
  for (const item of items) write(item);
}

function record<T>(
  w: BitWriter,
  items: Readonly<Record<string, T>> | undefined,
  write: (value: T) => void,
) {
  const entries = Object.entries(items ?? {});
  w.uint(entries.length, 4);
  for (const [id, value] of entries) {
    w.id(id);
    write(value);
  }
}

function readList<T>(r: BitReader, read: () => T): T[] {
  const items: T[] = [];
  for (let n = r.uint(4); n > 0; n--) items.push(read());
  return items;
}

function readRecord<T>(r: BitReader, read: () => T): Record<string, T> {
  const entries: [string, T][] = [];
  const ids = new Set<string>();
  for (let n = r.uint(4); n > 0; n--) {
    const id = r.id();
    if (ids.has(id)) throw new Error("duplicate id");
    ids.add(id);
    entries.push([id, read()]);
  }
  return Object.fromEntries(entries);
}
