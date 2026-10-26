// Every object with a content id in a course document, with its kind and path. The shape follows
// course.schema.json; walk.test.ts checks that it finds exactly the ids the format validator finds,
// so a schema change that adds an object with an id fails a test until it is added here.
import type { Path } from "./ops.js";

/** Kinds of object a command can address. Draws count as questions: they sit in a quiz's
 * question list. */
export type Kind = "entry" | "block" | "item" | "question" | "answer" | "pair" | "media";

export interface Located {
  kind: Kind | "customBlock";
  path: Path;
  value: Record<string, unknown>;
  /** The object holding it; undefined for objects held by the course itself. */
  parent: Located | undefined;
}

type Obj = Record<string, unknown>;
const list = (value: unknown): Obj[] => (Array.isArray(value) ? (value as Obj[]) : []);

/** Calls `visit` for an object of `kind` at `path` and every object with an id inside it. */
export function walk(
  value: Obj,
  kind: Located["kind"] | "course",
  path: Path,
  visit: (found: Located) => void,
  parent?: Located,
): void {
  const here: Located | undefined = kind === "course" ? undefined : { kind, path, value, parent };
  if (here) visit(here);
  const each = (field: string, child: Located["kind"]) => {
    list(value[field]).forEach((item, i) => {
      walk(item, child, [...path, field, i], visit, here);
    });
  };
  const one = (field: string, child: Located["kind"]) => {
    const item = value[field];
    if (item && typeof item === "object") walk(item as Obj, child, [...path, field], visit, here);
  };
  switch (kind) {
    case "course":
      each("media", "media");
      each("customBlocks", "customBlock");
      each("entries", "entry");
      break;
    case "entry":
      each("blocks", "block");
      each("questions", "question");
      break;
    case "block":
      each("items", "item");
      one("question", "question");
      one("draw", "question");
      break;
    case "question":
      each("answers", "answer");
      each("pairs", "pair");
      list(value.pool).forEach((pooled, i) => {
        const question = pooled.question;
        if (question && typeof question === "object") {
          walk(question as Obj, "question", [...path, "pool", i, "question"], visit, here);
        }
      });
      break;
  }
}

/** Every object with an id in the document, by id. */
export function indexDocument(course: object): Map<string, Located> {
  const index = new Map<string, Located>();
  walk(course as Obj, "course", [], (found) => {
    if (typeof found.value.id === "string") index.set(found.value.id, found);
  });
  return index;
}

/** Ids of the object and of every object inside it. */
export function idsIn(value: Obj, kind: Located["kind"]): string[] {
  const ids: string[] = [];
  walk(value, kind, [], (found) => {
    if (typeof found.value.id === "string") ids.push(found.value.id);
  });
  return ids;
}

/** Every content id in a course, to keep new ids from colliding with them (newContentId). */
export function contentIds(course: object): Set<string> {
  const ids = new Set<string>();
  walk(course as Obj, "course", [], (found) => {
    if (typeof found.value.id === "string") ids.add(found.value.id);
  });
  return ids;
}
