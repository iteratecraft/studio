// Blocks web output profile (M1-17; rise.md §4 "Published web package"; ADR-0003, ADR-0005): the
// player files every Blocks package ships, whatever the standard. An index page with an empty app
// root, the player as one classic script and its style sheet under content-hashed names (so a
// republished package never runs a stale cached player), and the course data file the player loads by
// script tag. The builder adds `media/` beside them. The player uses the system font stack, so there
// is no fonts folder yet.
import { courseDataScript, DATA_FILE, indexPage, largestResume } from "@course-suite/player-blocks";
// Embedded at build time by scripts/bundle-player.ts, so building needs no file system (ADR-0006).
import { PLAYER_SCRIPT, PLAYER_STYLE } from "../dist/assets.js";
import type { Exporter, PlayerBundle } from "./builder.js";
import { ok } from "./result.js";

// Not xml.ts's helper: that module brings the XML parser, which the player files never need (the
// editor's preview loads this module, ENG-13).
const utf8 = (text: string) => new TextEncoder().encode(text);

/** The page every standard launches. */
export const BLOCKS_LAUNCH_PAGE = "index.html";

let built: { script: Uint8Array; style: Uint8Array } | undefined;

/**
 * The Blocks player for the package builder. `language` goes on the index page until the player
 * sets the course's own language at start.
 */
export function blocksPlayer({ language = "en" }: { language?: string } = {}): PlayerBundle {
  built ??= { script: utf8(PLAYER_SCRIPT.text), style: utf8(PLAYER_STYLE.text) };
  // Named `player.<first 10 hex digits of the SHA-256>.<extension>` at build time.
  const script = PLAYER_SCRIPT.name;
  const style = PLAYER_STYLE.name;
  return {
    launchPage: BLOCKS_LAUNCH_PAGE,
    files: new Map([
      [BLOCKS_LAUNCH_PAGE, utf8(indexPage(language, { script, style }))],
      [script, built.script],
      [style, built.style],
    ]),
    courseDataScript: (data) => ({ path: DATA_FILE, data: utf8(courseDataScript(data)) }),
    largestResume,
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
