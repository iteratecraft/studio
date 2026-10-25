// ADR-0006: the engine packages the editor uses run in a browser and a Web Worker as well as in
// Node.js, so their runtime code never imports a Node.js module. Proves that `pnpm lint` fails on
// one, using the repository's own Biome overrides in a scratch folder.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");
const RUNTIME_NEUTRAL = [
  "format",
  "labels",
  "tracking",
  "player-blocks",
  "exporters",
  "zip",
  "project",
  "jobs",
  "preview",
];
const FIXTURE = `import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n`;

const scratch = mkdtempSync(join(tmpdir(), "runtime-neutral-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

/** Whether lint fails on FIXTURE saved at `path`, with the repository's override for this rule. */
function fails(path: string): boolean {
  const overrides = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8")).overrides.filter(
    (override: { linter?: unknown }) => override.linter,
  );
  const dir = mkdtempSync(join(scratch, "case-"));
  writeFileSync(join(dir, "biome.json"), JSON.stringify({ root: true, overrides }));
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), FIXTURE);
  const run = spawnSync(
    process.execPath,
    [biome, "lint", "--only=correctness/noNodejsModules", path],
    { cwd: dir, encoding: "utf8" },
  );
  return run.status !== 0;
}

test.each(RUNTIME_NEUTRAL)("a node: import in the runtime code of %s fails lint", (name) => {
  expect(fails(`packages/${name}/src/files.ts`)).toBe(true);
});

test("tests, test helpers and Node-only packages may import Node.js modules", () => {
  expect(fails("packages/exporters/src/files.test.ts")).toBe(false);
  expect(fails("packages/exporters/test/files.ts")).toBe(false);
  expect(fails("packages/conformance/src/files.ts")).toBe(false);
});
