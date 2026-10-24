// Blocks web output profile (M1-17; rise.md §4 "Published web package"; ADR-0003, ADR-0005): the
// player files every Blocks package ships, whatever the standard. An index page with an empty app
// root, the player as one classic script and its style sheet under content-hashed names (so a
// republished package never runs a stale cached player), and the course data file the player loads by
// script tag. The builder adds `media/` beside them. The player uses the system font stack, so there
// is no fonts folder yet.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { courseDataScript, DATA_FILE, indexPage } from "@course-suite/player-blocks";
import type { Exporter, PlayerBundle } from "./builder.js";
import { ok } from "./result.js";

/** The page every standard launches. */
export const BLOCKS_LAUNCH_PAGE = "index.html";

const utf8 = (text: string) => new TextEncoder().encode(text);

let built: { script: Uint8Array; style: Uint8Array } | undefined;

/** `player.<first 10 hex digits of the SHA-256>.<extension>`. */
const hashed = (extension: string, data: Uint8Array) =>
  `player.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.${extension}`;

/**
 * The Blocks player for the package builder. `language` goes on the index page until the player
 * sets the course's own language at start.
 */
export function blocksPlayer({ language = "en" }: { language?: string } = {}): PlayerBundle {
  built ??= {
    // Written by scripts/bundle-player.ts when this package builds.
    script: readFileSync(new URL("../dist/player/player.js", import.meta.url)),
    style: readFileSync(
      fileURLToPath(import.meta.resolve("@course-suite/player-blocks/player.css")),
    ),
  };
  const script = hashed("js", built.script);
  const style = hashed("css", built.style);
  return {
    launchPage: BLOCKS_LAUNCH_PAGE,
    files: new Map([
      [BLOCKS_LAUNCH_PAGE, utf8(indexPage(language, { script, style }))],
      [script, built.script],
      [style, built.style],
    ]),
    courseDataScript: (data) => ({ path: DATA_FILE, data: utf8(courseDataScript(data)) }),
  };
}

/**
 * Plain web output (STD-02, standards.md §1 "Plain web"): no descriptor and no tracking. The package
 * opens at its index page from a folder or any static host, and a Blocks course keeps no progress
 * there (ADR-0005).
 */
export function webExporter(): Exporter {
  return { standard: "web", describe: () => ok([]), check: () => [] };
}
