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

  test.each([
    ["an older MINOR than the step's", "1.0", "1.1"],
    ["a newer MINOR than the step's", "1.1", "1.0"],
  ])("takes the step that leaves the MAJOR from %s", (_name, version, from) => {
    const toTwo: Migration = { from, to: "2.0", up: (d) => ({ ...d, moved: true }) };
    expect(migrate({ schemaVersion: version, title: "t" }, [toTwo], "2.1")).toEqual({
      ok: true,
      document: { schemaVersion: "2.1", title: "t", moved: true },
    });
  });

  test("prefers the step from the document's exact version", () => {
    const steps: Migration[] = [
      { from: "1.0", to: "2.0", up: (d) => ({ ...d, via: "1.0" }) },
      { from: "1.1", to: "2.0", up: (d) => ({ ...d, via: "1.1" }) },
    ];
    const result = migrate({ schemaVersion: "1.1" }, steps, "2.0");
    expect(result.ok && result.document.via).toBe("1.1");
  });

  test("relabels within the target's MAJOR rather than take a step past it", () => {
    const toTwo: Migration = { from: "1.1", to: "2.0", up: (d) => d };
    expect(migrate({ schemaVersion: "1.0" }, [toTwo], "1.2")).toEqual({
      ok: true,
      document: { schemaVersion: "1.2" },
    });
  });

  test("returns a document at or above the target as it is", () => {
    const newer = { schemaVersion: "1.4", future: true };
    expect(migrate(newer)).toEqual({ ok: true, document: newer });
  });

  test("reports a MAJOR with no step out of it", () => {
    const toThree: Migration = { from: "2.0", to: "3.0", up: (d) => d };
    expect(migrate({ schemaVersion: "1.3" }, [toThree], "3.0")).toEqual({
      ok: false,
      errors: [
        { path: "/schemaVersion", message: "cannot be migrated: no migration from 1.3 to 3.0" },
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
