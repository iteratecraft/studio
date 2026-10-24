// Writes a Blocks course package for the dev harness and the player's browser tests: the player
// files of the Blocks web output profile (index page, hashed classic script and style sheet, as the
// package builder ships them), the course data file and SVG stand-ins for the course's SVG media.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blocksPlayer } from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import type { LabelSet } from "@course-suite/labels";
import { courseDataScript, DATA_FILE } from "@course-suite/player-blocks";

export interface PackageOptions {
  course: Course;
  labels?: LabelSet;
}

/** Writes a course package into `dir`; open `<dir>/index.html` from disk to run it. */
export async function writePackage(dir: string, { course, labels }: PackageOptions): Promise<void> {
  mkdirSync(join(dir, "media"), { recursive: true });
  const player = blocksPlayer({ language: course.sourceLanguage ?? labels?.language ?? "en" });
  for (const [path, data] of player.files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), data);
  }
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
