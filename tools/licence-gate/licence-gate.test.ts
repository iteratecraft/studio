// Proves that `pnpm check:licences` (M0-04) fails on each kind of licence problem. Every case runs
// against a fresh copy of this repository with one change, installed offline from the pnpm store.
// Fixture dependencies are local `file:` packages, so no network is needed.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const NOT_COPIED = new Set(["node_modules", ".git", ".turbo", "dist"]);
const TIMEOUT_MS = 120_000;

const copies: string[] = [];
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

function copyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "licence-gate-"));
  copies.push(dir);
  cpSync(repoRoot, dir, { recursive: true, filter: (src) => !NOT_COPIED.has(basename(src)) });
  return dir;
}

function editJson(file: string, edit: (json: Record<string, unknown>) => void): void {
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  edit(json);
  writeFileSync(file, JSON.stringify(json, null, 2));
}

/** Adds a local package with the given licence (none when undefined) as a dependency of `pkg`. */
function addDependency(dir: string, pkg: string, name: string, license?: string): void {
  const fixture = join(dir, "fixtures", name);
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ name, version: "1.0.0", license }));
  editJson(join(dir, pkg, "package.json"), (manifest) => {
    manifest.dependencies = { [name]: `file:../../fixtures/${name}` };
  });
}

function run(dir: string, args: string[]): { status: number | null; output: string } {
  // Same route as the gate: pnpm sets npm_execpath for the scripts it runs.
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error("Run the tests through pnpm (pnpm test)");
  const [command, prefix] = /\.[cm]?js$/.test(pnpm) ? [process.execPath, [pnpm]] : [pnpm, []];
  const result = spawnSync(command, [...prefix, ...args], { cwd: dir, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function gate(dir: string, ...args: string[]): { status: number | null; output: string } {
  const install = run(dir, ["install", "--offline", "--no-frozen-lockfile"]);
  expect(install.status, install.output).toBe(0);
  return run(dir, ["check:licences", ...args]);
}

function writeExceptions(dir: string, exceptions: unknown[]): void {
  writeFileSync(join(dir, "tools", "licence-gate", "exceptions.json"), JSON.stringify(exceptions));
}

describe("check:licences", () => {
  test("passes on the repository as it is", { timeout: TIMEOUT_MS }, () => {
    const result = gate(copyRepo());
    expect(result.output).toContain("no issues found");
    expect(result.status).toBe(0);
  });

  test.each([
    ["a GPL dependency in an app", "apps/web", "GPL-3.0-only", "GPL-3.0-only is not allowed"],
    ["an AGPL dependency in the server", "apps/server", "AGPL-3.0-or-later", "is not allowed"],
    ["an SSPL dependency", "packages/ui", "SSPL-1.0", "SSPL-1.0 is not allowed"],
    ["a BUSL dependency", "apps/desktop", "BUSL-1.1", "BUSL-1.1 is not allowed"],
    ["a CC-BY-NC dependency", "packages/exporters", "CC-BY-NC-4.0", "is not allowed"],
    [
      "an LGPL dependency in a course-shipped package",
      "packages/tracking",
      "LGPL-3.0-only",
      "not allowed in course-shipped packages",
    ],
    ["a dependency with no licence", "apps/web", undefined, "Unknown is not a reviewed licence"],
    [
      "a dependency with an unreviewed licence",
      "apps/web",
      "WTFPL",
      "WTFPL is not a reviewed licence",
    ],
    [
      "a GPL alternative joined by AND",
      "apps/web",
      "(MIT AND GPL-2.0-only)",
      "GPL-2.0-only is not allowed",
    ],
  ])("fails on %s", { timeout: TIMEOUT_MS }, (_name, pkg, license, message) => {
    const dir = copyRepo();
    addDependency(dir, pkg, "fixture-dep", license);
    const result = gate(dir);
    expect(result.output).toContain(message);
    expect(result.status).not.toBe(0);
  });

  test.each([
    ["an LGPL dependency in an app", "apps/desktop", "LGPL-2.1-or-later"],
    ["a permissive choice joined by OR", "packages/format", "(MIT OR GPL-3.0-only)"],
  ])("accepts %s", { timeout: TIMEOUT_MS }, (_name, pkg, license) => {
    const dir = copyRepo();
    addDependency(dir, pkg, "fixture-dep", license);
    expect(gate(dir, "--write").status).toBe(0);
  });

  test.each([
    ["the format package", "packages/format", "Apache-2.0", 'ADR-0001 requires "MIT"'],
    ["the UI package", "packages/ui", "MIT", 'ADR-0001 requires "Apache-2.0"'],
    ["an app", "apps/server", "GPL-3.0-only", 'ADR-0001 requires "Apache-2.0"'],
  ])("fails on a wrong licence for %s", { timeout: TIMEOUT_MS }, (_name, pkg, license, message) => {
    const dir = copyRepo();
    editJson(join(dir, pkg, "package.json"), (manifest) => {
      manifest.license = license;
    });
    const result = gate(dir);
    expect(result.output).toContain(`${pkg}: license is "${license}", ${message}`);
    expect(result.status).not.toBe(0);
  });

  test("fails when a course-shipped package has no LICENSE file", { timeout: TIMEOUT_MS }, () => {
    const dir = copyRepo();
    rmSync(join(dir, "packages", "tracking", "LICENSE"));
    const result = gate(dir);
    expect(result.output).toContain(
      "packages/tracking: a course-shipped package needs its own MIT",
    );
    expect(result.status).not.toBe(0);
  });

  describe("exceptions", () => {
    const exception = {
      name: "fixture-dep",
      licence: "GPL-3.0-only",
      inCourses: false,
      reason: "test",
    };

    test("a reviewed exception lets an app use the package", { timeout: TIMEOUT_MS }, () => {
      const dir = copyRepo();
      addDependency(dir, "apps/web", "fixture-dep", "GPL-3.0-only");
      writeExceptions(dir, [exception]);
      expect(gate(dir, "--write").status).toBe(0);
    });

    test("an app-only exception does not cover a course-shipped package", {
      timeout: TIMEOUT_MS,
    }, () => {
      const dir = copyRepo();
      addDependency(dir, "packages/tracking", "fixture-dep", "GPL-3.0-only");
      writeExceptions(dir, [exception]);
      const result = gate(dir, "--write");
      expect(result.output).toContain("fixture-dep (GPL-3.0-only), shipped in courses");
      expect(result.status).not.toBe(0);
    });

    test.each([
      ["an exception that is no longer needed", exception, "is no longer needed"],
      ["an exception without a reason", { ...exception, reason: " " }, "needs name, licence"],
    ])("fails on %s", { timeout: TIMEOUT_MS }, (_name, entry, message) => {
      const dir = copyRepo();
      writeExceptions(dir, [entry]);
      const result = gate(dir);
      expect(result.output).toContain(message);
      expect(result.status).not.toBe(0);
    });
  });

  test("lists dependencies and their NOTICE in THIRD_PARTY_NOTICES.md", {
    timeout: TIMEOUT_MS,
  }, () => {
    const dir = copyRepo();
    addDependency(dir, "packages/player-blocks", "fixture-dep", "Apache-2.0");
    writeFileSync(
      join(dir, "fixtures", "fixture-dep", "NOTICE"),
      "Fixture Dep\nCopyright 2026 Someone\n",
    );

    const stale = gate(dir);
    expect(stale.output).toContain("THIRD_PARTY_NOTICES.md is out of date");
    expect(stale.status).not.toBe(0);

    expect(gate(dir, "--write").status).toBe(0);
    const notices = readFileSync(join(dir, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain("| fixture-dep | 1.0.0 | Apache-2.0 | yes |");
    expect(notices).toContain(
      "### NOTICE of fixture-dep 1.0.0\n\n````text\nFixture Dep\nCopyright 2026 Someone\n````",
    );
    expect(gate(dir).status).toBe(0);
  });
});
