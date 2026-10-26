// The package builder (STD-02): validates the course, collects the player, the course data and the
// media, lets the exporter for the chosen standard write its descriptor, checks the result and zips
// it. Same course, player, media and options always give the same bytes.
import { FONT_FACES, type FontFiles, fontFormat } from "@course-suite/fonts";
import type { Course, FontRef, FontRole, PublishSettings } from "@course-suite/format";
import { defaultFont, fontKey, fontsOf, validateCourse } from "@course-suite/format";
import type { CourseFonts, PackagedFace } from "@course-suite/player-blocks";
import type { DropPart, LrsSettings, ResumeState } from "@course-suite/tracking";
import { checkResume, resumeCapFor } from "@course-suite/tracking";
import { writeZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES } from "@course-suite/zip";
import { fail, ok, type Problem, type Result } from "./result.js";
import { findModuleCode, findOutboundUrls, urlsIn } from "./scan.js";

export type Standard = PublishSettings["standard"];

export interface PackageFile {
  /** Package path: relative, forward slashes, such as `index.html` or `media/cover.jpg`. */
  path: string;
  data: Uint8Array;
}

/**
 * What the player gives the builder. The player package provides it from its own build; the
 * builder adds the course data and media beside these files and never changes them.
 */
export interface PlayerBundle {
  /** Every file the player ships, by package path: pages, classic scripts (ADR-0003), styles, fonts. */
  files: ReadonlyMap<string, Uint8Array>;
  /** Package path of the page that boots the player, among `files`. Every standard launches it. */
  launchPage: string;
  /** The course data as a classic script the player loads by script tag (ADR-0003), and its path. */
  courseDataScript(data: CourseData): PackageFile;
  /**
   * The largest learner state the player can save for the course, for the resume size check at
   * publish (standards.md §4.2). Without it the check is skipped.
   */
  largestResume?(course: Course): ResumeState;
}

/** Everything the player needs about this course, fixed at publish. */
export interface CourseData {
  /** The course, without `ext` data (ADR-0002, "Extension namespace"). */
  course: Course;
  /** The standard the package was built for (standards.md P-1). */
  standard: Standard;
  packageVersion: number;
  /** Package path of each media file, by the storage key of its media index entry. */
  media: Record<string, string>;
  /** xAPI: the LRS the author set, for launches that name none (standards.md E-17). */
  lrs?: LrsSettings;
  /** The fonts the package carries for the theme, by package path (ENG-08). */
  fonts?: CourseFonts;
}

/**
 * A font's files, by its reference: a bundled one (`readBuiltinFont` of @course-suite/fonts) or one
 * of the author's font library; undefined when the library no longer has it.
 */
export type FontSource = (font: FontRef) => FontFiles | undefined | Promise<FontFiles | undefined>;

/** What an exporter is given to write its descriptor. */
export interface DescribeInput {
  course: Course;
  packageVersion: number;
  launchPage: string;
  /** Every content file: the player, the course data and the media, sorted. */
  files: readonly string[];
}

/** The plug-in point for one standard: SCORM 1.2, SCORM 2004, xAPI, cmi5 or web. */
export interface Exporter {
  standard: Standard;
  /** The files the standard adds at the package root (descriptor, schemas), never listed as content. */
  describe(input: DescribeInput): Result<PackageFile[]>;
  /** Problems in a finished package's descriptor: invalid, or not matching the package's files. */
  check(files: ReadonlyMap<string, Uint8Array>): Problem[];
  /** An LRS the author set (xAPI), written into the course data for the player. */
  lrs?: LrsSettings;
}

export interface BuildInput {
  course: Course;
  player: PlayerBundle;
  exporter: Exporter;
  /** The bytes of a media file in the project container, by storage key; undefined when missing. */
  media(key: string): Uint8Array | undefined | Promise<Uint8Array | undefined>;
  /** The files of each font the theme uses (ENG-08): the package carries those and no others. */
  fonts: FontSource;
  /** A whole number from 1, raised by the app for every published update (rise.md §4). */
  packageVersion: number;
  /**
   * Addresses the package may name besides those in the course (ADR-0004 rows 2 and 3), such as an
   * LRS endpoint set in the publish settings. Each one also allows every URL under it.
   */
  allowedUrls?: readonly string[];
}

export interface BuiltPackage {
  zip: Uint8Array;
  /** Every file in the package, sorted. */
  files: string[];
  /** What the author should know before sharing the package, such as credentials inside it. */
  warnings: PackageWarning[];
}

/**
 * Something the author should know about a package that was built. `code` is stable, so an editor
 * can show its own text; `message` is plain English for the author.
 */
export type PackageWarning = Problem &
  (
    | {
        /** The package holds LRS credentials anyone with it can read. */
        code: "lrs-credentials";
      }
    | {
        /**
         * Learner progress can outgrow what the standard stores (standards.md §4.2, M2-07).
         * `resume-parts-dropped`: it still fits once `dropped` is left out.
         * `resume-over-cap`: it does not fit even then, and saving stops once it grows that large.
         */
        code: "resume-parts-dropped" | "resume-over-cap";
        /** Estimated characters of the largest progress, with nothing dropped. */
        size: number;
        /** Characters the standard stores. */
        cap: number;
        /** What is not saved to make it fit, first dropped first. */
        dropped: DropPart[];
      }
  );

export const MEDIA_FOLDER = "media";
export const FONTS_FOLDER = "fonts";

/** The storage key a package takes a media entry's bytes from: its optimised variant when it has one. */
const packagedKey = (entry: Course["media"][number]) => entry.variantKey ?? entry.key;

/** Storage keys of every media file a package of `course` holds, each once: what `media` is asked for. */
export const packagedMediaKeys = (course: Course): string[] => [
  ...new Set(course.media.map(packagedKey)),
];

/**
 * What a package tells the player about its course, which the editor's preview gives the player
 * too (ENG-13): the course without `ext` data and the package path of each media file.
 */
export function courseDataFor(
  course: Course,
  standard: Standard,
  packageVersion: number,
  lrs?: LrsSettings,
  fonts?: CourseFonts,
): CourseData {
  const media = Object.fromEntries(
    course.media.map((entry) => [entry.key, `${MEDIA_FOLDER}/${packagedKey(entry)}`]),
  );
  return {
    course: withoutExt(course),
    standard,
    packageVersion,
    media,
    ...(lrs && { lrs }),
    ...(fonts && { fonts }),
  };
}

/** The fonts a package of a course carries: the course data's account of them, and their files. */
export interface PackagedFonts {
  fonts: CourseFonts;
  files: PackageFile[];
  problems: Problem[];
}

const ROLES: readonly FontRole[] = ["heading", "body", "ui"];

/**
 * Every font the theme of `course` uses and only those (ENG-08, D-45), each face as a file in
 * `fonts/`, named by font key so a package never names a font by an address elsewhere. A custom font
 * the library no longer has gives way to the default font of its role (UI-BLOCKS-EDITOR-R48).
 */
export async function packagedFonts(course: Course, source: FontSource): Promise<PackagedFonts> {
  const chosen = fontsOf(course.theme);
  const read = new Map<string, Promise<FontFiles | undefined>>();
  const load = (font: FontRef) => {
    const key = fontKey(font);
    if (!read.has(key))
      read.set(
        key,
        Promise.resolve().then(() => source(font)),
      );
    return read.get(key) as Promise<FontFiles | undefined>;
  };
  const fonts: CourseFonts = { families: {}, heading: "", body: "", ui: "" };
  const files: PackageFile[] = [];
  const problems: Problem[] = [];
  for (const role of ROLES) {
    let font = chosen[role];
    let found = await load(font);
    if (!found && font.kind === "custom") {
      font = defaultFont(role);
      found = await load(font);
    }
    const key = fontKey(font);
    if (!found) {
      problems.push({
        file: `${FONTS_FOLDER}/${key}`,
        message: "is a font whose files are missing",
      });
      continue;
    }
    fonts[role] = key;
    if (fonts.families[key]) continue;
    const faces: PackagedFace[] = [];
    for (const face of FONT_FACES) {
      const bytes = found[face];
      if (!bytes) continue;
      const format = fontFormat(bytes);
      const path = `${FONTS_FOLDER}/${key}-${face}.${format ?? "font"}`;
      if (!format) {
        problems.push({ file: path, message: "is not a WOFF or WOFF2 font" });
        continue;
      }
      files.push({ path, data: bytes });
      faces.push({
        file: path,
        weight: face === "bold" ? 700 : 400,
        style: face === "italic" ? "italic" : "normal",
      });
    }
    fonts.families[key] = faces;
  }
  return { fonts, files, problems };
}

/** Validates and builds a package. Every problem found is reported, not only the first. */
export async function buildPackage(input: BuildInput): Promise<Result<BuiltPackage>> {
  const { course, player, exporter, packageVersion } = input;
  const courseProblems: Problem[] = validateCourse(course).map((error) => ({
    file: "course",
    path: error.path,
    message: error.message,
  }));
  if (!Number.isSafeInteger(packageVersion) || packageVersion < 1) {
    courseProblems.push({ file: "", message: "the package version must be a whole number from 1" });
  }
  if (courseProblems.length > 0) return fail(courseProblems);

  const problems: Problem[] = [];
  const files = new Map<string, Uint8Array>();
  const keys = new Map<string, string>();
  const add = (path: string, data: Uint8Array) => {
    const unsafe = unsafePath(path);
    const key = path.normalize("NFC").toLowerCase();
    const clash = keys.get(key);
    if (unsafe) problems.push({ file: path, message: unsafe });
    else if (clash !== undefined) {
      problems.push({ file: path, message: `has the same name as '${clash}' (ignoring case)` });
    } else {
      keys.set(key, path);
      files.set(path, data);
    }
  };

  for (const [path, data] of player.files) add(path, data);
  if (!player.files.has(player.launchPage)) {
    problems.push({
      file: player.launchPage,
      message: "is the player's launch page but is missing",
    });
  }

  // Asset collector: every media index entry, as its optimised variant when it has one.
  const collected = new Set<string>();
  for (const key of packagedMediaKeys(course)) {
    const path = `${MEDIA_FOLDER}/${key}`;
    collected.add(path);
    const data = await input.media(key);
    if (data === undefined) {
      problems.push({ file: path, message: `is missing from the project (media file '${key}')` });
    } else add(path, data);
  }

  const fonts = await packagedFonts(course, input.fonts);
  problems.push(...fonts.problems);
  for (const file of fonts.files) add(file.path, file.data);

  const data = player.courseDataScript(
    courseDataFor(course, exporter.standard, packageVersion, exporter.lrs, fonts.fonts),
  );
  add(data.path, data.data);

  const content = [...files.keys()].sort();
  const described = exporter.describe({
    course,
    packageVersion,
    launchPage: player.launchPage,
    files: content,
  });
  if (!described.ok) return fail([...problems, ...described.problems]);
  for (const file of described.value) add(file.path, file.data);

  if (files.size > ZIP_MAX_ENTRIES) {
    problems.push({
      file: "",
      message: `has ${files.size} files; the limit is ${ZIP_MAX_ENTRIES}`,
    });
  }
  for (const [path, bytes] of files) {
    if (bytes.length > ZIP_MAX_BYTES) {
      problems.push({ file: path, message: `is larger than ${ZIP_MAX_BYTES} bytes` });
    }
  }

  const shipped = content.map((path) => [path, files.get(path) as Uint8Array] as const);
  const allowed = [
    ...urlsInStrings(course),
    ...(input.allowedUrls ?? []),
    ...(exporter.lrs ? [exporter.lrs.endpoint] : []),
  ];
  problems.push(...findModuleCode(shipped), ...findOutboundUrls(shipped, allowed, collected));
  if (problems.length > 0) return fail(problems);

  // The descriptor is checked against the files actually in the package, not the list it was given.
  const checked = exporter.check(files);
  if (checked.length > 0) return fail(checked);

  let zip: Uint8Array;
  try {
    zip = await writeZip([...files].map(([name, bytes]) => ({ name, data: bytes })));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return fail([{ file: "", message: error.message }]);
  }
  const warnings: PackageWarning[] = [];
  // Honest credential handling (ROADMAP.md note 14): encoding hides nothing, so the author is told.
  if (exporter.lrs?.auth) {
    warnings.push({
      code: "lrs-credentials",
      file: data.path,
      message:
        "holds LRS credentials that anyone with the package can read; use credentials that can only write statements and state, for this course only",
    });
  }
  const cap = resumeCapFor(exporter.standard);
  const largest = cap === undefined ? undefined : player.largestResume?.(course);
  if (cap !== undefined && largest) {
    // The player keeps the package version with the state (rise.md rule 12), so it counts too.
    for (const warning of checkResume(largest, { packageVersion: String(packageVersion), cap })) {
      const { code, size, dropped, message } = warning;
      warnings.push({ code: `resume-${code}`, file: "course", size, cap, dropped, message });
    }
  }
  return ok({ zip, files: [...files.keys()].sort(), warnings });
}

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/** Why `path` cannot be a package path on every OS and in every LMS, or undefined when it can. */
export function unsafePath(path: string): string | undefined {
  for (const segment of path.split("/")) {
    if (!/^[A-Za-z0-9._~-]+$/.test(segment)) {
      return "needs a relative path of letters, digits and . _ ~ - separated by /";
    }
    if (/^\.+$/.test(segment)) return "has a '.' or '..' path segment";
    if (segment.endsWith(".")) return "has a segment ending in a dot";
    if (RESERVED.test(segment)) return `uses the reserved Windows device name '${segment}'`;
  }
  return undefined;
}

/** A copy of `value` without `ext` properties, except inside open `variantSettings` data. */
function withoutExt<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutExt) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "ext")
      .map(([key, item]) => [key, key === "variantSettings" ? item : withoutExt(item)]),
  ) as T;
}

/** URLs the author wrote anywhere in the course: links, embeds, rich text (ADR-0004 row 3). */
function urlsInStrings(value: unknown): string[] {
  if (typeof value === "string") return urlsIn(value);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(urlsInStrings);
}
