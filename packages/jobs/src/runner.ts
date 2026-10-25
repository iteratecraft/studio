// The job runner (ENG-15, M2-06): submit, progress, cancel, retry and completion, with at most
// `concurrency` jobs running, and every state change persisted through the JobStore so jobs survive
// a restart. Where a job's work runs (a Web Worker on desktop) is up to its handler.
import {
  isFinished,
  type Job,
  type JobError,
  type JobFiles,
  type JobHandler,
  type JobProgress,
  type JobStore,
  jobError,
} from "./jobs.js";

/** How long cancel waits for a run to stop before it reports the job cancelled anyway (ENG-15). */
export const CANCEL_GRACE_MS = 2_000;

export interface JobRunnerOptions {
  store: JobStore;
  files: JobFiles;
  // biome-ignore lint/suspicious/noExplicitAny: each job type takes its own input.
  handlers: Readonly<Record<string, JobHandler<any, unknown>>>;
  /** Jobs that run at the same time. Default 2. */
  concurrency?: number;
  /** The folder that holds each run's temporary folder. Default `.jobs`. */
  tempFolder?: string;
  now?: () => number;
  /** A state change could not be persisted; the job carries on. Default console.error. */
  onError?: (error: unknown) => void;
}

/** `state`: the job moved to a new state, `progress`: it reported progress. */
export interface JobEvent {
  kind: "state" | "progress";
  job: Job;
}

export interface JobRunner {
  /** Queues a job of a type in `handlers` and persists it before resolving. */
  submit(type: string, input: unknown): Promise<Job>;
  /** Stops a queued or running job, removes its temporary output and marks it cancelled. */
  cancel(id: string): Promise<Job>;
  /** Queues a failed or cancelled job again. */
  retry(id: string): Promise<Job>;
  /** Removes a finished job from the runner and the store. */
  forget(id: string): Promise<void>;
  get(id: string): Job | undefined;
  /** Every job, oldest first. */
  list(): Job[];
  on(listener: (event: JobEvent) => void): () => void;
  /** Resolves with the job once it has succeeded, failed or been cancelled. */
  finished(id: string): Promise<Job>;
}

/** Fields to set; undefined clears progress, result or error. */
type Changes = Partial<Pick<Job, "state" | "runs">> & {
  progress?: JobProgress | undefined;
  result?: unknown;
  error?: JobError | undefined;
};

const INTERRUPTED = "The app closed while this job was running.";

/**
 * Opens a runner over the jobs in `store`. Temporary output left by a closed app is removed. A job
 * that was running starts again if its type is resumable, and otherwise fails with a message; a
 * job whose type has no handler fails. Queued jobs start.
 */
export async function openJobRunner(options: JobRunnerOptions): Promise<JobRunner> {
  const { store, files, handlers } = options;
  const concurrency = options.concurrency ?? 2;
  const tempFolder = options.tempFolder ?? ".jobs";
  const now = options.now ?? Date.now;
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a whole number from 1");
  }

  const jobs = new Map<string, Job>();
  const running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const listeners = new Set<(event: JobEvent) => void>();
  const waiting = new Map<string, ((job: Job) => void)[]>();
  let saving: Promise<void> = Promise.resolve();

  /** Store writes go one at a time, in the order the changes happened. */
  const persist = (job: Job) => {
    saving = saving.catch(() => {}).then(() => store.put(job));
    return saving;
  };
  const emit = (event: JobEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const change = (id: string, changes: Changes): Job => {
    const job = { ...(jobs.get(id) as Job), ...changes, updatedAt: now() };
    for (const key of ["progress", "result", "error"] as const) {
      if (job[key] === undefined) delete job[key];
    }
    jobs.set(id, job as Job);
    return job as Job;
  };
  /** Changes the state, persists it, then tells listeners and anyone waiting for the end. */
  const setState = async (id: string, changes: Changes) => {
    const job = change(id, changes);
    await persist(job);
    emit({ kind: "state", job });
    if (isFinished(job)) {
      for (const resolve of waiting.get(id) ?? []) resolve(job);
      waiting.delete(id);
    }
    return job;
  };
  const known = (id: string) => {
    const job = jobs.get(id);
    if (!job) throw new Error(`there is no job ${id}`);
    return job;
  };

  function pump() {
    for (const job of jobs.values()) {
      if (running.size >= concurrency) return;
      if (job.state === "queued" && !running.has(job.id)) start(job);
    }
  }

  function start(job: Job) {
    const handler = handlers[job.type] as JobHandler<unknown, unknown>;
    const controller = new AbortController();
    const { signal } = controller;
    const temp = `${tempFolder}/${job.id}`;
    const done = (async () => {
      let outcome: Changes | undefined;
      try {
        await setState(job.id, { state: "running", runs: job.runs + 1, progress: undefined });
        const result = await handler.run(job.input, {
          signal,
          temp,
          files,
          progress: (progress: JobProgress) => {
            if (signal.aborted || jobs.get(job.id)?.state !== "running") return;
            emit({ kind: "progress", job: change(job.id, { progress: { ...progress } }) });
          },
        });
        outcome = { state: "succeeded", result };
      } catch (error) {
        outcome = { state: "failed", error: jobError(error) };
      }
      // The temporary output goes before anyone hears the job ended. A folder that cannot be
      // removed now is removed when the next runner opens.
      await files.remove(temp).catch(onError);
      running.delete(job.id);
      // A cancelled job's end is reported by cancel.
      if (!signal.aborted) await setState(job.id, outcome);
    })()
      .catch(onError)
      .finally(pump);
    running.set(job.id, { controller, done });
  }

  // Restore: no job runs yet, so every temporary folder is left over from a closed app.
  await files.remove(tempFolder);
  const stored = (await store.list()).sort((a, b) => a.createdAt - b.createdAt);
  for (const job of stored) {
    jobs.set(job.id, job);
    if (isFinished(job)) continue;
    const handler = handlers[job.type];
    if (!handler) {
      await setState(job.id, {
        state: "failed",
        error: { message: `This app cannot run jobs of type "${job.type}".` },
      });
    } else if (job.state === "running") {
      await setState(
        job.id,
        handler.resumable === false
          ? { state: "failed", error: { message: INTERRUPTED } }
          : { state: "queued" },
      );
    }
  }
  pump();

  return {
    async submit(type, input) {
      if (!handlers[type]) throw new Error(`there is no handler for jobs of type "${type}"`);
      const at = now();
      const job: Job = {
        id: crypto.randomUUID(),
        type,
        input,
        state: "queued",
        runs: 0,
        createdAt: at,
        updatedAt: at,
      };
      jobs.set(job.id, job);
      await persist(job);
      emit({ kind: "state", job });
      pump();
      return jobs.get(job.id) as Job;
    },

    async cancel(id) {
      const job = known(id);
      if (isFinished(job)) return job;
      const run = running.get(id);
      if (run) {
        run.controller.abort();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          run.done,
          new Promise((resolve) => {
            timer = setTimeout(resolve, CANCEL_GRACE_MS);
          }),
        ]);
        clearTimeout(timer);
      }
      return setState(id, { state: "cancelled", progress: undefined });
    },

    async retry(id) {
      const job = known(id);
      if (job.state !== "failed" && job.state !== "cancelled") {
        throw new Error(`job ${id} is ${job.state}; only a failed or cancelled job is retried`);
      }
      const queued = await setState(id, {
        state: "queued",
        error: undefined,
        result: undefined,
        progress: undefined,
      });
      pump();
      return queued;
    },

    async forget(id) {
      const job = known(id);
      if (!isFinished(job)) throw new Error(`job ${id} is ${job.state}; cancel it first`);
      jobs.delete(id);
      saving = saving.catch(() => {}).then(() => store.remove(id));
      await saving;
    },

    get: (id) => jobs.get(id),
    list: () => [...jobs.values()],

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    finished(id) {
      const job = known(id);
      if (isFinished(job)) return Promise.resolve(job);
      return new Promise((resolve) => waiting.set(id, [...(waiting.get(id) ?? []), resolve]));
    },
  };
}
