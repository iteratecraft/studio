// The job contract (ENG-15): what a job is, the two ports a runner needs, and what a job type
// implements. The desktop runs jobs in Web Workers and the server will run them from a queue; both
// keep this one contract.

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** Steps done so far, out of `total`. */
export interface JobProgress {
  done: number;
  total: number;
}

export interface JobError {
  /** Plain English for the author. */
  message: string;
  /** What the job type adds, such as the problems a build found. */
  details?: unknown;
}

/** One job as the runner keeps it and the store persists it. Treat it as read-only. */
export interface Job<Input = unknown, Result = unknown> {
  id: string;
  type: string;
  /** Plain data (structured-clone and JSON safe): it is persisted and may go to a worker. */
  input: Input;
  state: JobState;
  /** Runs started, the first included; a run that starts again after a restart counts too. */
  runs: number;
  /** Not persisted: after a restart a job reports progress again from its new run. */
  progress?: JobProgress;
  result?: Result;
  error?: JobError;
  /** Milliseconds since the epoch. */
  createdAt: number;
  updatedAt: number;
}

/** Port: where jobs are kept, so they outlive the app. Writes come one at a time. */
export interface JobStore {
  /** Every job kept, in any order. */
  list(): Promise<Job[]>;
  /** Creates or replaces the job with this id. */
  put(job: Job): Promise<void>;
  /** Deletes the job; nothing happens when it is not there. */
  remove(id: string): Promise<void>;
}

/**
 * Port: files for job output, by relative paths with forward slashes. The same contract as
 * `ProjectFiles` of @course-suite/project, so one host implementation serves both.
 */
export interface JobFiles {
  /** Creates or replaces the file, creating missing folders, and flushes it before resolving. */
  write(path: string, data: Uint8Array): Promise<void>;
  /** Moves `from` to `to` in one step, replacing `to`. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes the file, or the folder and everything in it; nothing happens when it does not exist. */
  remove(path: string): Promise<void>;
}

/** What a run of a job gets from the runner. */
export interface JobContext {
  /** Aborted when the job is cancelled: stop soon, the runner waits at most CANCEL_GRACE_MS. */
  signal: AbortSignal;
  progress(progress: JobProgress): void;
  /** A folder of this run's own for temporary output; the runner removes it however the run ends. */
  temp: string;
  files: JobFiles;
}

/** A job type. */
export interface JobHandler<Input = never, Result = unknown> {
  /** One run. Throw a JobFailure for an author-facing reason; the result must be plain data. */
  run(input: Input, context: JobContext): Promise<Result>;
  /** Whether a run cut short by a restart starts again from the beginning. Default true. */
  resumable?: boolean;
}

/** A job failed for a reason the author should see. */
export class JobFailure extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "JobFailure";
  }
}

export function jobError(error: unknown): JobError {
  if (error instanceof JobFailure) {
    return error.details === undefined
      ? { message: error.message }
      : { message: error.message, details: error.details };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

export const isFinished = (job: Job) =>
  job.state === "succeeded" || job.state === "failed" || job.state === "cancelled";

/** Jobs held in memory, for tests and previews; each job is copied in and out as a store would. */
export function memoryJobStore(): JobStore & { jobs: Map<string, Job> } {
  const jobs = new Map<string, Job>();
  return {
    jobs,
    list: async () => [...jobs.values()].map((job) => structuredClone(job)),
    async put(job) {
      jobs.set(job.id, structuredClone(job));
    },
    async remove(id) {
      jobs.delete(id);
    },
  };
}

/** Job files held in memory, for tests and previews. `files` is every file by path. */
export function memoryJobFiles(): JobFiles & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async write(path, data) {
      files.set(path, data.slice());
    },
    async rename(from, to) {
      const data = files.get(from);
      if (!data) throw new Error(`${from} does not exist`);
      files.delete(from);
      files.set(to, data);
    },
    async remove(path) {
      for (const name of [...files.keys()]) {
        if (name === path || name.startsWith(`${path}/`)) files.delete(name);
      }
    },
  };
}
