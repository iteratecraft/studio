// JSON Schemas (2020-12) of the commands, for AI tool calls and for checking every command before it
// runs. They are built from the format's course.schema.json, the same source as the format's
// TypeScript types, so a schema change reaches the commands without a second copy. Each schema
// carries only the format definitions it refers to.
import type { CompiledSchema, Schema } from "@course-suite/format";
import { compileSchema, courseSchema } from "@course-suite/format";
import type { CommandType } from "./commands.js";
import { COLLECTIONS, COMMAND_TYPES, LOCKED } from "./commands.js";

const defs = courseSchema.$defs as Record<string, Schema>;
const ID: Schema = { $ref: "#/$defs/Id" };
const INDEX = (description: string): Schema => ({ type: "integer", minimum: 0, description });

/** The schema of every command, by command type. */
export function commandSchemas(): Readonly<Record<CommandType, Schema>> {
  // Built on first use: the command table and this module import each other.
  schemas ??= Object.fromEntries(
    [...COMMAND_TYPES.keys()].map((type) => [type, build(type)]),
  ) as Record<CommandType, Schema>;
  return schemas;
}
let schemas: Record<CommandType, Schema> | undefined;

const compiled = new Map<CommandType, CompiledSchema>();
/** A command's schema, compiled by the format's validator. */
export function compiledCommandSchema(type: CommandType): CompiledSchema {
  let schema = compiled.get(type);
  if (!schema) {
    schema = compileSchema(commandSchemas()[type]);
    compiled.set(type, schema);
  }
  return schema;
}

function build(type: CommandType): Schema {
  const { verb, kind } = COMMAND_TYPES.get(type) as NonNullable<
    ReturnType<typeof COMMAND_TYPES.get>
  >;
  if (kind === "course") {
    return command(
      type,
      "Sets or removes course settings: title, description, authors, cover, theme, label set, languages, publish and navigation settings. The outline and the media index have their own commands.",
      fields([courseSchema], LOCKED.course),
    );
  }
  const { def, noun, parent } = COLLECTIONS[kind];
  const into = parent ? { parent: { ...ID, description: `Id of the ${parent.noun}.` } } : {};
  const optionalInto = parent
    ? { parent: { ...ID, description: `Id of another ${parent.noun} to put it in.` } }
    : {};
  const id = { id: { ...ID, description: `Id of the ${noun}.` } };
  switch (verb) {
    case "insert":
      return command(
        type,
        `Inserts a ${noun}${parent ? ` into a ${parent.noun}` : ""}. Every id in the value must be new in the document.`,
        {
          ...into,
          index: INDEX("Position in the list. Default: the end."),
          value: { $ref: `#/$defs/${def}` },
        },
        [...Object.keys(into), "value"],
      );
    case "update":
      return command(
        type,
        `Sets or removes fields of a ${noun}. Its id and kind are fixed, and lists inside it have their own commands.`,
        { ...id, ...fields(branches(def), LOCKED[kind]) },
        ["id"],
      );
    case "move":
      return command(
        type,
        `Moves a ${noun} to another position${parent ? `, in the same or another ${parent.noun}` : ""}.`,
        { ...id, ...optionalInto, index: INDEX("Position after the move.") },
        ["id", "index"],
      );
    case "duplicate":
      return command(
        type,
        `Copies a ${noun} with new ids. The copy lands directly below the original${parent ? `, or at the end of another ${parent.noun}` : ""}, unless an index is given.`,
        { ...id, ...optionalInto, index: INDEX("Position of the copy.") },
        ["id"],
      );
    case "delete":
      return command(
        type,
        kind === "entry"
          ? "Deletes an outline entry and everything in it. Buttons that go to it are removed, a quiz's skip-ahead to it is turned off, and course tracking by it falls back to the completion rule."
          : `Deletes a ${noun} and everything in it.`,
        id,
        ["id"],
      );
  }
}

function command(
  type: string,
  description: string,
  properties: Record<string, Schema>,
  required: string[] = [],
): Schema {
  const body: Schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: type,
    description,
    type: "object",
    properties: { type: { const: type }, ...properties },
    required: ["type", ...required],
    unevaluatedProperties: false,
  };
  return withDefs(body);
}

/** The objects a definition can be: each branch of a oneOf, or the definition itself. */
function branches(def: string): Schema[] {
  const schema = defs[def] as Schema;
  if (!Array.isArray(schema.oneOf)) return [schema];
  return (schema.oneOf as Schema[]).map((branch) => defs[String(branch.$ref).slice(8)] as Schema);
}

/** `set` and `unset` for objects of these shapes: every field except the locked ones. A field the
 * shapes define differently is accepted here and checked against the object's own shape when the
 * command runs. */
function fields(shapes: Schema[], locked: readonly string[]): Record<string, Schema> {
  const properties = new Map<string, Schema | undefined>();
  const optional = new Set<string>();
  for (const shape of shapes) {
    const required = new Set((shape.required ?? []) as string[]);
    for (const [name, schema] of Object.entries(
      (shape.properties ?? {}) as Record<string, Schema>,
    )) {
      if (locked.includes(name)) continue;
      if (!required.has(name)) optional.add(name);
      const seen = properties.has(name) ? properties.get(name) : schema;
      properties.set(name, JSON.stringify(seen) === JSON.stringify(schema) ? schema : undefined);
    }
  }
  return {
    set: {
      description: "Fields to set, with their new values.",
      type: "object",
      properties: Object.fromEntries(
        [...properties].map(([name, schema]) => [
          name,
          schema ?? { description: "Checked against the shape of the object being updated." },
        ]),
      ),
      unevaluatedProperties: false,
    },
    unset: {
      description: "Optional fields to remove.",
      type: "array",
      items: { enum: [...optional] },
      uniqueItems: true,
    },
  };
}

/** The schema with the format definitions it refers to, directly or through other definitions. */
function withDefs(schema: Schema): Schema {
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") {
          const name = value.slice("#/$defs/".length);
          if (!names.has(name)) {
            names.add(name);
            visit(defs[name]);
          }
        } else visit(value);
      }
    }
  };
  visit(schema);
  return { ...schema, $defs: Object.fromEntries([...names].sort().map((n) => [n, defs[n]])) };
}
