// Packages for the real LMS and LRS jobs (M2-21): built the way the editor's publish panel exports
// them (M2-18), from the course's saved settings over the panel's defaults, so a host tests the
// package an author would upload.
import {
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  scorm12Exporter,
  scorm2004Exporter,
  xapiExporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import { type Course, exportCourseOf, nextPackageVersion } from "@course-suite/format";

const EXPORTERS = {
  scorm12: scorm12Exporter,
  scorm2004: scorm2004Exporter,
  xapi: xapiExporter,
  cmi5: cmi5Exporter,
} as const;

export type HostStandard = keyof typeof EXPORTERS;

/** `course` published to `standard` and exported as the editor does; returns the zip. */
export async function exportedZip(course: Course, standard: HostStandard): Promise<Uint8Array> {
  const source: Course = { ...course, publish: { ...course.publish, standard } };
  const built = await buildPackage({
    course: exportCourseOf(source),
    player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
    exporter: EXPORTERS[standard](),
    media: () => undefined,
    fonts: nodeFonts,
    packageVersion: nextPackageVersion(source),
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems, null, 2));
  return built.value.zip;
}
