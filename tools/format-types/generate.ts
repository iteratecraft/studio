// Generates packages/format/src/course.ts, the TypeScript types of the course schema (ADR-0002: the
// types are generated from the schema). `pnpm format:types` writes the file; its test fails when the
// committed file is stale. It knows the same keyword subset as the format package's validator.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isEntryPoint } from "../clean-room-guard/guard.ts";

type Schema = { [keyword: string]: unknown };

const formatSrc = join(import.meta.dirname, "..", "..", "packages", "format", "src");
export const SCHEMA_FILE = join(formatSrc, "course.schema.json");
export const TYPES_FILE = join(formatSrc, "course.ts");

export function generateTypes(schema: Schema): string {
  const out = ["// Generated from course.schema.json by `pnpm format:types`. Do not edit.", ""];
  const declare = (name: string, s: Schema) => {
    out.push(...doc(s, ""));
    out.push(
      s.type === "object" && s.properties
        ? `export interface ${name} ${objectType(s, "")}`
        : `export type ${name} = ${typeOf(s, "")};`,
      "",
    );
  };
  declare(String(schema.title), schema);
  for (const [name, def] of Object.entries((schema.$defs ?? {}) as Record<string, Schema>)) {
    declare(name, def);
  }
  return format(out.join("\n"));
}

function typeOf(s: Schema, indent: string): string {
  if (typeof s.$ref === "string") return s.$ref.slice("#/$defs/".length);
  if ("const" in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(s.oneOf)) return s.oneOf.map((b: Schema) => typeOf(b, indent)).join(" | ");
  switch (s.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array": {
      const item = typeOf(s.items as Schema, indent);
      return /^\w+$/.test(item) ? `${item}[]` : `(${item})[]`;
    }
    case "object":
      return s.properties ? objectType(s, indent) : "Record<string, unknown>";
  }
  throw new Error(`No TypeScript type for ${JSON.stringify(s)}`);
}

function objectType(s: Schema, indent: string): string {
  const inner = `${indent}  `;
  const required = new Set((s.required ?? []) as string[]);
  const lines = ["{"];
  for (const [key, prop] of Object.entries(s.properties as Record<string, Schema>)) {
    lines.push(...doc(prop, inner));
    lines.push(`${inner}${key}${required.has(key) ? "" : "?"}: ${typeOf(prop, inner)};`);
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

const doc = (s: Schema, indent: string) =>
  typeof s.description === "string"
    ? [`${indent}/** ${s.description.replaceAll("*/", "*\\/")} */`]
    : [];

/** Formats with the repository's Biome settings, so the generated file passes `pnpm lint`. */
function format(source: string): string {
  const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");
  const run = spawnSync(process.execPath, [biome, "format", `--stdin-file-path=${TYPES_FILE}`], {
    input: source,
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`biome format failed:\n${run.stderr}`);
  return run.stdout;
}

export const readSchema = (): Schema => JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));

if (isEntryPoint(import.meta)) {
  writeFileSync(TYPES_FILE, generateTypes(readSchema()));
  console.log(`Wrote ${TYPES_FILE}.`);
}
