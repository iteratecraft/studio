import { HostError, type HostJobs, type JobOptions } from "./host.js";

/** Runs one kind of job. It reports progress and stops when the signal aborts. */
export type JobHandler = (
  input: unknown,
  context: { signal: AbortSignal; progress: (done: number, total: number) => void },
) => Promise<unknown>;

export type JobHandlers = Readonly<Record<string, JobHandler>>;

/**
 * Runs jobs in the calling thread. The in-memory and browser hosts use it, and the desktop app
 * until the job runner (M2-06) puts jobs in Web Workers.
 */
export function createJobs(handlers: JobHandlers): HostJobs {
  return {
    run: async ({ kind, input }, options: JobOptions = {}) => {
      const handler = Object.hasOwn(handlers, kind) ? handlers[kind] : undefined;
      if (!handler) throw new HostError("unsupported", `No job of kind ${JSON.stringify(kind)}`);
      const signal = options.signal ?? new AbortController().signal;
      signal.throwIfAborted();
      const progress = (done: number, total: number) => options.onProgress?.({ done, total });
      // A handler that ignores the signal still settles as aborted for the caller.
      let onAbort = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        return await Promise.race([handler(input, { signal, progress }), aborted]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
