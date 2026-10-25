# @course-suite/jobs

The job runner (M2-06, ENG-15): one job contract for the desktop and the future server, a runner
with progress, cancel, retry, completion, bounded concurrency and persisted state, Web Worker runs,
and the export job, its first job type. Apache-2.0. It runs in a browser, a Web Worker and Node.js
(ADR-0006) and reaches storage and files only through two ports.

## Using it

```ts
const runner = await openJobRunner({
  store, // JobStore
  files, // JobFiles
  handlers: {
    [EXPORT_JOB]: exportJob({
      load: async (source) => ({ course, media: (key) => readAsset(project, key) }),
      build: (build, context) =>
        runInWorker(
          () => new Worker(new URL("@course-suite/jobs/export-worker", import.meta.url), { type: "module" }),
          build,
          context,
        ),
    }),
  },
});
const job = await runner.submit(EXPORT_JOB, {
  source: "Safety.crs",
  standard: "scorm12",
  packageVersion: 3,
  output: "Safety-scorm12.zip",
});
runner.on(({ kind, job }) => { /* "state" or "progress" */ });
const done = await runner.finished(job.id); // succeeded, failed or cancelled
```

- **States:** `queued`, `running`, then `succeeded` (with `result`), `failed` (with `error`: a plain
  `message` and optional `details`) or `cancelled`. Every state change is persisted before
  listeners hear it; progress is reported but not persisted.
- **Concurrency:** at most `concurrency` jobs run at once (default 2), oldest first.
- **Cancel:** aborts the run's signal and waits up to `CANCEL_GRACE_MS` (2 s) for it to stop. A
  run in a worker stops at once: `runInWorker` terminates the worker.
- **Temporary output:** each run gets its own folder, `<tempFolder>/<job id>` (default `.jobs`),
  removed before the job is reported finished, whatever the outcome.
- **Restart:** `openJobRunner` removes every temporary folder, starts queued jobs, starts again a
  job that was running when the app closed (a new run from the beginning), or fails it with a
  message when its type is not `resumable`; a job whose type has no handler fails.
- **Retry and forget:** `retry` queues a failed or cancelled job again; `forget` removes a finished
  one from the runner and the store.
- **Export job:** reads each media file of the package (`packagedMediaKeys`), builds it with
  `build`, writes it into the run's temporary folder and renames it over `output`, so a cancelled
  or failed export never leaves a partial package. Its result carries the build's warnings, such
  as the long-resume warning (M2-07). `buildExport` builds in the current thread, for Node.js and
  the server; `@course-suite/jobs/export-worker` is the worker that runs it.

## Ports

```ts
interface JobStore {
  list(): Promise<Job[]>; // every job kept
  put(job: Job): Promise<void>; // create or replace by id
  remove(id: string): Promise<void>; // nothing happens when missing
}

interface JobFiles {
  write(path: string, data: Uint8Array): Promise<void>; // creates folders, flushes
  rename(from: string, to: string): Promise<void>; // one step, replaces `to`
  remove(path: string): Promise<void>; // a file, or a folder with everything in it
}
```

Paths are relative with forward slashes. `JobFiles` is a subset of the project container's
`ProjectFiles`, so one host implementation serves both. `memoryJobStore()` and `memoryJobFiles()`
are the in-memory implementations; `test/node.ts` holds the Node ones the tests use. The host
adapter (M2-02) provides the real ones in wave G. The runner writes to the store one change at a
time.

## Sizes

Measured with rolldown 1.2.13, minified ESM, on 2026-10-25:

| Bundle | Minified | Gzip |
|---|---|---|
| Page: runner and export job, with `runInWorker` | 6,259 B | 2,685 B |
| Export worker: exporters, player and schema files | 419,889 B | 110,322 B |

The worker is most of the weight: it carries the Blocks player (144 KB) and the SCORM schema files
(172 KB) that every package ships. The page loads it only when an export starts.

Limits: one export holds the course's media in memory twice while it builds (the page's copy and
the worker's); a job's input is persisted, so it holds references, never the course itself.
