import { afterEach, describe, expect, test, vi } from "vitest";
import { fullCourse } from "../test/courses.js";
import { newContentId, newProjectId, withNewProjectId } from "./ids.js";
import type { Schema } from "./validate.js";
import { courseSchema, validateCourse } from "./validate.js";

const defs = courseSchema.$defs as Record<string, Schema>;
const pattern = (name: string) => new RegExp((defs[name] as Schema).pattern as string);
const webCrypto = (
  globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }
).crypto;

/** Makes getRandomValues return these bytes, in order, across calls. */
function randomBytes(bytes: number[]) {
  const queue = [...bytes];
  vi.spyOn(webCrypto, "getRandomValues").mockImplementation((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) array[i] = queue.shift() ?? 0;
    return array;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("content ids", () => {
  test("match the schema's id pattern and do not repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newContentId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(pattern("Id"));
  });

  test("a collision with an id in the document is drawn again", () => {
    // 20 zero bytes give "aaaaaaaaaa", the next 20 ones give "bbbbbbbbbb".
    randomBytes([...Array(20).fill(0), ...Array(20).fill(1)]);
    expect(newContentId(new Set(["aaaaaaaaaa"]))).toBe("bbbbbbbbbb");
  });

  test("bytes that would bias the alphabet are skipped", () => {
    // 26 letters: bytes 234 to 255 are dropped. 36 letters and digits: 252 to 255 are dropped.
    randomBytes([234, 255, 25, 0, 252, 35, 26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(newContentId()).toBe("z90aaaaaaa");
  });
});

describe("project ids", () => {
  test("are version 4 UUIDs", () => {
    expect(newProjectId()).toMatch(pattern("ProjectId"));
  });

  test("save as gets a new project id and keeps every content id", () => {
    const course = fullCourse();
    const copy = withNewProjectId(course);
    expect(copy.id).not.toBe(course.id);
    expect({ ...copy, id: course.id }).toEqual(course);
    expect(course).toEqual(fullCourse());
    expect(validateCourse(copy)).toEqual([]);
  });
});
