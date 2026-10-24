// Blocks course packages for the browser tests: built by @course-suite/exporters with the real Blocks
// player, from the conformance corpus in a test-courses checkout or from the format's test fixtures.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blocksPlayer,
  buildPackage,
  type Exporter,
  scorm12Exporter,
  webExporter,
} from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { fullCourse, sampleCourse } from "@course-suite/format/test/courses";
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

/**
 * Every course of the Blocks conformance corpus when the test-courses checkout is present,
 * otherwise the format's test fixtures, all published as SCORM 1.2 (standards.md P-1).
 */
export const standardsCourses = (): TestCourse[] =>
  (corpusCourses() ?? fixtureCourses()).map((test) => ({
    ...test,
    course: asScorm12(test.course),
  }));

const asScorm12 = (course: Course): Course => ({
  ...course,
  publish: { ...course.publish, standard: "scorm12" },
});

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
    packageVersion: 1,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems, null, 2));
  return built.value.zip;
}

/** Builds and reads back a SCORM 1.2 package of `course`. */
export async function scorm12Package(
  course: Course,
  media?: TestCourse["media"],
): Promise<CoursePackage> {
  const read = readPackage(await blocksZip(course, scorm12Exporter(), media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

export const webZip = (course: Course) => blocksZip(course, webExporter());

/** Evaluated in a page: items in its local and session storage plus the length of its cookies. */
export const STORED = "localStorage.length + sessionStorage.length + document.cookie.length";
