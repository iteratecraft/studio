// The course data file and the index page of a published Blocks course (rise.md §4 "Published web
// package", rule 20; ADR-0003). The data file is a classic script that registers the course, as
// base64 of its UTF-8 JSON, on the player's registry, so the package opens from disk without CORS.
import type { Course, PublishSettings } from "@course-suite/format";
import type { LabelSet } from "@course-suite/labels";

/** What the course data file hands to the player. The package builder fills in every field. */
export interface CourseData {
  course: Course;
  /** The course's label set; keys it leaves out fall back to the built-in English text. */
  labels?: LabelSet;
  /** The standard fixed at publish (standards.md P-1); absent in a preview, which tracks nothing. */
  standard?: PublishSettings["standard"];
  /** The published package's version, kept with the saved state (rise.md rule 12). */
  packageVersion?: number;
  /** Package path of each media file, by storage key. */
  media?: Record<string, string>;
}

/** The player-owned global every chunk and the data file register on (ADR-0003 step 2). */
export const REGISTRY_GLOBAL = "blocksPlayer";
/** Registry name and file of the course data, relative to the index page. */
export const DATA_CHUNK = "course-data";
export const DATA_FILE = "course-data.js";
/** Lazy chunks and plugins live in this folder as `<name>.js`. */
export const CHUNK_DIR = "chunks";
/** Chunk names: lowercase kebab-case, so a name can never leave the chunk folder. */
export const CHUNK_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** How long the course data may take to load (rise.md rule 20). */
export const DATA_TIMEOUT_MS = 10_000;
/** How long any other chunk may take to load (ADR-0003 step 3). */
export const CHUNK_TIMEOUT_MS = 30_000;

/** The text of the course data file. */
export function courseDataScript(data: CourseData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `${REGISTRY_GLOBAL}.register(${JSON.stringify(DATA_CHUNK)},${JSON.stringify(btoa(binary))});\n`;
}

/** The course data a data file registered, or undefined when it is not course data. */
export function decodeCourseData(value: unknown): CourseData | undefined {
  if (typeof value !== "string") return undefined;
  let data: unknown;
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
  return isCourseData(data) ? data : undefined;
}

// shortcut: checks only the outline the shell walks; the builder validated the whole document
// (validateCourse) before writing it. Block renderers skip a block they cannot read.
function isCourseData(value: unknown): value is CourseData {
  const course = isObject(value) ? value.course : undefined;
  const labels = isObject(value) ? value.labels : undefined;
  const standard = isObject(value) ? value.standard : undefined;
  const version = isObject(value) ? value.packageVersion : undefined;
  return (
    (labels === undefined || (isObject(labels) && isObject(labels.labels))) &&
    (standard === undefined || typeof standard === "string") &&
    (version === undefined || Number.isSafeInteger(version)) &&
    isObject(course) &&
    typeof course.title === "string" &&
    Array.isArray(course.entries) &&
    Array.isArray(course.media) &&
    course.entries.every(
      (entry) =>
        isObject(entry) &&
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        (entry.kind === "section" ||
          (entry.kind === "lesson" && Array.isArray(entry.blocks)) ||
          (entry.kind === "quiz" && Array.isArray(entry.questions))),
    )
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** File names of the player's script and style sheet, relative to the index page. */
export interface PlayerFiles {
  script: string;
  style: string;
}

/** The index page: an empty app root, the player's style sheet and its boot script. */
export function indexPage(
  language: string,
  files: PlayerFiles = { script: "player.js", style: "player.css" },
): string {
  const attribute = (path: string) => path.replace(/[^A-Za-z0-9._~/-]/g, "");
  return `<!doctype html>
<html lang="${language.replace(/[^A-Za-z0-9-]/g, "")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<link rel="stylesheet" href="${attribute(files.style)}">
</head>
<body>
<div id="app"></div>
<script src="${attribute(files.script)}"></script>
</body>
</html>
`;
}
