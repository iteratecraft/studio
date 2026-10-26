// The files the preview frame runs (ENG-13): the plain web output of the course (STD-02) built in
// memory from the exporters' own pieces, never written to disk. Its player files are the bytes every
// published package ships, so the preview and the published course run the same code.
import {
  blocksPlayer,
  courseDataFor,
  type FontSource,
  MEDIA_FOLDER,
  packagedFonts,
  packagedMediaKeys,
} from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import type { PackageFile } from "./frame.js";

/** The bytes of a media file in the project, by storage key; undefined when it is missing. */
export type MediaSource = (key: string) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
export type { FontSource };

export interface PreviewPackage {
  /** The package's index page. */
  index: string;
  /** Every other file of the package. */
  files: PackageFile[];
}

/** Every preview is version 1 of its package, so the saved state survives a live update. */
const PACKAGE_VERSION = 1;

// The types a web server gives the files a Blocks package holds; the frame needs them for images
// such as SVG, which a browser does not sniff.
const TYPES: Record<string, string> = {
  avif: "image/avif",
  css: "text/css",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  png: "image/png",
  svg: "image/svg+xml",
  vtt: "text/vtt",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

const typeOf = (path: string, fallback = "") =>
  TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? fallback;

/**
 * The plain web package of `course`, in memory, with the fonts of its theme (ENG-08). A media file
 * or font the project cannot give is left out, so the player shows it as missing, as a package
 * built without it would.
 */
export async function previewPackage(
  course: Course,
  media: MediaSource,
  fonts: FontSource,
): Promise<PreviewPackage> {
  const player = blocksPlayer({ language: course.sourceLanguage ?? "en" });
  const themed = await packagedFonts(course, (font) =>
    Promise.resolve()
      .then(() => fonts(font))
      .catch(() => undefined),
  );
  const data = player.courseDataScript(
    courseDataFor(course, "web", PACKAGE_VERSION, undefined, themed.fonts),
  );
  const files: PackageFile[] = [];
  for (const [path, bytes] of player.files) {
    if (path !== player.launchPage) files.push([path, bytes, typeOf(path)]);
  }
  files.push([data.path, data.data, typeOf(data.path)]);
  for (const { path, data: bytes } of themed.files) files.push([path, bytes, typeOf(path)]);
  const keys = packagedMediaKeys(course);
  // A file the project cannot read shows as missing too; the rest of the course still shows.
  const bytes = await Promise.all(
    keys.map((key) =>
      Promise.resolve()
        .then(() => media(key))
        .catch(() => undefined),
    ),
  );
  keys.forEach((key, i) => {
    const file = bytes[i];
    const type = course.media.find((entry) => (entry.variantKey ?? entry.key) === key)?.mimeType;
    if (file) files.push([`${MEDIA_FOLDER}/${key}`, file, typeOf(key, type)]);
  });
  const index = new TextDecoder().decode(player.files.get(player.launchPage));
  return { index, files };
}
