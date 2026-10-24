// Builds a Blocks course package for the dev harness and the player's browser tests: the index page,
// the player as one classic script (ADR-0003), its style sheet, the course data file and SVG
// stand-ins for the course's SVG media. The package builder (M1-16) takes this over for exports.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Course } from "@course-suite/format";
import type { LabelSet } from "@course-suite/labels";
import { courseDataScript, DATA_FILE, indexPage } from "@course-suite/player-blocks";
import { build } from "rolldown";

const resolve = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));

let player: Promise<string> | undefined;

/** The player bundled as one self-contained classic script (IIFE), never an ES module. */
export function bundlePlayer(): Promise<string> {
  player ??= build({
    input: resolve("@course-suite/player-blocks/boot"),
    platform: "browser",
    write: false,
    output: { format: "iife" },
  }).then(({ output }) => {
    const code = output[0].code;
    // ADR-0003: shipped scripts never use modules, which Chromium blocks from file://.
    const module =
      /<script[^>]*type=["']?module|\bimport\s*\(|\bimport\.meta\b|^\s*(?:import|export)\s/m.exec(
        code,
      );
    if (module)
      throw new Error(`The player bundle is not a classic script: it contains "${module[0]}"`);
    return code;
  });
  return player;
}

export interface PackageOptions {
  course: Course;
  labels?: LabelSet;
}

/** Writes a course package into `dir`; open `<dir>/index.html` from disk to run it. */
export async function writePackage(dir: string, { course, labels }: PackageOptions): Promise<void> {
  mkdirSync(join(dir, "media"), { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    indexPage(course.sourceLanguage ?? labels?.language ?? "en"),
  );
  writeFileSync(join(dir, "player.js"), await bundlePlayer());
  copyFileSync(resolve("@course-suite/player-blocks/player.css"), join(dir, "player.css"));
  writeFileSync(join(dir, DATA_FILE), courseDataScript(labels ? { course, labels } : { course }));
  for (const media of course.media) {
    if (media.key.endsWith(".svg")) {
      writeFileSync(
        join(dir, "media", media.key),
        placeholderSvg(media.width ?? 640, media.height ?? 360),
      );
    }
  }
}

/** A plain drawing with no text, so the harness needs no image files of its own. */
const placeholderSvg = (width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
  `<rect width="${width}" height="${height}" fill="#dfead8"/>` +
  `<rect x="${width * 0.3}" y="${height * 0.25}" width="${width * 0.4}" height="${height * 0.6}" rx="12" fill="#6b8f4e"/>` +
  `<rect x="${width * 0.3}" y="${height * 0.55}" width="${width * 0.4}" height="${height * 0.1}" fill="#4a3826"/>` +
  `</svg>\n`;
