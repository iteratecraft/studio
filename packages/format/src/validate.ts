// Validator for the course schema (ADR-0002): the JSON Schema 2020-12 pass and the reference-integrity
// pass, both reporting JSON Pointer paths.
//
// It interprets only the keywords course.schema.json uses, and compileSchema() throws on any other
// keyword, so a schema change can never be silently ignored. It is our own rather than a library
// because this package ships inside every published course (MIT, no dependencies, no `eval` under a
// strict content security policy), and it needs two things libraries do not give: unknown
// properties tolerated for a newer MINOR, and the ids and references it saw for the integrity pass.
import courseSchemaJson from "./course.schema.json" with { type: "json" };
import { embedProvider, type Setting, VARIANTS } from "./variants.js";

/** One problem in a document. `path` is a JSON Pointer (RFC 6901) into it; "" is the root. */
export interface ValidationError {
  path: string;
  message: string;
}

export type Schema = { readonly [keyword: string]: unknown };

const KEYWORDS = new Set([
  "$schema",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "properties",
  "required",
  "propertyNames",
  "unevaluatedProperties",
  "oneOf",
]);
const TYPES: Record<string, string> = {
  object: "an object",
  array: "an array",
  string: "a string",
  integer: "an integer",
  number: "a number",
  boolean: "a boolean",
};

export interface CompiledSchema {
  root: Schema;
  defs: Record<string, Schema>;
  /** For each oneOf, the property whose `const` picks the branch, and each branch's const. */
  discriminators: Map<Schema, { key: string; consts: unknown[] }>;
  patterns: Map<string, RegExp>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const own = (object: object, key: string) => Object.hasOwn(object, key);
const pointer = (base: string, key: string | number) =>
  `${base}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;

/** Checks that a schema uses only the supported subset, and precomputes what validation needs. */
export function compileSchema(root: Schema): CompiledSchema {
  const defs = (root.$defs ?? {}) as Record<string, Schema>;
  const compiled: CompiledSchema = { root, defs, discriminators: new Map(), patterns: new Map() };
  const fail = (where: string, message: string): never => {
    throw new Error(`Unsupported schema at ${where || "/"}: ${message}`);
  };
  const resolve = (schema: Schema, where: string): Schema => {
    if (typeof schema.$ref !== "string") return schema;
    const name = /^#\/\$defs\/(.+)$/.exec(schema.$ref)?.[1];
    return name && own(defs, name) ? (defs[name] as Schema) : fail(where, `unresolved $ref`);
  };
  const walk = (schema: Schema, where: string): void => {
    if (!isObject(schema)) fail(where, "a schema must be an object");
    for (const keyword of Object.keys(schema)) {
      if (!KEYWORDS.has(keyword)) fail(where, `keyword "${keyword}"`);
    }
    if (schema.$ref !== undefined) resolve(schema, where);
    if (schema.type !== undefined && !own(TYPES, String(schema.type))) fail(where, "type");
    if (schema.unevaluatedProperties !== undefined && schema.unevaluatedProperties !== false) {
      fail(where, "unevaluatedProperties must be false");
    }
    if (typeof schema.pattern === "string") {
      compiled.patterns.set(schema.pattern, new RegExp(schema.pattern, "u"));
    }
    if (schema.propertyNames !== undefined) {
      const names = schema.propertyNames as Schema;
      if (Object.keys(names).join() !== "pattern")
        fail(where, "propertyNames takes only a pattern");
      walk(names, `${where}/propertyNames`);
    }
    for (const [key, sub] of Object.entries((schema.properties ?? {}) as Record<string, Schema>)) {
      walk(sub, `${where}/properties/${key}`);
    }
    if (schema.items !== undefined) walk(schema.items as Schema, `${where}/items`);
    if (Array.isArray(schema.oneOf)) {
      const branches = (schema.oneOf as Schema[]).map((branch, i) => {
        walk(branch, `${where}/oneOf/${i}`);
        return (resolve(branch, where).properties ?? {}) as Record<string, Schema>;
      });
      const key = Object.keys(branches[0] ?? {}).find((name) =>
        branches.every((props) => own(props, name) && own(props[name] as Schema, "const")),
      );
      if (!key) throw new Error(`Unsupported schema at ${where}: oneOf needs a const property`);
      const consts = branches.map((props) => (props[key] as Schema).const);
      if (new Set(consts).size < consts.length) fail(where, `oneOf repeats a "${key}" value`);
      compiled.discriminators.set(schema, { key, consts });
    }
  };
  walk(root, "");
  for (const [name, def] of Object.entries(defs)) walk(def, `/$defs/${name}`);
  return compiled;
}

/** A value that passed a recorded `$defs` entry, with the `$defs` entry of the object around it. */
export interface Found {
  def: string;
  owner: string | undefined;
  value: unknown;
  path: string;
}

export interface CheckOptions {
  /** Keep unknown properties instead of reporting them (a document from a newer MINOR). */
  allowUnknown?: boolean;
  /** `$defs` names whose valid values are returned in `found`. */
  record?: ReadonlySet<string>;
}

/** Validates a value against a compiled schema: the JSON Schema pass only. */
export function checkSchema(
  compiled: CompiledSchema,
  value: unknown,
  options: CheckOptions = {},
): { errors: ValidationError[]; found: Found[] } {
  const errors: ValidationError[] = [];
  const found: Found[] = [];
  const stack: string[] = [];
  const record = options.record ?? new Set<string>();
  const error = (path: string, message: string): void => {
    errors.push({ path, message });
  };

  const check = (schema: Schema, v: unknown, path: string): void => {
    if (typeof schema.$ref === "string") {
      const name = schema.$ref.slice("#/$defs/".length);
      const before = errors.length;
      stack.push(name);
      check(compiled.defs[name] as Schema, v, path);
      stack.pop();
      if (record.has(name) && errors.length === before) {
        found.push({ def: name, owner: stack.at(-1), value: v, path });
      }
    }
    const mismatch = valueMismatch(schema, v);
    if (mismatch) {
      error(path, mismatch);
      return;
    }
    if (typeof v === "string") checkString(schema, v, path);
    if (typeof v === "number") {
      if (typeof schema.minimum === "number" && v < schema.minimum) {
        error(path, `must be at least ${schema.minimum}`);
      }
      if (typeof schema.maximum === "number" && v > schema.maximum) {
        error(path, `must be at most ${schema.maximum}`);
      }
    }
    if (Array.isArray(v)) checkArray(schema, v, path);
    if (isObject(v)) checkObject(schema, v, path);
    if (Array.isArray(schema.oneOf)) checkOneOf(schema, v, path);
  };

  const checkString = (schema: Schema, v: string, path: string): void => {
    // JSON Schema counts code points, not UTF-16 units; count only where a length limit applies.
    const limited = schema.minLength !== undefined || schema.maxLength !== undefined;
    const length = limited ? [...v].length : 0;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      error(
        path,
        schema.minLength === 1
          ? "must not be empty"
          : `must be at least ${schema.minLength} characters`,
      );
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      error(path, `must be at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === "string" && !compiled.patterns.get(schema.pattern)?.test(v)) {
      error(path, `must match ${schema.pattern}`);
    }
  };

  const checkArray = (schema: Schema, v: unknown[], path: string) => {
    if (typeof schema.minItems === "number" && v.length < schema.minItems) {
      error(path, `must have at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && v.length > schema.maxItems) {
      error(path, `must have at most ${schema.maxItems} items`);
    }
    if (schema.items !== undefined) {
      v.forEach((item, i) => {
        check(schema.items as Schema, item, pointer(path, i));
      });
    }
    if (schema.uniqueItems === true) {
      // shortcut: compares by JSON text, exact for the string arrays the schema uses; switch to deep
      // equality if uniqueItems is ever put on an array of objects.
      const seen = new Map<string, number>();
      v.forEach((item, i) => {
        const key = JSON.stringify(item);
        const first = seen.get(key);
        if (first === undefined) seen.set(key, i);
        else error(pointer(path, i), `duplicates item ${first}`);
      });
    }
  };

  const checkObject = (schema: Schema, v: Record<string, unknown>, path: string) => {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const name of (schema.required ?? []) as string[]) {
      if (!own(v, name)) error(pointer(path, name), "is required");
    }
    for (const key of Object.keys(v)) {
      if (own(properties, key)) check(properties[key] as Schema, v[key], pointer(path, key));
      else if (schema.unevaluatedProperties === false && !options.allowUnknown) {
        error(pointer(path, key), "is not a known property");
      }
      const names = schema.propertyNames as Schema | undefined;
      if (names && !compiled.patterns.get(names.pattern as string)?.test(key)) {
        error(pointer(path, key), `property name must match ${names.pattern}`);
      }
    }
  };

  const checkOneOf = (schema: Schema, v: unknown, path: string): void => {
    const { key, consts } = compiled.discriminators.get(schema) as {
      key: string;
      consts: unknown[];
    };
    const index = isObject(v) ? consts.indexOf(v[key]) : -1;
    if (!isObject(v)) error(path, "must be an object");
    else if (!own(v, key)) error(pointer(path, key), "is required");
    else if (index < 0) {
      error(
        pointer(path, key),
        `must be one of ${consts.map((c) => JSON.stringify(c)).join(", ")}`,
      );
    } else check((schema.oneOf as Schema[])[index] as Schema, v, path);
  };

  check(compiled.root, value, "");
  return { errors, found };
}

/** Why a value fails the schema's type, const or enum, if it does. */
function valueMismatch(schema: Schema, value: unknown): string | undefined {
  const type = schema.type as string | undefined;
  if (type !== undefined && !hasType(value, type)) return `must be ${TYPES[type]}`;
  if (own(schema, "const") && value !== schema.const) {
    return `must be ${JSON.stringify(schema.const)}`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`;
  }
  return undefined;
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

/** The course schema (JSON Schema 2020-12). */
export const courseSchema: Schema = courseSchemaJson;
const compiledCourse = compileSchema(courseSchema);

/** Reference `$defs` and the `$defs` of the objects each may point at. */
const TARGETS: Record<string, readonly string[]> = {
  EntryRef: ["LessonEntry", "QuizEntry"],
  QuizRef: ["QuizEntry"],
  CategoryRef: ["CategoryItem"],
  CustomBlockRef: ["CustomBlockDocument"],
};
/** Choice questions and the number of correct answers each must have. */
const CORRECT_ANSWERS: Record<string, { ok: (count: number) => boolean; message: string }> = {
  SingleChoiceQuestion: {
    ok: (count) => count === 1,
    message: "must have exactly one correct answer",
  },
  MultipleResponseQuestion: { ok: (count) => count > 0, message: "must have a correct answer" },
};
const RECORD = new Set([
  "Id",
  "StorageKey",
  "MediaKeyRef",
  ...Object.keys(TARGETS),
  ...Object.keys(CORRECT_ANSWERS),
]);
const BLOCK = /^\/entries\/\d+\/blocks\/\d+\//;
const SKIP_AHEAD = /^\/entries\/\d+\/settings\/skipAhead\/entry$/;
const entryIndex = (path: string) => Number(/^\/entries\/(\d+)\//.exec(path)?.[1]);

export interface ValidateOptions {
  /** Keep unknown properties instead of reporting them (a document from a newer MINOR). */
  allowUnknown?: boolean;
}

/**
 * Validates a course document: the schema, then reference integrity (unique ids and storage keys,
 * every reference resolves to the right kind of object) and the number of correct answers of each
 * choice question. Ids and references inside `ext` and inside
 * unknown properties are not seen.
 */
export function validateCourse(
  document: unknown,
  options: ValidateOptions = {},
): ValidationError[] {
  const { errors, found } = checkSchema(compiledCourse, document, { ...options, record: RECORD });
  const ids = new Map<string, Found>();
  const keys = new Map<string, Found>();
  for (const item of found) {
    const declared = item.def === "Id" ? ids : item.def === "StorageKey" ? keys : undefined;
    if (!declared) continue;
    const first = declared.get(item.value as string);
    if (first) errors.push({ path: item.path, message: `duplicates the one at ${first.path}` });
    else declared.set(item.value as string, item);
  }
  for (const ref of found) {
    if (ref.def === "MediaKeyRef") {
      if (!keys.has(ref.value as string)) {
        errors.push({ path: ref.path, message: "is not in the media index" });
      }
      continue;
    }
    const allowed = TARGETS[ref.def];
    if (!allowed) continue;
    const target = ids.get(ref.value as string);
    if (!target) {
      errors.push({ path: ref.path, message: "does not refer to an object in this document" });
    } else if (!allowed.includes(target.owner ?? "")) {
      errors.push({
        path: ref.path,
        message: `must refer to a ${allowed.join(" or ")}, not the ${target.owner} at ${target.path}`,
      });
    } else if (
      ref.def === "CategoryRef" &&
      BLOCK.exec(ref.path)?.[0] !== BLOCK.exec(target.path)?.[0]
    ) {
      errors.push({ path: ref.path, message: `must refer to a category in the same block` });
    } else if (SKIP_AHEAD.test(ref.path) && entryIndex(target.path) <= entryIndex(ref.path)) {
      errors.push({ path: ref.path, message: "must refer to an entry after the quiz" });
    }
  }
  for (const { def, value, path } of found) {
    const rule = CORRECT_ANSWERS[def];
    const answers = (value as { answers?: { correct: boolean }[] }).answers ?? [];
    if (rule && !rule.ok(answers.filter((answer) => answer.correct).length)) {
      errors.push({ path: pointer(path, "answers"), message: rule.message });
    }
  }
  const reported = new Set(errors.map((error) => error.path));
  errors.push(...variantErrors(document, options.allowUnknown === true, reported));
  return errors;
}

const compiledTables = new Map<Record<string, Setting>, CompiledSchema>();
/** A setting table of variants.ts as a closed object schema, with the course's definitions. */
function compiledTable(table: Record<string, Setting>): CompiledSchema {
  let compiled = compiledTables.get(table);
  if (!compiled) {
    compiled = compileSchema({
      type: "object",
      properties: Object.fromEntries(Object.entries(table).map(([name, s]) => [name, s.schema])),
      unevaluatedProperties: false,
      $defs: courseSchema.$defs,
    });
    compiledTables.set(table, compiled);
  }
  return compiled;
}

/**
 * The blocks of the categories whose variants variants.ts defines: a known variant, its
 * `variantSettings` as its table allows, and content items only (except dividers, which hold none).
 */
function variantErrors(
  document: unknown,
  allowUnknown: boolean,
  reported: ReadonlySet<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const list = (value: unknown, key: string) =>
    isObject(value) && Array.isArray(value[key]) ? (value[key] as unknown[]) : [];
  list(document, "entries").forEach((entry, e) => {
    list(entry, "blocks").forEach((block, b) => {
      if (!isObject(block) || typeof block.category !== "string") return;
      const variants = VARIANTS[block.category];
      if (!variants) return;
      const path = `/entries/${e}/blocks/${b}`;
      const table = variants[String(block.variant)];
      if (!table) {
        if (!allowUnknown && !reported.has(`${path}/variant`)) {
          errors.push({ path: `${path}/variant`, message: `is not a ${block.category} variant` });
        }
        return;
      }
      const settings = block.variantSettings ?? {};
      if (isObject(settings) && !reported.has(`${path}/variantSettings`)) {
        const found = checkSchema(compiledTable(table), settings, { allowUnknown }).errors;
        for (const error of found) {
          const at = `${path}/variantSettings${error.path}`;
          if (!reported.has(at)) errors.push({ ...error, path: at });
        }
        // D-44: the address an embed frames is a player of its provider.
        const { embedUrl, provider } = settings;
        if (
          block.category === "multimedia" &&
          block.variant === "embed" &&
          typeof embedUrl === "string" &&
          !found.some((error) => ["/embedUrl", "/provider"].includes(error.path)) &&
          !embedProvider(embedUrl, provider as string | undefined)
        ) {
          errors.push({
            path: `${path}/variantSettings/embedUrl`,
            message: `is not a player address of ${provider ?? "a listed provider"}`,
          });
        }
      }
      if (block.category === "divider") return;
      list(block, "items").forEach((item, i) => {
        if (isObject(item) && item.kind !== "content") {
          errors.push({ path: `${path}/items/${i}/kind`, message: 'must be "content"' });
        }
      });
    });
  });
  return errors;
}
