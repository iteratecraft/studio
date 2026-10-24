// Proves that `pnpm check:deps` (turbo boundaries plus the tag rules in turbo.json) rejects each
// forbidden import. Every case runs against a fresh copy of this repository with one violation added.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const turboBin = createRequire(import.meta.url).resolve("turbo");
const LAYER_TAGS = ["format", "engine", "ui", "app"];
// test-courses: the fixtures checkout (M1-28), which these checks never read.
const NOT_COPIED = new Set(["node_modules", ".git", ".turbo", "dist", "test-courses"]);
const TIMEOUT_MS = 60_000;

const copies: string[] = [];
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

function copyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "check-deps-"));
  copies.push(dir);
  cpSync(repoRoot, dir, { recursive: true, filter: (src) => !NOT_COPIED.has(basename(src)) });
  return dir;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function addDependency(dir: string, pkg: string, dependency: string): void {
  const file = join(dir, pkg, "package.json");
  const manifest = readJson(file);
  manifest.dependencies = { [dependency]: "workspace:*" };
  writeFileSync(file, JSON.stringify(manifest, null, 2));
}

function checkDeps(dir: string): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [turboBin, "boundaries"], { cwd: dir, encoding: "utf8" });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const layeredPackages = ["packages", "apps"].flatMap((group) =>
  readdirSync(join(repoRoot, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${group}/${entry.name}`),
);

describe("check:deps", () => {
  test("passes on the repository as it is", { timeout: TIMEOUT_MS }, () => {
    const result = checkDeps(copyRepo());
    expect(result.output).toContain("no issues found");
    expect(result.status).toBe(0);
  });

  test.each([
    ["the format importing a higher layer", "packages/format", "@course-suite/ui"],
    ["an MIT package importing an Apache-2.0 one", "packages/tracking", "@course-suite/exporters"],
    ["an app importing another app", "apps/web", "@course-suite/desktop"],
    ["the UI importing an app", "packages/ui", "@course-suite/web"],
  ])("fails on %s", { timeout: TIMEOUT_MS }, (_name, pkg, dependency) => {
    const dir = copyRepo();
    addDependency(dir, pkg, dependency);
    writeFileSync(join(dir, pkg, "src", "violation.ts"), `export * from "${dependency}";\n`);
    const result = checkDeps(dir);
    expect(result.output).toContain(`Package \`${dependency}\` found without any tag listed`);
    expect(result.status).not.toBe(0);
  });

  // ADR-0001: the package reader and test LMS are test-only, so nothing the apps ship may pull them
  // in, directly or through an engine package. Each package in the chain imports the next one.
  test.each([
    ["the UI importing it", ["packages/ui"]],
    ["an app importing it", ["apps/web"]],
    ["the UI importing an engine package that imports it", ["packages/ui", "packages/exporters"]],
  ])("fails on the test-only conformance package: %s", { timeout: TIMEOUT_MS }, (_name, chain) => {
    const dir = copyRepo();
    const imports = [...chain.slice(1), "packages/conformance"].map(
      (pkg) => `@course-suite/${basename(pkg)}`,
    );
    chain.forEach((pkg, i) => {
      const dependency = imports[i] as string;
      addDependency(dir, pkg, dependency);
      writeFileSync(join(dir, pkg, "src", "violation.ts"), `export * from "${dependency}";\n`);
    });
    const result = checkDeps(dir);
    expect(result.output).toContain("found with tag listed in denylist");
    expect(result.status).not.toBe(0);
  });

  test("fails on a relative import into another package", { timeout: TIMEOUT_MS }, () => {
    const dir = copyRepo();
    const source = `export * from "../../format/src/index.js";\n`;
    writeFileSync(join(dir, "packages", "ui", "src", "violation.ts"), source);
    const result = checkDeps(dir);
    expect(result.output).toContain("leaves the package");
    expect(result.status).not.toBe(0);
  });

  // turbo applies no rule to an untagged package, so a missing tag would silently skip the check.
  test.each(layeredPackages)("%s has one layer tag, and the mit tag iff it is MIT", (pkg) => {
    const tags = readJson(join(repoRoot, pkg, "turbo.json")).tags as string[];
    const license = readJson(join(repoRoot, pkg, "package.json")).license;
    expect(tags.filter((tag) => LAYER_TAGS.includes(tag))).toHaveLength(1);
    expect(tags.includes("mit")).toBe(license === "MIT");
  });
});
