import { describe, expect, test } from "vitest";
import { fullCourse, minimalCourse, sampleCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import { openCourse, serializeCourse } from "./open.js";

const BLOCK = "/entries/1/blocks/0";

describe("round trip", () => {
  test.each([
    ["the minimal course", minimalCourse()],
    ["the full course", fullCourse()],
    ["the player's sample course", sampleCourse()],
  ])("serialise, open, serialise is byte-identical: %s", (_name, course) => {
    const text = serializeCourse(course);
    const opened = openCourse(text);
    expect(opened).toEqual({ status: "ok", document: course });
    expect(opened.status === "ok" && serializeCourse(opened.document)).toBe(text);
  });

  test("extension data survives verbatim, including ids inside it", () => {
    const ext = { "org.example.plugin": { id: "lesson0001", deep: [{ a: null }, 1.5, "x"] } };
    const text = serializeCourse(edit(edit(fullCourse(), "/ext", ext), `${BLOCK}/ext`, ext));
    const opened = openCourse(text);
    expect(opened.status === "ok" && serializeCourse(opened.document)).toBe(text);
  });

  test("serialises with two-space indentation and a final newline", () => {
    expect(serializeCourse(minimalCourse())).toMatch(
      /^\{\n {2}"schemaVersion": "1\.0",\n[\s\S]*\}\n$/,
    );
  });
});

describe("versions", () => {
  test("a newer MINOR opens read-write and keeps unknown fields and its version", () => {
    let course = edit(fullCourse(), "/schemaVersion", "1.7");
    course = edit(course, "/futureSetting", { mode: "x", id: "lesson0001" });
    course = edit(course, `${BLOCK}/settings/shadow`, "soft");
    const text = serializeCourse(course);
    const opened = openCourse(text);
    expect(opened.status).toBe("ok");
    expect(opened.status === "ok" && serializeCourse(opened.document)).toBe(text);
  });

  test("a newer MINOR is still checked for the fields this version knows", () => {
    const text = serializeCourse(edit(edit(fullCourse(), "/schemaVersion", "1.7"), "/title", 3));
    expect(openCourse(text)).toEqual({
      status: "invalid",
      errors: [{ path: "/title", message: "must be a string" }],
    });
  });

  test("a newer MAJOR opens read-only and says which version wrote it", () => {
    const document = { schemaVersion: "2.3", id: "anything", shape: "unknown to us" };
    expect(openCourse(JSON.stringify(document))).toEqual({
      status: "read-only",
      writtenBy: "2.3",
      document,
    });
  });

  test("an older MAJOR without a migration is invalid", () => {
    const text = serializeCourse(edit(minimalCourse(), "/schemaVersion", "0.9"));
    expect(openCourse(text)).toEqual({
      status: "invalid",
      errors: [
        { path: "/schemaVersion", message: "cannot be migrated: no migration from 0.9 to 1.0" },
      ],
    });
  });
});

describe("invalid input", () => {
  test.each([
    ["text that is not JSON", "{", "", "is not JSON"],
    ["JSON that is not an object", "[]", "", "must be an object"],
    ["null", "null", "", "must be an object"],
    ["a missing schemaVersion", "{}", "/schemaVersion", "must be a schema version"],
    [
      "an invalid document",
      serializeCourse(edit(minimalCourse(), "/kind", "book")),
      "/kind",
      "must be one of",
    ],
  ])("%s", (_name, text, path, message) => {
    expect(openCourse(text)).toEqual({
      status: "invalid",
      errors: [{ path, message: expect.stringContaining(message) }],
    });
  });
});
