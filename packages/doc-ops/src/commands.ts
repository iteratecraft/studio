// The commands (ENG-10): every edit of a Blocks course, by hand, by AI or by a co-author, is a list of
// these. A list is applied as one unit: each command is checked against its JSON Schema and against
// the document, compiled to ops (ops.ts), and the result must pass the format's full validation, or
// nothing is written.
import type {
  Answer,
  Block,
  Course,
  Entry,
  Item,
  MatchPair,
  MediaEntry,
  QuizQuestion,
} from "@course-suite/format";
import {
  checkSchema,
  compareVersions,
  newContentId,
  parseVersion,
  SCHEMA_VERSION,
  validateCourse,
} from "@course-suite/format";
import type { Op, Path } from "./ops.js";
import { applyOps } from "./ops.js";
import { compiledCommandSchema } from "./schemas.js";
import type { Kind, Located } from "./walk.js";
import { idsIn, indexDocument, walk } from "./walk.js";

/** The object each kind of command inserts. */
export interface Values {
  entry: Entry;
  block: Block;
  item: Item;
  question: QuizQuestion;
  answer: Answer;
  pair: MatchPair;
  media: MediaEntry;
}

/** Fields an update may not touch: ids and kinds are fixed, and child lists have their own
 * commands. A media entry's key names its file, so a new file is a new entry. */
export const LOCKED = {
  course: ["schemaVersion", "id", "kind", "entries", "media", "customBlocks"],
  entry: ["id", "kind", "blocks", "questions"],
  block: ["id", "category", "items"],
  item: ["id", "kind"],
  question: ["id", "kind", "answers", "pairs"],
  answer: ["id"],
  pair: ["id"],
  media: ["id", "key"],
} as const satisfies Record<Kind | "course", readonly string[]>;

/** Where each kind lives, and what may hold it. */
export const COLLECTIONS: Record<
  Kind,
  {
    field: string;
    def: string;
    noun: string;
    parent?: { kind: Kind; noun: string; accepts: (value: Record<string, unknown>) => boolean };
    /** Media index order carries no meaning, so media entries are not moved or duplicated. */
    fixed?: true;
  }
> = {
  entry: { field: "entries", def: "Entry", noun: "outline entry (lesson, quiz or section header)" },
  block: {
    field: "blocks",
    def: "Block",
    noun: "block",
    parent: { kind: "entry", noun: "lesson", accepts: (v) => v.kind === "lesson" },
  },
  item: {
    field: "items",
    def: "Item",
    noun: "block item",
    parent: { kind: "block", noun: "block", accepts: () => true },
  },
  question: {
    field: "questions",
    def: "QuizQuestion",
    noun: "quiz question or question-bank draw",
    parent: { kind: "entry", noun: "quiz", accepts: (v) => v.kind === "quiz" },
  },
  answer: {
    field: "answers",
    def: "Answer",
    noun: "answer choice",
    parent: {
      kind: "question",
      noun: "single-choice or multiple-response question",
      accepts: (v) => v.kind === "single-choice" || v.kind === "multiple-response",
    },
  },
  pair: {
    field: "pairs",
    def: "MatchPair",
    noun: "matching pair",
    parent: { kind: "question", noun: "matching question", accepts: (v) => v.kind === "matching" },
  },
  media: { field: "media", def: "MediaEntry", noun: "media index entry", fixed: true },
};

type Locked<K extends keyof typeof LOCKED> = (typeof LOCKED)[K][number];
type OptionalKeys<T> = { [P in keyof T]-?: object extends Pick<T, P> ? P : never }[keyof T];
type Fields<T, L extends PropertyKey> = T extends unknown ? Partial<Omit<T, L>> : never;
type Unsettable<T, L extends PropertyKey> = T extends unknown ? Exclude<OptionalKeys<T>, L> : never;
type HasParent = Exclude<Kind, "entry" | "media">;
type Movable = Exclude<Kind, "media">;

export type UpdateCourseCommand = {
  type: "updateCourse";
  set?: Fields<Course, Locked<"course">>;
  unset?: Unsettable<Course, Locked<"course">>[];
};
export type InsertCommand<K extends Kind> = {
  type: `insert${Capitalize<K>}`;
  /** Position in the list; the end when left out. */
  index?: number;
  value: Values[K];
} & (K extends HasParent ? { parent: string } : unknown);
export type UpdateCommand<K extends Kind> = {
  type: `update${Capitalize<K>}`;
  id: string;
  set?: Fields<Values[K], Locked<K>>;
  unset?: Unsettable<Values[K], Locked<K>>[];
};
export type MoveCommand<K extends Movable> = {
  type: `move${Capitalize<K>}`;
  id: string;
  /** Position after the move. */
  index: number;
} & (K extends HasParent ? { parent?: string } : unknown);
export type DuplicateCommand<K extends Movable> = {
  type: `duplicate${Capitalize<K>}`;
  id: string;
  /** Position of the copy; directly below the original, or the end of another parent's list. */
  index?: number;
} & (K extends HasParent ? { parent?: string } : unknown);
export type DeleteCommand<K extends Kind> = { type: `delete${Capitalize<K>}`; id: string };

export type Command =
  | UpdateCourseCommand
  | { [K in Kind]: InsertCommand<K> | UpdateCommand<K> | DeleteCommand<K> }[Kind]
  | { [K in Movable]: MoveCommand<K> | DuplicateCommand<K> }[Movable];
export type CommandType = Command["type"];

export type Verb = "insert" | "update" | "move" | "duplicate" | "delete";

/** Every command type, with its verb and kind. */
export const COMMAND_TYPES: ReadonlyMap<CommandType, { verb: Verb; kind: Kind | "course" }> =
  new Map([
    ["updateCourse", { verb: "update", kind: "course" }],
    ...(Object.keys(COLLECTIONS) as Kind[]).flatMap((kind) =>
      (["insert", "update", "move", "duplicate", "delete"] as const)
        .filter((verb) => !(COLLECTIONS[kind].fixed && (verb === "move" || verb === "duplicate")))
        .map(
          (verb) => [`${verb}${kind[0]?.toUpperCase()}${kind.slice(1)}`, { verb, kind }] as const,
        ),
    ),
  ] as [CommandType, { verb: Verb; kind: Kind | "course" }][]);

/**
 * Why a command list was rejected. `command` is the index of the command in the list, absent when
 * the result as a whole failed validation. `path` is a JSON Pointer into that command, or into the
 * resulting document for `invalid-document`.
 */
export interface CommandError {
  code: "invalid-command" | "not-found" | "not-allowed" | "invalid-document";
  command?: number;
  path: string;
  message: string;
}

export type ApplyResult =
  | {
      ok: true;
      document: Course;
      /** The ops applied, in order; one list is one co-editing transaction (README). */
      ops: Op[];
      /** The ops that undo them, in order. */
      inverse: Op[];
      /** Ids of the objects changed, added or removed, and of the objects holding them. */
      ids: string[];
      /** Id of each object inserted or duplicated, in command order. */
      created: string[];
    }
  | { ok: false; errors: CommandError[] };

type Obj = Record<string, unknown>;
interface Compiled {
  ops: Op[];
  ids: string[];
  created?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const pointer = (path: Path) =>
  path.map((key) => `/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");

/** A document from a newer MINOR keeps properties this version does not know (format openCourse). */
function isNewerMinor(course: Course): boolean {
  const version = parseVersion(course.schemaVersion);
  return (
    version !== undefined && compareVersions(version, parseVersion(SCHEMA_VERSION) ?? [0, 0]) > 0
  );
}

/** Problems of a document the editor is given, by the same rules the commands keep. */
export function documentErrors(course: Course) {
  return validateCourse(course, { allowUnknown: isNewerMinor(course) });
}

/**
 * Applies a list of commands as one unit to a valid document. On success the result passes
 * validateCourse; on failure nothing is written and the errors say which command and where. The
 * input document is never changed.
 */
export function applyCommands(course: Course, commands: readonly Command[]): ApplyResult {
  let document = course;
  const ops: Op[] = [];
  const inverse: Op[] = [];
  const ids: string[] = [];
  const created: string[] = [];
  for (const [i, command] of commands.entries()) {
    const compiled = compileCommand(document, command, i);
    if ("errors" in compiled) return { ok: false, errors: compiled.errors };
    const applied = applyOps(document, compiled.ops);
    document = applied.root;
    ops.push(...compiled.ops);
    inverse.unshift(...applied.inverse);
    ids.push(...compiled.ids);
    if (compiled.created) created.push(compiled.created);
  }
  if (ops.length > 0) {
    // shortcut: validates the whole document per list (milliseconds for a large course, see
    // README); validate only the changed subtrees if typing ever feels slow.
    const errors = documentErrors(document);
    if (errors.length > 0) {
      return {
        ok: false,
        errors: errors.map((e) => ({ code: "invalid-document", path: e.path, message: e.message })),
      };
    }
  }
  return { ok: true, document, ops, inverse, ids: [...new Set(ids)], created };
}

function compileCommand(
  course: Course,
  command: Command,
  at: number,
): Compiled | { errors: CommandError[] } {
  const fail = (code: CommandError["code"], path: string, message: string) => ({
    errors: [{ code, command: at, path, message }],
  });
  const type = (command as { type?: unknown } | null)?.type;
  const spec = COMMAND_TYPES.get(type as CommandType);
  if (!spec) return fail("invalid-command", "/type", "is not a known command");
  const checked = checkSchema(compiledCommandSchema(type as CommandType), command);
  if (checked.errors.length > 0) {
    return { errors: checked.errors.map((e) => ({ code: "invalid-command", command: at, ...e })) };
  }
  const c = command as Obj;
  if (spec.kind === "course") return update(course as unknown as Obj, [], course.id, c, fail);

  const kind = spec.kind;
  const collection = COLLECTIONS[kind];
  const index = indexDocument(course);
  const find = (id: unknown) => {
    const found = index.get(id as string);
    return found?.kind === kind ? found : undefined;
  };
  // The list a new or moved object goes into: the course's, or the parent's.
  const container = (parentId: unknown, path: string) => {
    if (!collection.parent) {
      return { path: [collection.field], list: (course as unknown as Obj)[collection.field] };
    }
    const parent = index.get(parentId as string);
    if (!parent) return fail("not-found", path, "does not refer to an object in this document");
    if (parent.kind !== collection.parent.kind || !collection.parent.accepts(parent.value)) {
      return fail("not-allowed", path, `must refer to a ${collection.parent.noun}`);
    }
    const p: Path = [...parent.path, collection.field];
    return { path: p, list: parent.value[collection.field], id: parent.value.id as string };
  };
  const insertAt = (target: { path: Path; list: unknown }, i: number, value: unknown): Op =>
    Array.isArray(target.list)
      ? { op: "insert", path: [...target.path, i], value }
      : { op: "set", path: target.path, value: [value] };
  const lengthOf = (list: unknown) => (Array.isArray(list) ? list.length : 0);
  // An object addressed by id, which must sit in its kind's list (a knowledge check's question
  // does not: it is changed through its block).
  const member = (): Located | { errors: CommandError[] } => {
    const found = find(c.id);
    if (!found) return fail("not-found", "/id", `does not refer to a ${collection.noun}`);
    const inList =
      found.path.at(-2) === collection.field && found.parent?.kind === collection.parent?.kind;
    if (!inList) return fail("not-allowed", "/id", `must refer to a ${collection.noun} in a list`);
    return found;
  };

  switch (spec.verb) {
    case "insert": {
      const target = container(c.parent, "/parent");
      if ("errors" in target) return target;
      const i = (c.index as number | undefined) ?? lengthOf(target.list);
      if (i > lengthOf(target.list)) {
        return fail("not-allowed", "/index", `must be at most ${lengthOf(target.list)}`);
      }
      const value = clone(c.value) as Obj;
      return {
        ops: [insertAt(target, i, value)],
        ids: [...(target.id ? [target.id] : []), ...idsIn(value, kind)],
        created: value.id as string,
      };
    }
    case "update": {
      const found = find(c.id);
      if (!found) return fail("not-found", "/id", `does not refer to a ${collection.noun}`);
      return update(found.value, found.path, found.value.id as string, c, fail);
    }
    case "move": {
      const found = member();
      if ("errors" in found) return found;
      const from = found.path.at(-1) as number;
      const parentId = c.parent ?? found.parent?.value.id;
      const target = container(parentId, "/parent");
      if ("errors" in target) return target;
      const same = pointer(target.path) === pointer(found.path.slice(0, -1));
      const max = lengthOf(target.list) - (same ? 1 : 0);
      if ((c.index as number) > max) return fail("not-allowed", "/index", `must be at most ${max}`);
      if (same && c.index === from) return { ops: [], ids: [] };
      const ops: Op[] = [{ op: "remove", path: found.path }];
      ops.push(insertAt(target, c.index as number, found.value));
      const ids = [found.value.id, found.parent?.value.id, target.id];
      return { ops, ids: ids.filter((id): id is string => typeof id === "string") };
    }
    case "duplicate": {
      const found = member();
      if ("errors" in found) return found;
      const parentId = c.parent ?? found.parent?.value.id;
      const target = container(parentId, "/parent");
      if ("errors" in target) return target;
      const same = pointer(target.path) === pointer(found.path.slice(0, -1));
      // UI-BLOCKS-EDITOR-R10, R24: a copy lands directly below; in another parent, at the end.
      const below = same ? (found.path.at(-1) as number) + 1 : lengthOf(target.list);
      const i = (c.index as number | undefined) ?? below;
      if (i > lengthOf(target.list)) {
        return fail("not-allowed", "/index", `must be at most ${lengthOf(target.list)}`);
      }
      const copy = withNewIds(found.value, kind, new Set(index.keys()));
      return {
        ops: [insertAt(target, i, copy)],
        ids: [...(target.id ? [target.id] : []), ...idsIn(copy, kind)],
        created: copy.id as string,
      };
    }
    case "delete": {
      const found = member();
      if ("errors" in found) return found;
      const fixes = kind === "entry" ? referencesTo(course, index, found) : { ops: [], ids: [] };
      const ids = [found.parent?.value.id, ...idsIn(found.value, kind), ...fixes.ids];
      return {
        ops: [...fixes.ops, { op: "remove", path: found.path }],
        ids: ids.filter((id): id is string => typeof id === "string"),
      };
    }
  }
}

function update(
  target: Obj,
  path: Path,
  id: string,
  command: Obj,
  fail: (code: CommandError["code"], path: string, message: string) => { errors: CommandError[] },
): Compiled | { errors: CommandError[] } {
  // A JSON copy also drops properties set to undefined, which JSON cannot carry.
  const set = clone((command.set ?? {}) as Obj);
  const unset = (command.unset ?? []) as string[];
  const both = unset.find((name) => Object.hasOwn(set, name));
  if (both) return fail("not-allowed", `/set/${both}`, "is also unset by this command");
  const ops: Op[] = [];
  for (const [name, value] of Object.entries(set)) {
    // Setting a value it already has is no change, so it makes no undo step.
    const old = Object.hasOwn(target, name) ? JSON.stringify(target[name]) : undefined;
    if (old !== JSON.stringify(value)) ops.push({ op: "set", path: [...path, name], value });
  }
  for (const name of unset) {
    if (Object.hasOwn(target, name)) ops.push({ op: "unset", path: [...path, name] });
  }
  return { ops, ids: ops.length > 0 ? [id] : [] };
}

/** A copy with a new id for itself and every object inside it; a sorting card keeps pointing at
 * its category's copy. */
function withNewIds(value: Obj, kind: Kind, taken: Set<string>): Obj {
  const copy = clone(value);
  const renamed = new Map<string, string>();
  walk(copy, kind, [], ({ value: object }) => {
    if (typeof object.id !== "string") return;
    const id = newContentId(taken);
    taken.add(id);
    renamed.set(object.id, id);
    object.id = id;
  });
  walk(copy, kind, [], ({ kind: found, value: object }) => {
    const category = renamed.get(object.category as string);
    if (found === "item" && object.kind === "sorting" && category) object.category = category;
  });
  return copy;
}

/**
 * Ops that keep references valid when an outline entry is deleted: a button that goes to it is
 * removed, a quiz's skip-ahead to it is turned off, and course tracking by a deleted quiz falls back
 * to the completion rule. Continue blocks gate by position (the block above, or every block since
 * the previous continue block), so they hold no reference to fix.
 */
function referencesTo(course: Course, index: Map<string, Located>, entry: Located) {
  const id = entry.value.id;
  const entryIndex = entry.path[1];
  const ops: Op[] = [];
  const ids: unknown[] = [];
  for (const found of index.values()) {
    const value = found.value as Obj & { destination?: Obj; settings?: { skipAhead?: Obj } };
    if (found.path[0] === "entries" && found.path[1] === entryIndex) continue;
    if (found.kind === "item" && value.kind === "button") {
      if (value.destination?.kind === "lesson" && value.destination.entry === id) {
        ops.push({ op: "remove", path: found.path });
        ids.push(value.id, found.parent?.value.id);
      }
    }
    if (found.kind === "entry" && value.settings?.skipAhead?.entry === id) {
      ops.push({ op: "unset", path: [...found.path, "settings", "skipAhead"] });
      ids.push(value.id);
    }
  }
  // Removals in reverse document order, so earlier paths stay valid.
  ops.reverse();
  const tracking = course.publish?.tracking;
  if (tracking?.kind === "quiz" && tracking.quiz === id) {
    ops.push({ op: "set", path: ["publish", "tracking"], value: { kind: "completion" } });
    ids.push(course.id);
  }
  return { ops, ids: ids.filter((x): x is string => typeof x === "string") };
}
