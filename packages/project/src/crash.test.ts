// ENG-11 done-when, on Windows (D-29): killing the app during save never corrupts the project. A
// child Node process saves, autosaves and snapshots the project in a loop and is killed at a
// random moment, many times over; after each kill the project must open.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { assetBytes, full, projectOf } from "../test/fixtures.js";
import { nodeProjectFiles } from "../test/node-files.js";
import { addAsset, autosaveFolder, openProject, saveProject } from "./index.js";

const CHILD = fileURLToPath(new URL("../test/save-child.ts", import.meta.url));
const NAME = "Killed.course";
const ITERATIONS = 40;

test("killing the process at random points during save never leaves a project that will not open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "project-kill-"));
  try {
    const files = nodeProjectFiles(dir);
    const project = await projectOf(full());
    // Large enough that a save takes a while, so kills land inside writes and renames.
    const big = new Uint8Array(randomBytes(2 * 1024 * 1024));
    await addAsset(
      project,
      big,
      { name: "big.bin", type: "font/woff2", source: "upload" },
      "big.bin",
    );
    await saveProject(files, NAME, project);

    let killedMidWrite = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const child = spawn(process.execPath, [CHILD, dir, NAME], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let errors = "";
      child.stderr.on("data", (chunk) => {
        errors += chunk;
      });
      const exited = new Promise((resolve) => child.once("exit", resolve));
      await Promise.race([
        new Promise((resolve) => child.stdout.once("data", resolve)),
        exited.then(() => Promise.reject(new Error(`the child stopped by itself: ${errors}`))),
      ]);
      await sleep(Math.random() * 300);
      child.kill("SIGKILL");
      await exited;

      const left = await files.list(autosaveFolder(NAME));
      if (left.some((file) => file.endsWith(".tmp"))) killedMidWrite++;
      const result = await openProject(files, NAME);
      if (!result.ok) throw new Error(`after kill ${i + 1}: ${JSON.stringify(result.problems)}`);
      // Every asset reads back, in the file and in any autosave on offer.
      expect(Object.keys(await assetBytes(result.project))).toEqual(
        Object.keys(result.project.assets),
      );
      if (result.recovered) {
        const recovered = result.recovered;
        expect(Object.keys(await assetBytes(recovered))).toEqual(Object.keys(recovered.assets));
      }
    }
    // The kills did land inside writes, not only between them.
    expect(killedMidWrite).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 240_000);
