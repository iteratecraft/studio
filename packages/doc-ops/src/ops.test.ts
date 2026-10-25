import { describe, expect, test } from "vitest";
import type { Op } from "./ops.js";
import { applyOp, applyOps } from "./ops.js";

const doc = () => ({ a: 1, b: { c: [1, 2, 3], d: "x" }, e: { f: true } });
const text = (value: unknown) => JSON.stringify(value);

describe("ops", () => {
  test.each<[string, Op]>([
    ["set an existing property", { op: "set", path: ["b", "d"], value: "y" }],
    ["set a new property", { op: "set", path: ["b", "g"], value: [1] }],
    ["unset a property in the middle", { op: "unset", path: ["b", "c"] }],
    ["insert into an array", { op: "insert", path: ["b", "c", 1], value: 9 }],
    ["insert at the end of an array", { op: "insert", path: ["b", "c", 3], value: 9 }],
    ["remove from an array", { op: "remove", path: ["b", "c", 0] }],
  ])("%s, then its inverse, gives back the same bytes", (_name, op) => {
    const before = doc();
    const { root, inverse } = applyOp(before, op);
    expect(text(root)).not.toBe(text(before));
    expect(text(applyOp(root, inverse).root)).toBe(text(before));
    expect(text(before)).toBe(text(doc()));
  });

  test("copies only the path it changes", () => {
    const before = doc();
    const { root } = applyOp(before, { op: "set", path: ["b", "d"], value: "y" });
    expect(root).not.toBe(before);
    expect(root.b).not.toBe(before.b);
    expect(root.b.c).toBe(before.b.c);
    expect(root.e).toBe(before.e);
  });

  test("a __proto__ key stays plain data", () => {
    const before = JSON.parse('{"x":{}}') as { x: object };
    const { root } = applyOp(before, {
      op: "set",
      path: ["x", "__proto__"],
      value: { polluted: 1 },
    });
    expect(Object.getPrototypeOf(root.x)).toBe(Object.prototype);
    expect(Object.hasOwn(root.x, "__proto__")).toBe(true);
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
  });

  test("a path that does not exist throws", () => {
    expect(() => applyOp(doc(), { op: "unset", path: ["b", "zz"] })).toThrow();
    expect(() => applyOp(doc(), { op: "remove", path: ["b", "c", 3] })).toThrow();
    expect(() => applyOp(doc(), { op: "set", path: ["q", "r"], value: 1 })).toThrow();
  });

  test("applyOps returns the inverse ops in undo order", () => {
    const before = doc();
    const { root, inverse } = applyOps(before, [
      { op: "insert", path: ["b", "c", 0], value: 0 },
      { op: "remove", path: ["b", "c", 3] },
      { op: "unset", path: ["a"] },
    ]);
    expect(root).toEqual({ b: { c: [0, 1, 2], d: "x" }, e: { f: true } });
    expect(text(applyOps(root, inverse).root)).toBe(text(before));
  });
});
