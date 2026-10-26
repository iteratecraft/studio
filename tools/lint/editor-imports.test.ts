// Proves that `pnpm lint` keeps editor UI code free of Node.js and Tauri imports (ADR-0006: no
// Node.js at run time on desktop, and files, dialogs and processes only through the host
// interface), using the repository's own Biome overrides in a scratch folder with fixture files.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

// Each line marked `// flagged` must be reported; every other line must not be.
const FIXTURE = `
import { readFile } from "node:fs/promises"; // flagged
import path from "path"; // flagged
import { invoke } from "@tauri-apps/api/core"; // flagged
import { open } from "@tauri-apps/plugin-dialog"; // flagged
export { Command } from "@tauri-apps/plugin-shell"; // flagged
import { useState } from "react";
import { Button } from "@course-suite/ui";
import { english } from "./strings.js";
export const used = [readFile, path, invoke, open, useState, Button, english];
`;
const flaggedLines = FIXTURE.split("\n").flatMap((line, i) =>
  line.endsWith("// flagged") ? [i + 1] : [],
);

const scratch = mkdtempSync(join(tmpdir(), "editor-imports-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

/** Lints FIXTURE saved at `path` with the repository's import rules; returns the reported lines. */
function lint(path: string): number[] {
  const { linter, overrides } = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8"));
  const editorOverrides = overrides.filter((o: { plugins?: unknown }) => !o.plugins);
  const dir = mkdtempSync(join(scratch, "case-"));
  writeFileSync(
    join(dir, "biome.json"),
    JSON.stringify({ root: true, linter, overrides: editorOverrides }),
  );
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), FIXTURE);
  const run = spawnSync(process.execPath, [biome, "lint", "--reporter=github", path], {
    cwd: dir,
    encoding: "utf8",
  });
  const lines = run.stdout.matchAll(
    /^::error title=lint\/(?:correctness\/noNodejsModules|style\/noRestrictedImports),file=[^,]*,line=(\d+)/gm,
  );
  return [...new Set([...lines].map((m) => Number(m[1])))];
}

test("Node.js and Tauri imports in the UI kit fail lint", () => {
  expect(lint("packages/ui/src/files.tsx")).toEqual(flaggedLines);
  expect(flaggedLines).toHaveLength(5);
});

test("the rule covers the web app's UI code and the blocks editor", () => {
  expect(lint("apps/web/src/gallery.tsx")).toEqual(flaggedLines);
  expect(lint("packages/blocks-editor/src/app.tsx")).toEqual(flaggedLines);
});

test("tests and browser-test files may import Node.js; only the desktop app may import Tauri", () => {
  const lines = FIXTURE.split("\n");
  const tauriLines = flaggedLines.filter((n) => lines[n - 1]?.includes("@tauri-apps"));
  expect(lint("packages/ui/src/tokens.test.ts")).toEqual(tauriLines);
  expect(lint("apps/web/e2e/axe.ts")).toEqual(tauriLines);
  expect(lint("apps/desktop/src/host.ts")).toEqual([]);
});
