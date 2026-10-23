import { describe, expect, test } from "vitest";
import { fullCourse, minimalCourse } from "../test/courses.js";
import type { JsonObject, Migration } from "./migrate.js";
import { MIGRATIONS, migrate, parseVersion, SCHEMA_VERSION } from "./migrate.js";
import { validateCourse } from "./validate.js";

// A test-only step from an imagined 0.9, where the course title was called `name`.
const renameName: Migration = {
  from: "0.9",
  to: "1.0",
  up: ({ name, ...rest }) => ({ ...rest, title: name }),
};
const addEntries: Migration = {
  from: "0.8",
  to: "0.9",
  up: (document) => ({ ...document, entries: [] }),
};

function version09(): JsonObject {
  const { title, ...rest } = fullCourse();
  return { ...rest, schemaVersion: "0.9", name: title };
}

describe("migrate", () => {
  test("version 1.0 is the baseline: no migrations, and a 1.0 document is unchanged", () => {
    expect(SCHEMA_VERSION).toBe("1.0");
    expect(MIGRATIONS).toEqual([]);
    const document = fullCourse() as unknown as JsonObject;
    expect(migrate(document)).toEqual({ ok: true, document });
  });

  test("applies a step and sets the version it writes", () => {
    const result = migrate(version09(), [renameName]);
    expect(result).toEqual({
      ok: true,
      document: expect.objectContaining({ schemaVersion: "1.0", title: "Workshop safety" }),
    });
    expect(result.ok && validateCourse(result.document)).toEqual([]);
  });

  test("chains steps in version order, whatever their order in the list", () => {
    const { entries: _entries, title, ...rest } = minimalCourse();
    const result = migrate({ ...rest, schemaVersion: "0.8", name: title }, [
      renameName,
      addEntries,
    ]);
    expect(result).toEqual({ ok: true, document: { ...minimalCourse(), schemaVersion: "1.0" } });
    expect(result.ok && validateCourse(result.document)).toEqual([]);
  });

  test("never changes its input, even when a step mutates what it is given", () => {
    const input = version09();
    const before = JSON.stringify(input);
    const mutating: Migration = {
      ...renameName,
      up: (document) => {
        document.title = document.name;
        delete document.name;
        return document;
      },
    };
    expect(migrate(input, [mutating]).ok).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("relabels an older MINOR of the same MAJOR without a step", () => {
    expect(migrate({ schemaVersion: "1.0", title: "t" }, [], "1.2")).toEqual({
      ok: true,
      document: { schemaVersion: "1.2", title: "t" },
    });
    const result = migrate(version09(), [renameName], "1.2");
    expect(result.ok && result.document.schemaVersion).toBe("1.2");
  });

  test("returns a document at or above the target as it is", () => {
    const newer = { schemaVersion: "1.4", future: true };
    expect(migrate(newer)).toEqual({ ok: true, document: newer });
  });

  test("reports a version with no migration path", () => {
    expect(migrate({ schemaVersion: "0.7" }, [renameName])).toEqual({
      ok: false,
      errors: [
        { path: "/schemaVersion", message: "cannot be migrated: no migration from 0.7 to 1.0" },
      ],
    });
  });

  test.each([undefined, 1, "1", "1.0.0", "01.0", "v1.0"])(
    "reports a schemaVersion of %j",
    (version) => {
      const result = migrate({ schemaVersion: version });
      expect(result).toEqual({
        ok: false,
        errors: [
          { path: "/schemaVersion", message: expect.stringContaining("must be a schema version") },
        ],
      });
    },
  );

  test.each([
    ["backwards", { from: "0.9", to: "0.8" }],
    ["past the target", { from: "0.9", to: "1.1" }],
    ["to an invalid version", { from: "0.9", to: "one" }],
  ])("refuses a step that goes %s", (_name, step) => {
    expect(() => migrate({ schemaVersion: "0.9" }, [{ ...step, up: (d) => d }])).toThrow(
      "does not move forward",
    );
  });
});

test("parseVersion", () => {
  expect(parseVersion("12.3")).toEqual([12, 3]);
  expect(parseVersion("1.0.0")).toBeUndefined();
});
