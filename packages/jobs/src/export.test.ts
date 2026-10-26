// The export job (M2-06, ENG-15) in Node.js with the build in-process, as the server will run it.

import {
  blocksPlayer,
  buildPackage,
  packagedMediaKeys,
  scorm12Exporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import {
  buildExport,
  EXPORT_JOB,
  type ExportInput,
  exportJob,
  memoryJobFiles,
  memoryJobStore,
  openJobRunner,
} from "./index.js";

const standIn = (key: string) => new TextEncoder().encode(`stand-in for ${key}\n`);

async function setup(course: Course, media = standIn, load?: () => Promise<void>) {
  const files = memoryJobFiles();
  const runner = await openJobRunner({
    store: memoryJobStore(),
    files,
    handlers: {
      [EXPORT_JOB]: exportJob({
        load: async () => {
          await load?.();
          return { course, media: async (key) => media(key), fonts: nodeFonts };
        },
        build: buildExport,
      }),
    },
  });
  const input: ExportInput = {
    source: "Course.crs",
    standard: "scorm12",
    packageVersion: 1,
    output: "out/course-scorm12.zip",
  };
  return { files, runner, input };
}

describe("export job", () => {
  test("UI-PUBCOLLAB-R1: builds the package in the background and writes it where the author chose, byte for byte what buildPackage gives", async () => {
    const course = fullCourse();
    const { files, runner, input } = await setup(course);
    const progress: number[] = [];
    runner.on((event) => {
      if (event.kind === "progress") progress.push(event.job.progress?.done ?? -1);
    });
    const job = await runner.submit(EXPORT_JOB, input);
    const done = await runner.finished(job.id);
    const expected = await buildPackage({
      course,
      player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
      exporter: scorm12Exporter(),
      media: standIn,
      fonts: nodeFonts,
      packageVersion: 1,
    });
    if (!expected.ok) throw new Error(JSON.stringify(expected.problems));
    expect(done).toMatchObject({
      state: "succeeded",
      result: { output: input.output, size: expected.value.zip.length, warnings: [] },
    });
    expect(files.files.get(input.output)).toEqual(expected.value.zip);
    expect([...files.files.keys()]).toEqual([input.output]);
    const steps = packagedMediaKeys(course).length + 2;
    expect(progress).toEqual(Array.from({ length: steps }, (_, i) => i + 1));
  });

  test("a course that cannot be built fails with every problem, and writes nothing", async () => {
    const { files, runner, input } = await setup(fullCourse(), () => undefined as never);
    const job = await runner.submit(EXPORT_JOB, input);
    const done = await runner.finished(job.id);
    expect(done).toMatchObject({
      state: "failed",
      error: {
        message: expect.stringMatching(
          /^The package was not built: \d+ problems?, the first in media\//,
        ),
        details: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("is missing from the project"),
          }),
        ]),
      },
    });
    expect(files.files.size).toBe(0);
  });

  test("ENG-15: an export cancelled while it loads writes nothing", async () => {
    let loading: () => void = () => {};
    const loaded = new Promise<void>((resolve) => {
      loading = resolve;
    });
    let started: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { files, runner, input } = await setup(fullCourse(), standIn, async () => {
      started();
      await loaded;
    });
    const job = await runner.submit(EXPORT_JOB, input);
    await waiting;
    const cancel = runner.cancel(job.id);
    loading();
    expect(await cancel).toMatchObject({ state: "cancelled" });
    expect(files.files.size).toBe(0);
  });
});
