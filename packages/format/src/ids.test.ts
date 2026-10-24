import { afterEach, describe, expect, test, vi } from "vitest";
import { fullCourse } from "../test/courses.js";
import { activityIri, newContentId, newProjectId, withNewProjectId } from "./ids.js";
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

describe("activity IRIs", () => {
  test("[standards:E-16] use the author's IRI, or one from the project id, then content ids", () => {
    const course = fullCourse();
    expect(activityIri(course)).toBe("https://example.com/courses/workshop-safety");
    expect(activityIri(course, "quiz000001", "q00000001")).toBe(
      "https://example.com/courses/workshop-safety/quiz000001/q00000001",
    );
    const trailing = {
      ...course,
      publish: { standard: "xapi" as const, activityId: "https://example.com/c/" },
    };
    expect(activityIri(trailing)).toBe("https://example.com/c/");
    expect(activityIri(trailing, "lesson0001")).toBe("https://example.com/c/lesson0001");
    const generated = { ...course, publish: { standard: "xapi" as const } };
    expect(activityIri(generated)).toBe(`urn:uuid:${course.id}`);
    expect(activityIri(generated, "lesson0001")).toBe(`urn:uuid:${course.id}/lesson0001`);
    // A new project id (save as) gives new IRIs; nothing else changes them.
    expect(activityIri(withNewProjectId(generated))).not.toBe(activityIri(generated));
  });
});
