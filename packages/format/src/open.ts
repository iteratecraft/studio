// Opening and saving a course document (ADR-0002, "Versions and migrations").
import type { Course } from "./course.js";
import type { JsonObject } from "./migrate.js";
import { compareVersions, migrate, parseVersion, SCHEMA_VERSION } from "./migrate.js";
import type { ValidationError } from "./validate.js";
import { validateCourse } from "./validate.js";

export type OpenResult =
  /** Valid; read-write. `migratedFrom` is set when the document was brought up from an older version. */
  | { status: "ok"; document: Course; migratedFrom?: string }
  /** Written by a newer MAJOR: show it read-only, say which version wrote it, offer an update. Never
   * save, autosave, publish or sync it. */
  | { status: "read-only"; writtenBy: string; document: JsonObject }
  | { status: "invalid"; errors: ValidationError[] };

/**
 * Parses, migrates and validates a course document. A document from a newer MINOR of our MAJOR opens
 * read-write and keeps the properties this version does not know, and its `schemaVersion`.
 */
export function openCourse(text: string): OpenResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return invalid("", `is not JSON: ${(error as Error).message}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("", "must be an object");
  }
  const document = value as JsonObject;
  const version = parseVersion(document.schemaVersion);
  const ours = parseVersion(SCHEMA_VERSION) as [number, number];
  if (version && version[0] > ours[0]) {
    return { status: "read-only", writtenBy: String(document.schemaVersion), document };
  }
  const migrated = migrate(document);
  if (!migrated.ok) return { status: "invalid", errors: migrated.errors };
  const newerMinor = version !== undefined && compareVersions(version, ours) > 0;
  const errors = validateCourse(migrated.document, { allowUnknown: newerMinor });
  if (errors.length > 0) return { status: "invalid", errors };
  const course = migrated.document as unknown as Course;
  return course.schemaVersion === document.schemaVersion
    ? { status: "ok", document: course }
    : { status: "ok", document: course, migratedFrom: String(document.schemaVersion) };
}

/** The one serialisation every app writes, so parse then serialise is byte-identical. */
export function serializeCourse(course: Course): string {
  return `${JSON.stringify(course, null, 2)}\n`;
}

const invalid = (path: string, message: string): OpenResult => ({
  status: "invalid",
  errors: [{ path, message }],
});
