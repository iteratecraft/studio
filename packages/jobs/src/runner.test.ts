// ENG-15 done-when and the runner contract (M2-06): progress, completion, bounded concurrency,
// cancel within 2 s with temporary output removed, retry, and jobs that survive a restart.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { nodeJobFiles, nodeJobStore } from "../test/node.js";
import {
  CANCEL_GRACE_MS,
  type Job,
  type JobEvent,
  JobFailure,
  type JobHandler,
  memoryJobFiles,
  memoryJobStore,
  openJobRunner,
} from "./index.js";

const CHILD = fileURLToPath(new URL("../test/run-child.ts", import.meta.url));

/** A job type whose runs write temporary output, then wait until released or cancelled. */
function gate() {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const count = { started: 0, running: 0, most: 0 };
  const handler: JobHandler<{ name: string }, string> = {
    async run(input, { signal, temp, files, progress }) {
      count.started++;
      count.most = Math.max(count.most, ++count.running);
      try {
        await files.write(`${temp}/part.bin`, new Uint8Array(8));
        progress({ done: 1, total: 2 });
        const stopped = new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        );
        await Promise.race([released, stopped]);
        return `built ${input.name}`;
      } finally {
        count.running--;
      }
    },
  };
  return { handler, release: () => release(), count };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 500 && !check(); i++) await new Promise((r) => setTimeout(r, 2));
  expect(check()).toBe(true);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("job runner", () => {
  test("UI-PUBCOLLAB-R1: a job runs in the background, reports progress and notifies its completion", async () => {
    const store = memoryJobStore();
    const files = memoryJobFiles();
    const { handler, release } = gate();
    const runner = await openJobRunner({ store, files, handlers: { build: handler } });
    const events: string[] = [];
    runner.on((event: JobEvent) =>
      events.push(
        event.kind === "state" ? event.job.state : `progress ${event.job.progress?.done}`,
      ),
    );
    const job = await runner.submit("build", { name: "course" });
    await until(() => runner.get(job.id)?.progress?.done === 1);
    expect(files.files.has(`.jobs/${job.id}/part.bin`)).toBe(true);
    release();
    const done = await runner.finished(job.id);
    expect(done).toMatchObject({ state: "succeeded", result: "built course", runs: 1 });
    expect(events).toEqual(["queued", "running", "progress 1", "succeeded"]);
    expect(store.jobs.get(job.id)).toMatchObject({ state: "succeeded", result: "built course" });
    // The run's temporary folder is gone once it ends.
    expect([...files.files.keys()]).toEqual([]);
  });

  test("runs at most `concurrency` jobs at once, oldest first", async () => {
    const { handler, release, count } = gate();
    const runner = await openJobRunner({
      store: memoryJobStore(),
      files: memoryJobFiles(),
      handlers: { build: handler },
      concurrency: 2,
    });
    const jobs: Job[] = [];
    for (const name of ["a", "b", "c", "d", "e"]) jobs.push(await runner.submit("build", { name }));
    await until(() => count.started === 2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runner.list().map((job) => job.state)).toEqual([
      "running",
      "running",
      "queued",
      "queued",
      "queued",
    ]);
    release();
    await Promise.all(jobs.map((job) => runner.finished(job.id)));
    expect(count).toMatchObject({ started: 5, most: 2 });
  });

  test("ENG-15: cancel stops a running job within 2 s and removes its temporary output", async () => {
    const files = memoryJobFiles();
    const { handler } = gate();
    const runner = await openJobRunner({
      store: memoryJobStore(),
      files,
      handlers: { build: handler },
    });
    const job = await runner.submit("build", { name: "course" });
    await until(() => files.files.size === 1);
    const started = performance.now();
    const cancelled = await runner.cancel(job.id);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(cancelled).toMatchObject({ state: "cancelled" });
    expect(cancelled).not.toHaveProperty("progress");
    expect([...files.files.keys()]).toEqual([]);
    expect(await runner.finished(job.id)).toBe(cancelled);
  });

  test("cancel stops waiting for a job that ignores it after the grace period", async () => {
    vi.useFakeTimers();
    const runner = await openJobRunner({
      store: memoryJobStore(),
      files: memoryJobFiles(),
      handlers: { stuck: { run: () => new Promise(() => {}) } },
    });
    const job = await runner.submit("stuck", {});
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.get(job.id)?.state).toBe("running");
    const cancelled = runner.cancel(job.id);
    await vi.advanceTimersByTimeAsync(CANCEL_GRACE_MS);
    expect(await cancelled).toMatchObject({ state: "cancelled" });
  });

  test("a queued job that is cancelled never runs", async () => {
    const { handler, release, count } = gate();
    const runner = await openJobRunner({
      store: memoryJobStore(),
      files: memoryJobFiles(),
      handlers: { build: handler },
      concurrency: 1,
    });
    const first = await runner.submit("build", { name: "a" });
    const second = await runner.submit("build", { name: "b" });
    expect(await runner.cancel(second.id)).toMatchObject({ state: "cancelled" });
    release();
    await runner.finished(first.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(count.started).toBe(1);
  });

  test("a failed job keeps its reason, a retry runs it again, and forget removes it", async () => {
    let calls = 0;
    const store = memoryJobStore();
    const runner = await openJobRunner({
      store,
      files: memoryJobFiles(),
      handlers: {
        flaky: {
          async run() {
            calls++;
            if (calls === 1) throw new JobFailure("The disk is full.", { free: 0 });
            return "done";
          },
        },
      },
    });
    const job = await runner.submit("flaky", {});
    expect(await runner.finished(job.id)).toMatchObject({
      state: "failed",
      error: { message: "The disk is full.", details: { free: 0 } },
    });
    await expect(runner.retry(job.id)).resolves.toMatchObject({ state: "queued" });
    const done = await runner.finished(job.id);
    expect(done).toMatchObject({ state: "succeeded", result: "done", runs: 2 });
    expect(done).not.toHaveProperty("error");
    await runner.forget(job.id);
    expect(runner.get(job.id)).toBeUndefined();
    expect(store.jobs.size).toBe(0);
  });

  test("refuses unknown job types, a bad concurrency, and retrying or forgetting a job that has not ended", async () => {
    const { handler } = gate();
    const options = {
      store: memoryJobStore(),
      files: memoryJobFiles(),
      handlers: { build: handler },
    };
    await expect(openJobRunner({ ...options, concurrency: 0 })).rejects.toThrow(RangeError);
    const runner = await openJobRunner(options);
    await expect(runner.submit("print", {})).rejects.toThrow(/no handler/);
    const job = await runner.submit("build", { name: "a" });
    await expect(runner.retry(job.id)).rejects.toThrow(/only a failed or cancelled/);
    await expect(runner.forget(job.id)).rejects.toThrow(/cancel it first/);
    await runner.cancel(job.id);
  });
});

describe("restart", () => {
  const stored = (job: Partial<Job>): Job => ({
    id: crypto.randomUUID(),
    type: "build",
    input: { name: "course" },
    state: "running",
    runs: 1,
    createdAt: 1,
    updatedAt: 1,
    ...job,
  });

  test("ENG-15: a job cut short by a restart starts again, a queued one starts, and leftovers are removed", async () => {
    const store = memoryJobStore();
    const files = memoryJobFiles();
    const cut = stored({});
    const queued = stored({ state: "queued", runs: 0, createdAt: 2 });
    const done = stored({ state: "succeeded", result: "old", createdAt: 3 });
    for (const job of [cut, queued, done]) await store.put(job);
    await files.write(`.jobs/${cut.id}/part.bin`, new Uint8Array(4));
    const runner = await openJobRunner({
      store,
      files,
      handlers: { build: { run: async () => "again" } },
    });
    expect(await runner.finished(cut.id)).toMatchObject({ state: "succeeded", runs: 2 });
    expect(await runner.finished(queued.id)).toMatchObject({ state: "succeeded", runs: 1 });
    expect(runner.get(done.id)).toMatchObject({ result: "old" });
    expect([...files.files.keys()]).toEqual([]);
  });

  test("ENG-15: a job that cannot resume, or whose type this app lacks, fails cleanly with a reason", async () => {
    const store = memoryJobStore();
    const cut = stored({});
    const foreign = stored({ type: "narrate", state: "queued" });
    for (const job of [cut, foreign]) await store.put(job);
    const runner = await openJobRunner({
      store,
      files: memoryJobFiles(),
      handlers: { build: { run: async () => "", resumable: false } },
    });
    expect(runner.get(cut.id)).toMatchObject({
      state: "failed",
      error: { message: "The app closed while this job was running." },
    });
    expect(runner.get(foreign.id)).toMatchObject({
      state: "failed",
      error: { message: expect.stringContaining("narrate") },
    });
    expect(store.jobs.get(cut.id)?.state).toBe("failed");
  });

  test("ENG-15: a job survives the app being killed mid-run and resumes in the next one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jobs-kill-"));
    try {
      const child = spawn(process.execPath, [CHILD, dir], { stdio: ["ignore", "pipe", "pipe"] });
      let errors = "";
      child.stderr.on("data", (chunk) => {
        errors += chunk;
      });
      const exited = new Promise((resolve) => child.once("exit", resolve));
      await Promise.race([
        new Promise((resolve) => child.stdout.once("data", resolve)),
        exited.then(() => Promise.reject(new Error(`the child stopped by itself: ${errors}`))),
      ]);
      child.kill("SIGKILL");
      await exited;
      const [left] = await nodeJobStore(join(dir, "store")).list();
      expect(left).toMatchObject({ state: "running", runs: 1 });
      const id = left?.id ?? "";
      expect(existsSync(join(dir, ".jobs", id, "part.bin"))).toBe(true);

      const runner = await openJobRunner({
        store: nodeJobStore(join(dir, "store")),
        files: nodeJobFiles(dir),
        handlers: { slow: { run: async (input: { note: string }) => input.note } },
      });
      expect(await runner.finished(id)).toMatchObject({
        state: "succeeded",
        runs: 2,
        result: "survives a restart",
      });
      expect(existsSync(join(dir, ".jobs"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 30_000);
});
