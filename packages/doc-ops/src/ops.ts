// The low-level edits every command compiles to, and their exact inverses. A document is never
// changed in place: applying an op copies only the objects and arrays on its path, so earlier
// documents stay valid (undo, snapshots, change events) and cost little memory.

/** Where a value lives: property names and array indexes from the course root. */
export type Path = readonly (string | number)[];

export type Op =
  /** Sets an object property. `at` puts a property that is added back at its old position, so
   * undo restores the document byte for byte. */
  | { op: "set"; path: Path; value: unknown; at?: number }
  /** Removes an object property. */
  | { op: "unset"; path: Path }
  /** Inserts into an array; the last path segment is the index. */
  | { op: "insert"; path: Path; value: unknown }
  /** Removes an array element; the last path segment is the index. */
  | { op: "remove"; path: Path };

type Json = Record<string, unknown> | unknown[];

/** Applies one op to a document and returns the new document and the op that undoes it. */
export function applyOp<T>(root: T, op: Op): { root: T; inverse: Op } {
  let inverse: Op | undefined;
  const leaf = (parent: Json, key: string | number): Json => {
    if (Array.isArray(parent)) {
      const index = key as number;
      if (op.op === "insert" && index >= 0 && index <= parent.length) {
        inverse = { op: "remove", path: op.path };
        return parent.toSpliced(index, 0, op.value);
      }
      if (op.op === "remove" && index >= 0 && index < parent.length) {
        inverse = { op: "insert", path: op.path, value: parent[index] };
        return parent.toSpliced(index, 1);
      }
      throw new Error(`Cannot ${op.op} at ${op.path.join("/")}`);
    }
    const name = String(key);
    const entries = Object.entries(parent);
    const at = entries.findIndex(([k]) => k === name);
    if (op.op === "set") {
      inverse =
        at < 0
          ? { op: "unset", path: op.path }
          : { op: "set", path: op.path, value: entries[at]?.[1] };
      if (at >= 0) entries[at] = [name, op.value];
      else entries.splice(op.at ?? entries.length, 0, [name, op.value]);
      return Object.fromEntries(entries);
    }
    if (op.op === "unset" && at >= 0) {
      inverse = { op: "set", path: op.path, value: entries[at]?.[1], at };
      entries.splice(at, 1);
      return Object.fromEntries(entries);
    }
    throw new Error(`Cannot ${op.op} at ${op.path.join("/")}`);
  };
  const next = edit(root as Json, op.path, 0, leaf) as T;
  return { root: next, inverse: inverse as Op };
}

/** Applies ops in order; returns the new document and the ops that undo them, in undo order. */
export function applyOps<T>(root: T, ops: readonly Op[]): { root: T; inverse: Op[] } {
  const inverse: Op[] = [];
  let current = root;
  for (const op of ops) {
    const result = applyOp(current, op);
    current = result.root;
    inverse.unshift(result.inverse);
  }
  return { root: current, inverse };
}

function edit(
  node: Json,
  path: Path,
  depth: number,
  leaf: (parent: Json, key: string | number) => Json,
): Json {
  const key = path[depth];
  if (key === undefined || typeof node !== "object" || node === null) {
    throw new Error(`No value at ${path.slice(0, depth).join("/")}`);
  }
  if (depth === path.length - 1) return leaf(node, key);
  const child = (node as Record<string | number, unknown>)[key];
  const own = Array.isArray(node) ? typeof key === "number" : Object.hasOwn(node, key);
  if (!own) throw new Error(`No value at ${path.slice(0, depth + 1).join("/")}`);
  const changed = edit(child as Json, path, depth + 1, leaf);
  if (Array.isArray(node)) return node.with(key as number, changed);
  // Object.fromEntries defines own properties, so a "__proto__" key stays plain data.
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === key ? changed : v]));
}
