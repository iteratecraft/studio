// Schema versions and the forward-only migration runner (ADR-0002, "Versions and migrations").
import type { Schema, ValidationError } from "./validate.js";
import { courseSchema } from "./validate.js";

/** The schema version this package reads and writes. */
export const SCHEMA_VERSION = "1.0";

const versionSchema = (courseSchema.$defs as Record<string, Schema>).SchemaVersion as Schema;
const VERSION = new RegExp(versionSchema.pattern as string, "u");

/** [MAJOR, MINOR] of a schema version, or undefined if it is not one. */
export function parseVersion(version: unknown): [number, number] | undefined {
  if (typeof version !== "string" || !VERSION.test(version)) return undefined;
  const [major, minor] = version.split(".").map(Number);
  return [major as number, minor as number];
}

/** Negative, zero or positive as `a` is older than, equal to or newer than `b`. */
export function compareVersions(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

export type JsonObject = Record<string, unknown>;

/** One forward step between two schema versions. */
export interface Migration {
  from: string;
  to: string;
  /** Pure: returns the document in the `to` shape. It gets its own copy, and need not set
   * `schemaVersion`. */
  up(document: JsonObject): JsonObject;
}

/** Version 1 is the baseline: there is nothing older to migrate from. */
export const MIGRATIONS: readonly Migration[] = [];

export type MigrateResult =
  | { ok: true; document: JsonObject }
  | { ok: false; errors: ValidationError[] };

/**
 * Brings a document up to `target` by applying `migrations` in order. MINOR versions only add
 * optional fields, so a document with no step from its exact version takes the step that leaves its
 * MAJOR, whichever MINOR that step was written from; within the target's MAJOR it is relabelled.
 * A document at or above `target` is returned as it is. The input is never changed.
 */
export function migrate(
  document: JsonObject,
  migrations: readonly Migration[] = MIGRATIONS,
  target = SCHEMA_VERSION,
): MigrateResult {
  const goal = parseVersion(target);
  let version = parseVersion(document.schemaVersion);
  if (!goal) throw new Error(`Invalid target schema version ${target}`);
  if (!version) {
    return fail(
      `must be a schema version (MAJOR.MINOR), not ${JSON.stringify(document.schemaVersion)}`,
    );
  }
  let current = document;
  while (compareVersions(version, goal) < 0) {
    const label = version.join(".");
    const [major] = version;
    const exact = migrations.find((m) => m.from === label);
    if (!exact && major === goal[0]) {
      return { ok: true, document: { ...current, schemaVersion: target } };
    }
    const step =
      exact ??
      migrations.find(
        (m) => parseVersion(m.from)?.[0] === major && (parseVersion(m.to)?.[0] ?? major) > major,
      );
    if (!step) return fail(`cannot be migrated: no migration from ${label} to ${target}`);
    const next = parseVersion(step.to);
    if (!next || compareVersions(next, version) <= 0 || compareVersions(next, goal) > 0) {
      throw new Error(`Migration ${step.from} -> ${step.to} does not move forward to ${target}`);
    }
    current = { ...step.up(copyJson(current)), schemaVersion: step.to };
    version = next;
  }
  return { ok: true, document: current };
}

const fail = (message: string): MigrateResult => ({
  ok: false,
  errors: [{ path: "/schemaVersion", message }],
});

// The document came from JSON, so a JSON round trip is a full copy.
const copyJson = (value: JsonObject): JsonObject => JSON.parse(JSON.stringify(value));
