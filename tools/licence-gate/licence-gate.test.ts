// Proves that `pnpm check:licences` (M0-04) fails on each kind of licence problem. Each test runs
// against a fresh copy of this repository, installed from the pnpm store. The gate reports every
// problem it finds, so independent failures share one copy and each must appear in the output.
// Fixture dependencies are local `file:` packages. Adding one makes pnpm re-resolve that package's
// other dependencies, which needs registry metadata; a frozen-lockfile install (CI) never caches it,
// so installs prefer the cache and fetch only that metadata.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
// test-courses: the fixtures checkout (M1-28); target: the desktop app's Rust build output (M2-01).
// These checks read neither.
const NOT_COPIED = new Set(["node_modules", ".git", ".turbo", "dist", "test-courses", "target"]);
const TIMEOUT_MS = 120_000;

const copies: string[] = [];
// Each copy holds its own node_modules; deleting one can take well over 10 s on Windows CI.
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}, 120_000);

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
function addDependency(
  dir: string,
  pkg: string,
  name: string,
  license?: string,
  field = "dependencies",
): void {
  const fixture = join(dir, "fixtures", name);
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ name, version: "1.0.0", license }));
  // pnpm accepts only a version range for a peer, and would otherwise fetch it from the registry.
  const peer = field === "peerDependencies";
  if (peer) appendFileSync(join(dir, "pnpm-workspace.yaml"), "\nautoInstallPeers: false\n");
  editJson(join(dir, pkg, "package.json"), (manifest) => {
    const deps = (manifest[field] ?? {}) as Record<string, string>;
    manifest[field] = { ...deps, [name]: peer ? "1.0.0" : `file:../../fixtures/${name}` };
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

// pnpm keeps one store per drive, and CI checks out to D: while tmpdir() is on C:, so point the
// copy at the store this repository was installed from. `store path` ends in the layout version.
// It goes in the copy's .npmrc, not on the install command line, because `pnpm licenses list`
// reads package metadata from the configured store too.
let storeDir: string | undefined;
function install(dir: string): void {
  storeDir ??= dirname(run(repoRoot, ["store", "path"]).output.trim());
  appendFileSync(join(dir, ".npmrc"), `\nstore-dir=${storeDir.split(sep).join("/")}\n`);
  const result = run(dir, ["install", "--prefer-offline", "--no-frozen-lockfile"]);
  expect(result.status, result.output).toBe(0);
}

function check(dir: string, ...args: string[]): { status: number | null; output: string } {
  return run(dir, ["check:licences", ...args]);
}

function gate(dir: string, ...args: string[]): { status: number | null; output: string } {
  install(dir);
  return check(dir, ...args);
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

  test("fails on each rejected dependency", { timeout: TIMEOUT_MS }, () => {
    // [case, package, fixture name, licence, dependency field, expected problem]
    const cases: [string, string, string, string | undefined, string, string][] = [
      [
        "GPL in an app",
        "apps/web",
        "dep-gpl",
        "GPL-3.0-only",
        "dependencies",
        "GPL-3.0-only is not allowed",
      ],
      [
        "AGPL in the server",
        "apps/server",
        "dep-agpl",
        "AGPL-3.0-or-later",
        "dependencies",
        "AGPL-3.0-or-later is not allowed",
      ],
      ["SSPL", "packages/ui", "dep-sspl", "SSPL-1.0", "dependencies", "SSPL-1.0 is not allowed"],
      ["BUSL", "apps/desktop", "dep-busl", "BUSL-1.1", "dependencies", "BUSL-1.1 is not allowed"],
      [
        "CC-BY-NC",
        "packages/exporters",
        "dep-ccbync",
        "CC-BY-NC-4.0",
        "dependencies",
        "CC-BY-NC-4.0 is not allowed",
      ],
      [
        "LGPL in a course-shipped package",
        "packages/tracking",
        "dep-lgpl",
        "LGPL-3.0-only",
        "dependencies",
        "LGPL-3.0-only is not allowed in course-shipped packages",
      ],
      [
        "no licence",
        "apps/web",
        "dep-none",
        undefined,
        "dependencies",
        "Unknown is not a reviewed licence",
      ],
      [
        "an unreviewed licence",
        "apps/web",
        "dep-wtfpl",
        "WTFPL",
        "dependencies",
        "WTFPL is not a reviewed licence",
      ],
      [
        "a GPL alternative joined by AND",
        "apps/web",
        "dep-and",
        "(MIT AND GPL-2.0-only)",
        "dependencies",
        "GPL-2.0-only is not allowed",
      ],
      [
        "a GPL devDependency in a course-shipped package",
        "packages/tracking",
        "dep-gpl-dev",
        "GPL-3.0-only",
        "devDependencies",
        "packages/tracking: devDependency dep-gpl-dev may be bundled into courses",
      ],
      // axe-core (MPL-2.0) is approved only as a devDependency of a test-only package (M1-29).
      [
        "MPL in a course-shipped package",
        "packages/player-blocks",
        "dep-mpl",
        "MPL-2.0",
        "dependencies",
        "MPL-2.0 is not a reviewed licence",
      ],
      [
        "an MPL devDependency in a course-shipped package",
        "packages/player-blocks",
        "dep-mpl-dev",
        "MPL-2.0",
        "devDependencies",
        "packages/player-blocks: devDependency dep-mpl-dev may be bundled into courses",
      ],
      [
        "MPL as a production dependency of a test-only package",
        "packages/player-blocks-harness",
        "dep-mpl-prod",
        "MPL-2.0",
        "dependencies",
        "MPL-2.0 is not a reviewed licence",
      ],
      [
        "an LGPL peerDependency in a course-shipped package",
        "packages/tracking",
        "dep-lgpl-peer",
        "LGPL-3.0-only",
        "peerDependencies",
        "packages/tracking: peerDependency dep-lgpl-peer may be bundled into courses",
      ],
    ];
    const dir = copyRepo();
    for (const [, pkg, dep, license, field] of cases) addDependency(dir, pkg, dep, license, field);
    const result = gate(dir);
    const lines = result.output.split(/\r?\n/);
    for (const [name, , dep, , , message] of cases) {
      expect(
        lines.find((line) => line.includes(` ${dep} `)),
        name,
      ).toContain(message);
    }
    expect(result.status).not.toBe(0);
  });

  test("accepts LGPL in an app, MPL test tooling in a test-only package, a permissive OR choice and a reviewed exception", {
    timeout: TIMEOUT_MS,
  }, () => {
    const dir = copyRepo();
    addDependency(dir, "apps/desktop", "dep-lgpl", "LGPL-2.1-or-later");
    addDependency(dir, "packages/player-blocks-harness", "dep-mpl", "MPL-2.0", "devDependencies");
    addDependency(dir, "packages/format", "dep-or", "(MIT OR GPL-3.0-only)");
    addDependency(dir, "apps/web", "dep-gpl", "GPL-3.0-only");
    writeExceptions(dir, [
      { name: "dep-gpl", licence: "GPL-3.0-only", inCourses: false, reason: "test" },
    ]);
    const result = gate(dir, "--write");
    expect(result.status, result.output).toBe(0);
  });

  test("fails on wrong package licences, and on fonts without their licence in the repository or an app's build output", {
    timeout: TIMEOUT_MS,
  }, () => {
    const cases: [string, string, string][] = [
      ["packages/format", "Apache-2.0", 'ADR-0001 requires "MIT"'],
      ["packages/ui", "MIT", 'ADR-0001 requires "Apache-2.0"'],
      ["apps/server", "GPL-3.0-only", 'ADR-0001 requires "Apache-2.0"'],
    ];
    const dir = copyRepo();
    for (const [pkg, license] of cases) {
      editJson(join(dir, pkg, "package.json"), (manifest) => {
        manifest.license = license;
      });
    }
    // The course-shipped set comes from the `mit` tag, so dropping it makes MIT the wrong licence.
    editJson(join(dir, "packages", "player-blocks", "turbo.json"), (turbo) => {
      turbo.tags = ["engine"];
    });
    rmSync(join(dir, "packages", "tracking", "LICENSE"));
    // D-45: a bundled font without its OFL licence beside it.
    rmSync(join(dir, "packages", "fonts", "files", "inter", "OFL.txt"));
    // OFL-1.1 section 2: an app's build output with a bundled font but not its licence, and with
    // one that is no bundled font. The other family's licence beside it does not count.
    const assets = join(dir, "apps", "web", "dist", "assets");
    const fonts = join(dir, "packages", "fonts", "files");
    mkdirSync(assets, { recursive: true });
    cpSync(join(fonts, "literata", "regular.woff2"), join(assets, "regular-abc.woff2"));
    cpSync(join(fonts, "work-sans", "OFL.txt"), join(assets, "OFL-abc.txt"));
    writeFileSync(join(assets, "stray-abc.woff2"), "wOF2 not one of ours");
    // With its licence, a bundled font in the build output passes.
    const desktop = join(dir, "apps", "desktop", "dist", "assets");
    mkdirSync(desktop, { recursive: true });
    cpSync(join(fonts, "literata", "bold.woff2"), join(desktop, "bold-abc.woff2"));
    cpSync(join(fonts, "literata", "OFL.txt"), join(desktop, "OFL-def.txt"));
    // A downloaded program (D-43): GPL, bundled, and not named in the notices.
    editJson(join(dir, "apps", "desktop", "src-tauri", "media-tool.json"), (pin) => {
      pin.licence = "GPL-3.0-or-later";
      pin.bundled = true;
      pin.name = "Some converter 1.0";
    });

    const result = gate(dir);
    for (const message of [
      "media-tool.json: GPL-3.0-or-later is not allowed for a downloaded program",
      'media-tool.json: a downloaded program must not be bundled ("bundled": false)',
      "THIRD_PARTY_NOTICES.md must name the downloaded program Some converter 1.0",
    ]) {
      expect(result.output).toContain(message);
    }
    for (const [pkg, license, message] of cases) {
      expect(result.output).toContain(`${pkg}: license is "${license}", ${message}`);
    }
    expect(result.output).toContain(
      'packages/player-blocks: license is "MIT", ADR-0001 requires "Apache-2.0"',
    );
    expect(result.output).toContain(
      "packages/tracking: a course-shipped package needs its own MIT",
    );
    for (const face of ["bold", "italic", "regular"]) {
      expect(result.output).toContain(
        `packages/fonts/files/inter/${face}.woff2: a font needs the SIL Open Font License 1.1`,
      );
    }
    expect(result.output).toContain(
      "apps/web/dist/assets/regular-abc.woff2: the build output lacks the OFL.txt of literata",
    );
    expect(result.output).toContain(
      "apps/web/dist/assets/stray-abc.woff2: a font in the app's build output that is no bundled font",
    );
    expect(result.output).not.toContain("apps/desktop/dist");
    expect(result.status).not.toBe(0);
  });

  describe("exceptions", () => {
    const exception = {
      name: "fixture-dep",
      licence: "GPL-3.0-only",
      inCourses: false,
      reason: "test",
    };

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

    test("fails on an exception that is no longer needed or has no reason", {
      timeout: TIMEOUT_MS,
    }, () => {
      const dir = copyRepo();
      writeExceptions(dir, [exception, { ...exception, name: "other-dep", reason: " " }]);
      const result = gate(dir);
      expect(result.output).toContain("fixture-dep (GPL-3.0-only) is no longer needed");
      expect(result.output).toContain("exceptions.json entry 1 needs name, licence");
      expect(result.status).not.toBe(0);
    });
  });

  test("lists dependencies and their NOTICE in THIRD_PARTY_NOTICES.md", {
    timeout: TIMEOUT_MS,
  }, () => {
    const dir = copyRepo();
    addDependency(dir, "packages/player-blocks", "fixture-dep", "Apache-2.0");
    // Mixed case: the gate must find it on case-sensitive file systems too.
    writeFileSync(
      join(dir, "fixtures", "fixture-dep", "Notice.txt"),
      "Fixture Dep\nCopyright 2026 Someone\n",
    );
    install(dir);

    const stale = check(dir);
    expect(stale.output).toContain("THIRD_PARTY_NOTICES.md is out of date");
    expect(stale.status).not.toBe(0);

    expect(check(dir, "--write").status).toBe(0);
    const notices = readFileSync(join(dir, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain("| fixture-dep | 1.0.0 | Apache-2.0 | yes |");
    expect(notices).toContain(
      "### NOTICE of fixture-dep 1.0.0\n\n````text\nFixture Dep\nCopyright 2026 Someone\n````",
    );
    expect(check(dir).status).toBe(0);
  });
});
