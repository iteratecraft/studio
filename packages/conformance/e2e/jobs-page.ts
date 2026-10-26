// The page side of the desktop export flow, bundled for Chromium by jobs-worker.e2e.ts: a job
// runner whose export job builds in the export worker, as the app wires it (ADR-0006, M2-06).
import type { Standard } from "@course-suite/exporters";
import { type Course, fontKey } from "@course-suite/format";
import {
  EXPORT_JOB,
  exportJob,
  memoryJobFiles,
  memoryJobStore,
  openJobRunner,
  runInWorker,
} from "@course-suite/jobs";

export interface PageCourse {
  name: string;
  course: Course;
  /** Base64 bytes of each media file by storage key. */
  media: Record<string, string>;
  /** The theme's and the default fonts by font key: name and base64 bytes of each face. */
  fonts: Record<
    string,
    { name: string; regular: string; bold?: string | undefined; italic?: string | undefined }
  >;
}

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Exports every course to `standard` in the export worker: the SHA-256 of each package by name. */
async function exportAll(courses: PageCourse[], standard: Standard) {
  const files = memoryJobFiles();
  const runner = await openJobRunner({
    store: memoryJobStore(),
    files,
    handlers: {
      [EXPORT_JOB]: exportJob({
        load: async (source) => {
          const { course, media, fonts } = courses.find((c) => c.name === source) as PageCourse;
          return {
            course,
            media: async (key) => (media[key] ? bytes(media[key]) : undefined),
            fonts: (font) => {
              const found = fonts[fontKey(font)];
              if (!found) return undefined;
              const { name, regular, bold, italic } = found;
              return {
                name,
                regular: bytes(regular),
                bold: bold === undefined ? undefined : bytes(bold),
                italic: italic === undefined ? undefined : bytes(italic),
              };
            },
          };
        },
        build: (build, context) =>
          runInWorker(() => new Worker("/export-worker.js", { type: "module" }), build, context),
      }),
    },
  });
  const hashes: Record<string, string> = {};
  for (const { name } of courses) {
    const output = `out/${Object.keys(hashes).length}.zip`;
    const job = await runner.submit(EXPORT_JOB, {
      source: name,
      standard,
      packageVersion: 1,
      output,
    });
    const done = await runner.finished(job.id);
    if (done.state !== "succeeded") throw new Error(`${name}: ${JSON.stringify(done.error)}`);
    hashes[name] = await sha256(files.files.get(output) as Uint8Array);
  }
  return hashes;
}

/**
 * Starts a job whose worker never stops computing, after it wrote temporary output, and cancels
 * it: how long cancel took, the job's state and the files left.
 */
async function cancelBusy() {
  const files = memoryJobFiles();
  let running: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    running = resolve;
  });
  const runner = await openJobRunner({
    store: memoryJobStore(),
    files,
    handlers: {
      busy: {
        async run(input: unknown, context) {
          await context.files.write(`${context.temp}/part.zip`, new Uint8Array(1024));
          running();
          return runInWorker(() => new Worker("/busy-worker.js"), input, context);
        },
      },
    },
  });
  const job = await runner.submit("busy", {});
  await started;
  // Let the worker start its loop.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const from = performance.now();
  const cancelled = await runner.cancel(job.id);
  return {
    ms: performance.now() - from,
    state: cancelled.state,
    files: [...files.files.keys()],
  };
}

(globalThis as { jobsPage?: unknown }).jobsPage = { exportAll, cancelBusy };
