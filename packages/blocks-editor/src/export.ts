// Export from the editor (M2-18, BLK-10, STD-08; blocks-publish-collab.md W1, W3, A14,
// UI-PUBCOLLAB-R1): the export job of @course-suite/jobs, run in the background with progress and
// cancel, building in a Web Worker the app provides (ADR-0006), and writing the package to the file
// the author picked in the host's save dialog. The job writes into memory and moves the finished
// package to that file in one atomic host write, so a cancelled or failed export leaves no file.
import type { Course, Standard } from "@course-suite/format";
import type { FileRef, HostInterface } from "@course-suite/host";
import {
  EXPORT_JOB,
  type ExportBuild,
  type ExportBuilt,
  type ExportInput,
  type ExportResult,
  type ExportSource,
  exportJob,
  type Job,
  type JobFiles,
  type JobProgress,
  type JobRunner,
  memoryJobStore,
  openJobRunner,
} from "@course-suite/jobs";

/** Builds a package where the app puts it: in a Web Worker on desktop and in the browser. */
export type ExportBuilder = (
  build: ExportBuild,
  context: { signal: AbortSignal; progress: (progress: JobProgress) => void },
) => Promise<ExportBuilt>;

export type ExportJob = Job<ExportInput, ExportResult>;

/** One export on its way: its progress as it goes, and how it ended. */
export interface ExportRun {
  readonly id: string;
  /** Resolves once the export succeeded, failed or was cancelled. */
  readonly finished: Promise<ExportJob>;
  cancel(): void;
}

const OUTPUT = "out/";

/** The exports of one editor window. */
export class Exports {
  readonly #runner: Promise<JobRunner>;
  readonly #sources = new Map<string, ExportSource>();
  readonly #outputs = new Map<string, FileRef>();
  #next = 0;

  constructor(host: HostInterface, build: ExportBuilder) {
    const parts = new Map<string, Uint8Array>();
    const outputs = this.#outputs;
    // Job output: the run's temporary file in memory, then the picked file in one atomic write.
    const files: JobFiles = {
      async write(path, data) {
        parts.set(path, data);
      },
      async rename(from, to) {
        const data = parts.get(from);
        const file = outputs.get(to);
        if (!data || !file) throw new Error(`Nothing to move from ${from} to ${to}`);
        await host.files.write(file, data);
        parts.delete(from);
        outputs.delete(to);
      },
      async remove(path) {
        for (const key of [...parts.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) parts.delete(key);
        }
      },
    };
    this.#runner = openJobRunner({
      store: memoryJobStore(),
      files,
      concurrency: 1,
      handlers: {
        [EXPORT_JOB]: {
          // A course closed with the app is not exported again at the next start.
          resumable: false,
          ...exportJob({
            load: async (source) => {
              const found = this.#sources.get(source);
              if (!found) throw new Error("The course to export is no longer open.");
              return found;
            },
            build,
          }),
        },
      },
    });
  }

  /**
   * Exports `course` as a package for `standard` to `file`. `onProgress` hears each step; the run
   * resolves once the package is written, or the export failed or was cancelled.
   */
  async start(
    course: Course,
    source: Omit<ExportSource, "course">,
    standard: Standard,
    packageVersion: number,
    file: FileRef,
    onProgress: (progress: JobProgress) => void,
  ): Promise<ExportRun> {
    const runner = await this.#runner;
    const token = String(++this.#next);
    this.#sources.set(token, { ...source, course });
    this.#outputs.set(`${OUTPUT}${token}`, file);
    const input: ExportInput = {
      source: token,
      standard,
      packageVersion,
      output: `${OUTPUT}${token}`,
    };
    const job = await runner.submit(EXPORT_JOB, input);
    const stop = runner.on(({ kind, job: changed }) => {
      if (kind === "progress" && changed.id === job.id && changed.progress) {
        onProgress(changed.progress);
      }
    });
    const finished = runner.finished(job.id).then((done) => {
      stop();
      this.#sources.delete(token);
      this.#outputs.delete(`${OUTPUT}${token}`);
      void runner.forget(done.id);
      return done as ExportJob;
    });
    return {
      id: job.id,
      finished,
      cancel: () => void runner.cancel(job.id).catch(() => {}),
    };
  }
}
