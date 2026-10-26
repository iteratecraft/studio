// The export job (ENG-15, STD-08, UI-PUBCOLLAB-R1): builds a course package in the background and
// writes it where the author chose. The page loads the course and its media; the build runs where
// `build` puts it: in a Web Worker on desktop (runInWorker with the export worker), in-process on
// Node.js (buildExport). Of the exporters this module takes only packagedMediaKeys, so a page that
// builds in a worker does not carry the exporters and the player too.

import {
  type FontSource,
  type PackageWarning,
  packagedMediaKeys,
  type Scorm12Options,
  type Standard,
  type XapiOptions,
} from "@course-suite/exporters";
import type { FontFiles } from "@course-suite/fonts";
import { type Course, fontKey, fontsOf } from "@course-suite/format";
import type { JobContext, JobHandler } from "./jobs.js";

export const EXPORT_JOB = "export";

/** An export job's input: references, never the course itself, because it is persisted. */
export interface ExportInput {
  /** The course to export, as `load` takes it, such as the project file's name. */
  source: string;
  standard: Standard;
  /** A whole number from 1, raised for every published update. */
  packageVersion: number;
  /** Where the package goes, as a JobFiles path. */
  output: string;
  options?: ExportOptions;
  /** Addresses the package may name besides those in the course (ADR-0004). */
  allowedUrls?: string[];
}

/** Options of the standard's exporter: typical learning time for SCORM, an LRS for xAPI. */
export type ExportOptions = Scorm12Options & XapiOptions;

/** What a build is given: plain data, so it can be posted to a worker. */
export interface ExportBuild {
  course: Course;
  standard: Standard;
  packageVersion: number;
  /** The bytes of every media file the package holds, by storage key (`packagedMediaKeys`). */
  media: Record<string, Uint8Array>;
  /** The files of the theme's fonts and of the default fonts, by font key (`fontKey`). */
  fonts: Record<string, FontFiles>;
  options?: ExportOptions;
  allowedUrls?: string[];
}

export interface ExportBuilt {
  zip: Uint8Array;
  warnings: PackageWarning[];
}

export interface ExportResult {
  output: string;
  /** Size of the package in bytes. */
  size: number;
  /** For the author before sharing the package, such as a long-resume warning (M2-07). */
  warnings: PackageWarning[];
}

/** A course to export, as the host opens it. */
export interface ExportSource {
  course: Course;
  /** A media file's bytes by storage key; undefined when the project lacks it. */
  media(key: string): Promise<Uint8Array | undefined>;
  /** The files of a font: bundled, or from the author's font library (ENG-08). */
  fonts: FontSource;
}

export interface ExportJobOptions {
  load(source: string): Promise<ExportSource>;
  build(build: ExportBuild, context: Pick<JobContext, "signal" | "progress">): Promise<ExportBuilt>;
}

/**
 * The export job type. Progress counts each media file read, the build, and the write. The package
 * is written to the run's temporary folder, then renamed over `output`, so a cancelled or failed
 * export never leaves a partial package there.
 */
export function exportJob({
  load,
  build,
}: ExportJobOptions): JobHandler<ExportInput, ExportResult> {
  return {
    async run(input, { signal, progress, temp, files }) {
      const { course, media, fonts } = await load(input.source);
      const mediaKeys = packagedMediaKeys(course);
      const total = mediaKeys.length + 2;
      const bytes: Record<string, Uint8Array> = {};
      for (const [i, key] of mediaKeys.entries()) {
        signal.throwIfAborted();
        const data = await media(key);
        if (data) bytes[key] = data;
        progress({ done: i + 1, total });
      }
      // The theme's fonts, and the defaults that stand in for a custom font the library lost.
      const fontFiles: Record<string, FontFiles> = {};
      for (const font of [
        ...Object.values(fontsOf(course.theme)),
        ...Object.values(fontsOf(undefined)),
      ]) {
        const key = fontKey(font);
        const found = key in fontFiles ? undefined : await fonts(font);
        if (found) fontFiles[key] = found;
      }
      signal.throwIfAborted();
      const built = await build(
        {
          course,
          standard: input.standard,
          packageVersion: input.packageVersion,
          media: bytes,
          fonts: fontFiles,
          ...(input.options && { options: input.options }),
          ...(input.allowedUrls && { allowedUrls: input.allowedUrls }),
        },
        { signal, progress: () => {} },
      );
      progress({ done: total - 1, total });
      signal.throwIfAborted();
      const part = `${temp}/package.zip`;
      await files.write(part, built.zip);
      signal.throwIfAborted();
      await files.rename(part, input.output);
      progress({ done: total, total });
      return { output: input.output, size: built.zip.length, warnings: built.warnings };
    },
  };
}
