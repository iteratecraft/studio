// Proves that `pnpm lint` fails on a Tauri import outside apps/desktop (ADR-0006, M2-02): editor
// code reaches files, dialogs and processes only through the host interface. It lints fixture files
// in a scratch folder with the repository's own linter settings and overrides.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

const FIXTURE = `import { invoke } from "@tauri-apps/api/core";
import * as fs from "@tauri-apps/plugin-fs";
export { open } from "@tauri-apps/plugin-dialog";
export const api = () => import("@tauri-apps/api");
export { fs, invoke };
`;

const scratch = mkdtempSync(join(tmpdir(), "tauri-imports-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

/** Lints FIXTURE saved at `path`; returns the lines reported as restricted imports. */
function lint(path: string): number[] {
  const { linter, overrides } = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8"));
  const dir = mkdtempSync(join(scratch, "case-"));
  writeFileSync(
    join(dir, "biome.json"),
    JSON.stringify({
      root: true,
      linter,
      // The plugin overrides point at files in the repository; this test needs only the others.
      overrides: overrides.filter((o: { plugins?: unknown }) => !o.plugins),
    }),
  );
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), FIXTURE);
  const run = spawnSync(process.execPath, [biome, "lint", "--reporter=github", path], {
    cwd: dir,
    encoding: "utf8",
  });
  return [
    ...run.stdout.matchAll(
      /^::error title=lint\/style\/noRestrictedImports,file=[^,]*,line=(\d+)/gm,
    ),
  ].map((m) => Number(m[1]));
}

test.each(["packages/ui/src/editor.ts", "packages/host/src/host.ts", "apps/web/src/main.ts"])(
  "a Tauri import in %s fails lint",
  (path) => {
    expect(lint(path)).toEqual([1, 2, 3, 4]);
  },
);

test("apps/desktop may import Tauri", () => {
  expect(lint("apps/desktop/src/desktop-host.ts")).toEqual([]);
});
