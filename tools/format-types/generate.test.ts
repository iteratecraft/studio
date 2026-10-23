import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { generateTypes, readSchema, TYPES_FILE } from "./generate.ts";

test("the committed course types match the schema (run pnpm format:types)", () => {
  expect(readFileSync(TYPES_FILE, "utf8")).toBe(generateTypes(readSchema()));
});

test("maps each schema form to its TypeScript type", () => {
  const source = generateTypes({
    title: "Root",
    description: "The root.",
    type: "object",
    properties: {
      a: { $ref: "#/$defs/Name" },
      b: { type: "array", items: { enum: ["x", "y"] } },
      c: { type: "object", propertyNames: { pattern: "^[a-z]+$" } },
    },
    required: ["a"],
    $defs: {
      Name: { type: "string" },
      Pick: { oneOf: [{ $ref: "#/$defs/Name" }, { const: 1 }] },
      Flag: { type: "boolean" },
      Count: { type: "integer" },
    },
  });
  expect(source).toContain("/** The root. */\nexport interface Root {");
  expect(source).toContain("  a: Name;");
  expect(source).toContain('  b?: ("x" | "y")[];');
  expect(source).toContain("  c?: Record<string, unknown>;");
  expect(source).toContain("export type Name = string;");
  expect(source).toContain("export type Pick = Name | 1;");
  expect(source).toContain("export type Flag = boolean;");
  expect(source).toContain("export type Count = number;");
});

test("refuses a schema form it cannot type", () => {
  expect(() => generateTypes({ title: "Root", type: "null" })).toThrow(/No TypeScript type/);
});
