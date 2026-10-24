// Bundles the Blocks player into dist/player/player.js at build time: one self-contained classic
// script (IIFE), never an ES module, so a package opens from disk (ADR-0003). blocksPlayer() ships it.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const { output } = await build({
  input: fileURLToPath(import.meta.resolve("@course-suite/player-blocks/boot")),
  platform: "browser",
  write: false,
  output: { format: "iife" },
});
const code = output[0].code;
// buildPackage rejects module script tags, import( and import.meta; this catches a stray static one.
const module = /^\s*(?:import|export)\s/m.exec(code);
if (module)
  throw new Error(`The player bundle is not a classic script: it contains "${module[0]}"`);
const dir = new URL("../dist/player/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("player.js", dir), code);
