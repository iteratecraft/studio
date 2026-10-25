// Builds an export in the current thread: what the export worker runs, and what Node.js (tests,
// the server) passes to exportJob as `build`.
import {
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  type Exporter,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "@course-suite/exporters";
import type { ExportBuild, ExportBuilt, ExportOptions } from "./export.js";
import { JobFailure } from "./jobs.js";

function exporterFor(standard: ExportBuild["standard"], options: ExportOptions): Exporter {
  switch (standard) {
    case "scorm12":
      return scorm12Exporter(options);
    case "scorm2004":
      return scorm2004Exporter(options);
    case "xapi":
      return xapiExporter(options);
    case "cmi5":
      return cmi5Exporter();
    case "web":
      return webExporter();
  }
}

/** Builds the package; a course that cannot be built fails with the problems as details. */
export async function buildExport(build: ExportBuild): Promise<ExportBuilt> {
  const { course } = build;
  const result = await buildPackage({
    course,
    player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
    exporter: exporterFor(build.standard, build.options ?? {}),
    media: (key) => build.media[key],
    packageVersion: build.packageVersion,
    ...(build.allowedUrls && { allowedUrls: build.allowedUrls }),
  });
  if (!result.ok) {
    const [first] = result.problems;
    const count = result.problems.length;
    throw new JobFailure(
      `The package was not built: ${count} ${count === 1 ? "problem" : "problems"}, the first in ${first?.file || "the package"}: ${first?.message}.`,
      result.problems,
    );
  }
  return { zip: result.value.zip, warnings: result.value.warnings };
}
