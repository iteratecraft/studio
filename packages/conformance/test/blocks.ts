// Blocks course packages for the browser tests: built by @course-suite/exporters with the real Blocks
// player, from the conformance corpus in a test-courses checkout or from the format's test fixtures.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  type Exporter,
  type Standard,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import { fullCourse, mediaCourse, sampleCourse } from "@course-suite/format/test/courses";
import { loadBlocksCorpus, TEST_COURSES_DIR } from "../src/corpus.js";
import { type CoursePackage, readPackage } from "../src/package.js";

/** The root of the studio checkout. */
export const ROOT = join(import.meta.dirname, "..", "..", "..");

export interface TestCourse {
  /** `corpus/<folder>` or `fixtures/<name>`. */
  name: string;
  course: Course;
  /** A media file's bytes by storage key. */
  media(key: string): Uint8Array | undefined;
}

/** A stand-in for a media file the fixtures name but do not ship: an SVG drawing, or a few bytes. */
const standIn = (key: string) =>
  new TextEncoder().encode(
    key.endsWith(".svg")
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3"/></svg>\n'
      : `stand-in for ${key}\n`,
  );

/** The format's test fixtures, with stand-ins for their media. */
export const fixtureCourses = (): TestCourse[] => [
  { name: "fixtures/sample", course: sampleCourse(), media: standIn },
  { name: "fixtures/full", course: fullCourse(), media: standIn },
  // Every media block (M2-13), with an embed that must load nothing until the learner asks.
  { name: "fixtures/media", course: mediaCourse(), media: standIn },
];

/** Every course of the Blocks conformance corpus (M1-28), or undefined without a test-courses checkout. */
export function corpusCourses(): TestCourse[] | undefined {
  return loadBlocksCorpus()?.map(({ name, text }) => ({
    name: `corpus/${name}`,
    course: JSON.parse(text) as Course,
    media: (key) => {
      const file = join(TEST_COURSES_DIR, "blocks", name, "media", key);
      return existsSync(file) ? readFileSync(file) : undefined;
    },
  }));
}

/** The standards the harness runs every course in. */
export type ScormStandard = "scorm12" | "scorm2004";

/**
 * Every course of the Blocks conformance corpus (M1-28) when the test-courses checkout is present,
 * otherwise the format's test fixtures, all published to `standard` (standards.md P-1).
 */
export const standardsCourses = (standard: Standard = "scorm12"): TestCourse[] =>
  (corpusCourses() ?? fixtureCourses()).map((test) => ({
    ...test,
    course: { ...test.course, publish: { ...test.course.publish, standard } },
  }));

/** Builds `course` with the Blocks player and returns the zip. */
export async function blocksZip(
  course: Course,
  exporter: Exporter,
  media: TestCourse["media"] = standIn,
): Promise<Uint8Array> {
  const built = await buildPackage({
    course,
    player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
    exporter,
    media,
    fonts: nodeFonts,
    packageVersion: 1,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems, null, 2));
  return built.value.zip;
}

/** Builds and reads back a SCORM 1.2 package of `course`. */
export const scorm12Package = (course: Course, media?: TestCourse["media"]) =>
  scormPackage(course, scorm12Exporter(), media);

/** Builds and reads back a SCORM 2004 4th edition package of `course`. */
export const scorm2004Package = (course: Course, media?: TestCourse["media"]) =>
  scormPackage(course, scorm2004Exporter(), media);

async function scormPackage(
  course: Course,
  exporter: Exporter,
  media?: TestCourse["media"],
): Promise<CoursePackage> {
  const read = await readPackage(await blocksZip(course, exporter, media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

/** Builds and reads back an xAPI package of `course`. */
export async function xapiPackage(
  course: Course,
  media?: TestCourse["media"],
  exporter = xapiExporter(),
): Promise<CoursePackage> {
  const read = await readPackage(await blocksZip(course, exporter, media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

/** Builds and reads back a cmi5 package of `course`. */
export async function cmi5Package(
  course: Course,
  media?: TestCourse["media"],
): Promise<CoursePackage> {
  const read = await readPackage(await blocksZip(course, cmi5Exporter(), media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

export const webZip = (course: Course) => blocksZip(course, webExporter());

/** Evaluated in a page: items in its local and session storage plus the length of its cookies. */
export const STORED = "localStorage.length + sessionStorage.length + document.cookie.length";
