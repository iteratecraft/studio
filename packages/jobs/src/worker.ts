// Runs a job's work in a Web Worker (ADR-0006: long tasks run in workers on desktop). The page side
// starts one worker per run and terminates it on cancel, which stops the work at once; the worker
// side serves one run with serveJob.
import { type JobContext, type JobError, JobFailure, type JobProgress, jobError } from "./jobs.js";

/** What a worker posts back. */
export type WorkerMessage<Result> =
  | { kind: "progress"; progress: JobProgress }
  | { kind: "result"; result: Result }
  | { kind: "error"; error: JobError };

/**
 * Posts `input` to a new worker from `spawn` and resolves with its result. Aborting `signal`
 * terminates the worker and rejects. The input is copied, never transferred, so the caller's
 * buffers stay usable.
 */
export function runInWorker<Input, Result>(
  spawn: () => Worker,
  input: Input,
  { signal, progress }: Pick<JobContext, "signal" | "progress">,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const worker = spawn();
    const stop = () => {
      worker.terminate();
      signal.removeEventListener("abort", aborted);
    };
    const aborted = () => {
      stop();
      reject(signal.reason);
    };
    signal.addEventListener("abort", aborted, { once: true });
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage<Result>>) => {
      if (data.kind === "progress") return progress(data.progress);
      stop();
      if (data.kind === "result") resolve(data.result);
      else reject(new JobFailure(data.error.message, data.error.details));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      stop();
      reject(new Error(event.message || "the job's worker failed to load or crashed"));
    };
    worker.onmessageerror = () => {
      stop();
      reject(new Error("the job's worker sent a message that could not be read"));
    };
    worker.postMessage(input);
  });
}

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

/**
 * In a worker script: runs `run` on the input the page posts and posts back its progress and its
 * result, or the error. `transfer` names buffers of the result to move rather than copy.
 */
export function serveJob<Input, Result>(
  run: (input: Input, context: Pick<JobContext, "progress">) => Promise<Result>,
  transfer: (result: Result) => Transferable[] = () => [],
): void {
  const scope = globalThis as unknown as WorkerScope;
  const post = (message: WorkerMessage<Result>, moved?: Transferable[]) =>
    scope.postMessage(message, moved);
  scope.onmessage = async ({ data }: MessageEvent<Input>) => {
    try {
      const result = await run(data, {
        progress: (progress) => post({ kind: "progress", progress }),
      });
      post({ kind: "result", result }, transfer(result));
    } catch (error) {
      post({ kind: "error", error: jobError(error) });
    }
  };
}
