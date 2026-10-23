// Proves each clean-room rule fails on its sample violations from the config, that the allow-list
// works, and that the repository as it is passes. Fixtures are written to a temp dir so no tracked
// file carries a violation.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { CONFIG_PATH, checkFiles, isEntryPoint, loadConfig } from "./guard.ts";

const repoRoot = join(import.meta.dirname, "..", "..");
const config = loadConfig(repoRoot);
const rule = (id: string) => config.rules.find((r) => r.id === id);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

/** Writes the files to a fresh temp dir and returns the guard's findings for them. */
function check(files: Record<string, string | Buffer>) {
  const dir = mkdtempSync(join(tmpdir(), "clean-room-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return checkFiles(dir, Object.keys(files), config);
}

const contentCases = config.rules.flatMap((r) => (r.examples.content ?? []).map((e) => [r.id, e]));
const pathCases = config.rules.flatMap((r) => (r.examples.path ?? []).map((e) => [r.id, e]));

describe("check:clean-room", () => {
  test("passes on the repository as it is", { timeout: 30_000 }, () => {
    const guard = join(import.meta.dirname, "guard.ts");
    // Early Node 24 releases warn that type stripping is experimental; that is not a finding.
    const args = ["--disable-warning=ExperimentalWarning", guard];
    const run = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("no findings");
    expect(run.status).toBe(0);
  });

  test.each(config.rules)("rule $id has sample violations for what it scans", (r) => {
    if (r.scan !== "path") expect(r.examples.content?.length).toBeGreaterThan(0);
    if (r.scan !== "content") expect(r.examples.path?.length).toBeGreaterThan(0);
  });

  test.each(contentCases)("%s fails on the line %s", (id, example) => {
    const findings = check({ "packages/demo/src/index.ts": `export {};\n${example}\n` });
    expect(findings).toContainEqual(expect.objectContaining({ rule: id, line: 2 }));
  });

  test.each(pathCases)("%s fails on the file %s", (id, path) => {
    expect(check({ [path]: "export {};\n" })).toContainEqual(
      expect.objectContaining({ rule: id, path, line: 0 }),
    );
  });

  test("allows trademarks in docs and Markdown, but not in code next to them", () => {
    const line = rule("vendor-trademark")?.examples.content?.[0] ?? "";
    const findings = check({ "docs/compat.txt": line, "README.md": line, "src/a.ts": line });
    expect(findings.map((f) => f.path)).toEqual(["src/a.ts"]);
  });

  test("allows spec rule tags in test titles", () => {
    const spec = rule("vendor-trademark")?.examples.path?.[0]?.split(/[/-]/)[1] ?? "";
    expect(check({ "a.test.ts": `test("[${spec}:R5] resumes", () => {});` })).toEqual([]);
    expect(check({ "a.test.ts": `test("${spec} resumes", () => {});` })).toHaveLength(1);
  });

  test("skips the content of binary files but still checks their paths", () => {
    const line = rule("vendor-trademark")?.examples.content?.[0] ?? "";
    expect(check({ "a.bin": Buffer.concat([Buffer.from([0]), Buffer.from(line)]) })).toEqual([]);
    const bundle = rule("vendor-player-bundle")?.examples.path?.[0] ?? "";
    expect(check({ [bundle]: Buffer.from([0, 1, 2]) })).toHaveLength(1);
  });

  test("scans UTF-16 text files that start with a byte-order mark", () => {
    const line = rule("vendor-trademark")?.examples.content?.[0] ?? "";
    const le = Buffer.from(
      `﻿export {};
${line}
`,
      "utf16le",
    );
    const be = Buffer.from(le).swap16();
    expect(check({ "le.ts": le, "be.ts": be })).toEqual([
      expect.objectContaining({ path: "le.ts", line: 2, rule: "vendor-trademark" }),
      expect.objectContaining({ path: "be.ts", line: 2, rule: "vendor-trademark" }),
    ]);
  });

  test("does not flag the word research outside a path", () => {
    const prose = 'const label = "Research notes"; // researchers read the `research` repository';
    expect(check({ "a.ts": prose })).toEqual([]);
  });

  test("never flags its own config, which must name what it forbids", () => {
    const line = rule("vendor-trademark")?.examples.content?.[0] ?? "";
    expect(check({ [CONFIG_PATH]: line })).toEqual([]);
  });

  test("refuses a rule that would silently check nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "clean-room-"));
    dirs.push(dir);
    const broken = { ...config, rules: [{ ...config.rules[0], scan: "contents" }] };
    mkdirSync(dirname(join(dir, CONFIG_PATH)), { recursive: true });
    writeFileSync(join(dir, CONFIG_PATH), JSON.stringify(broken));
    expect(() => loadConfig(dir)).toThrow("scan must be one of");
  });
});

describe("isEntryPoint", () => {
  const self = join(import.meta.dirname, "guard.ts");
  const url = pathToFileURL(self).href;

  test("trusts import.meta.main where Node provides it", () => {
    expect(isEntryPoint({ main: true, url }, "elsewhere.ts")).toBe(true);
    expect(isEntryPoint({ main: false, url }, self)).toBe(false);
  });

  // Node 24.0 and 24.1 have no import.meta.main; the scripts must still run, not exit 0 silently.
  test("falls back to argv[1] when import.meta.main is missing", () => {
    expect(isEntryPoint({ url }, self)).toBe(true);
    expect(isEntryPoint({ url }, join(import.meta.dirname, "guard.test.ts"))).toBe(false);
    expect(isEntryPoint({ url }, join(tmpdir(), "no-such-script.ts"))).toBe(false);
    expect(isEntryPoint({ url }, undefined)).toBe(false);
  });
});
