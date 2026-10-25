import type { Schema } from "@course-suite/format";
import { checkSchema, compileSchema } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import type { Command, CommandType } from "./commands.js";
import { COMMAND_TYPES } from "./commands.js";
import { commandSchemas } from "./schemas.js";

const schemas = commandSchemas();
const check = (command: object) =>
  checkSchema(compileSchema(schemas[(command as Command).type]), command).errors;

/** Every object schema inside a schema, with its JSON Pointer. */
function* subschemas(node: unknown, path = ""): Generator<[string, Schema]> {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) yield* subschemas(item, `${path}/${i}`);
  } else if (node && typeof node === "object") {
    yield [path, node as Schema];
    for (const [key, value] of Object.entries(node)) {
      if (key !== "const" && key !== "enum") yield* subschemas(value, `${path}/${key}`);
    }
  }
}

describe("command schemas", () => {
  test("there is one per command: update the course, and insert, update, move, duplicate and delete each kind", () => {
    expect(Object.keys(schemas)).toEqual([...COMMAND_TYPES.keys()]);
    expect(Object.keys(schemas)).toHaveLength(34);
    expect(Object.keys(schemas)).not.toContain("moveMedia");
    expect(Object.keys(schemas)).toContain("duplicateAnswer");
  });

  test.each(Object.entries(schemas))(
    "%s is a JSON Schema 2020-12 the validator accepts",
    (type, schema) => {
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema).toMatchObject({ title: type, type: "object", unevaluatedProperties: false });
      expect(schema.required).toContain("type");
      expect(typeof schema.description).toBe("string");
      // compileSchema throws on an unsupported keyword or an unresolved $ref.
      expect(() => compileSchema(schema)).not.toThrow();
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
      for (const [path, sub] of subschemas(schema)) {
        const properties = (sub.properties ?? {}) as Record<string, unknown>;
        for (const name of (sub.required ?? []) as string[]) {
          expect(Object.hasOwn(properties, name), `${path}/required/${name}`).toBe(true);
        }
      }
      const defs = Object.keys((schema.$defs ?? {}) as object);
      for (const name of defs) expect(JSON.stringify(schema)).toContain(`"#/$defs/${name}"`);
    },
  );

  test("carry only the format definitions they use", () => {
    expect(Object.keys(schemas.deleteBlock.$defs as object)).toEqual(["Id"]);
    expect(Object.keys(schemas.insertBlock.$defs as object)).toContain("Block");
    expect(Object.keys(schemas.insertBlock.$defs as object)).not.toContain("QuizSettings");
  });

  test("update leaves out fixed fields and child lists, and unsets only optional fields", () => {
    const set = (type: CommandType) =>
      Object.keys((schemas[type].properties as { set: { properties: object } }).set.properties);
    const unset = (type: CommandType) =>
      (schemas[type].properties as { unset: { items: { enum: string[] } } }).unset.items.enum;
    expect(set("updateEntry")).not.toContain("blocks");
    expect(set("updateEntry")).toEqual(
      expect.arrayContaining(["title", "settings", "headerImage"]),
    );
    expect(set("updateBlock")).not.toContain("category");
    expect(set("updateCourse")).not.toContain("entries");
    expect(set("updateCourse")).toContain("labelSet");
    expect(unset("updateEntry")).not.toContain("title");
    expect(unset("updateItem")).toContain("title");
    expect(unset("updateMedia")).not.toContain("source");
  });

  test("accept valid commands and reject wrong ones", () => {
    expect(check({ type: "moveBlock", id: "block00001", parent: "lesson0001", index: 0 })).toEqual(
      [],
    );
    expect(check({ type: "updateCourse", set: { title: "New" }, unset: ["cover"] })).toEqual([]);
    expect(check({ type: "moveBlock", id: "block00001", index: -1 })).toEqual([
      { path: "/index", message: "must be at least 0" },
    ]);
    expect(check({ type: "moveEntry", id: "lesson0001", parent: "lesson0002", index: 0 })).toEqual([
      { path: "/parent", message: "is not a known property" },
    ]);
    expect(check({ type: "updateCourse", unset: ["title"] })[0]?.path).toBe("/unset/0");
    expect(check({ type: "deleteBlock", id: "Block 1" })[0]?.path).toBe("/id");
    expect(
      check({ type: "insertAnswer", parent: "question01", value: { id: "a", text: "x" } }),
    ).toEqual([
      { path: "/value/correct", message: "is required" },
      { path: "/value/id", message: "must match ^[a-z][a-z0-9]{9}$" },
    ]);
  });
});
