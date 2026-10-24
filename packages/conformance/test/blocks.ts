// Blocks course packages for the browser tests: built by @course-suite/exporters with the real Blocks
// player, from the conformance corpus in a test-courses checkout or from the format's test fixtures.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blocksPlayer,
  buildPackage,
  type Exporter,
  type Standard,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { fullCourse, sampleCourse } from "@course-suite/format/test/courses";
import { type CoursePackage, readPackage } from "../src/package.js";

/** The root of the studio checkout. */
export const ROOT = join(import.meta.dirname, "..", "..", "..");
/** The test-courses checkout: `test-courses/` at the root of studio, git-ignored (AGENTS.md). */
export const TEST_COURSES = join(ROOT, "test-courses");

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

/** The standards the harness runs every course in. */
export type ScormStandard = "scorm12" | "scorm2004";

/**
 * Every course of the Blocks conformance corpus (M1-28) when the test-courses checkout is present,
 * otherwise the format's test fixtures, all published to `standard` (standards.md P-1).
 */
export function standardsCourses(standard: Standard = "scorm12"): TestCourse[] {
  const publish = (course: Course): Course => ({
    ...course,
    publish: { ...course.publish, standard },
  });
  const corpus = join(TEST_COURSES, "blocks");
  if (existsSync(corpus)) {
    return readdirSync(corpus, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((folder) => {
        const dir = join(corpus, folder);
        const course = JSON.parse(readFileSync(join(dir, "course.json"), "utf8")) as Course;
        return {
          name: `corpus/${folder}`,
          course: publish(course),
          media: (key) => {
            const file = join(dir, "media", key);
            return existsSync(file) ? readFileSync(file) : undefined;
          },
        };
      });
  }
  return [
    { name: "fixtures/sample", course: publish(sampleCourse()), media: standIn },
    { name: "fixtures/full", course: publish(fullCourse()), media: standIn },
  ];
}

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
  const read = readPackage(await blocksZip(course, exporter, media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

/** Builds and reads back an xAPI package of `course`. */
export async function xapiPackage(
  course: Course,
  media?: TestCourse["media"],
  exporter = xapiExporter(),
): Promise<CoursePackage> {
  const read = readPackage(await blocksZip(course, exporter, media));
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

export const webZip = (course: Course) => blocksZip(course, webExporter());

/** Evaluated in a page: items in its local and session storage plus the length of its cookies. */
export const STORED = "localStorage.length + sessionStorage.length + document.cookie.length";
