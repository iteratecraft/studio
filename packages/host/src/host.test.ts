import { describe, expect, test } from "vitest";
import {
  checkDataName,
  createBrowserHost,
  createJobs,
  createMemoryHost,
  HostError,
  type KeyValueStore,
} from "./index.js";

const bytes = (text: string) => new TextEncoder().encode(text);

function mapStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe("checkDataName", () => {
  test.each(["settings.json", "autosave/course-1.zip", "a_b-c.d"])("accepts %s", (name) => {
    expect(checkDataName(name)).toEqual(name.split("/"));
  });

  test.each([
    "",
    "..",
    "../x",
    "a/../b",
    ".hidden",
    "a//b",
    "/abs",
    "a\\b",
    "C:/x",
    "a b",
    "x".repeat(101),
  ])("rejects %j", (name) => {
    expect(() => checkDataName(name)).toThrow(HostError);
  });
});

describe("memory host", () => {
  test("reads and writes only files the user picked or app data files", async () => {
    const host = createMemoryHost({
      files: [["docs/course.zip", bytes("old")]],
      onPickOpen: () => ["docs/course.zip"],
    });
    const unpicked = { id: "docs/course.zip", name: "course.zip" };
    await expect(host.files.read(unpicked)).rejects.toMatchObject({ code: "not-allowed" });

    const [file] = await host.files.pickOpen();
    expect(file).toEqual(unpicked);
    expect(new TextDecoder().decode(await host.files.read(unpicked))).toBe("old");
    await host.files.write(unpicked, bytes("new"));
    expect(new TextDecoder().decode(host.disk.get("docs/course.zip"))).toBe("new");

    const data = await host.files.dataFile("autosave/a.json");
    expect(data.name).toBe("a.json");
    await host.files.write(data, bytes("{}"));
    expect(await host.files.read(data)).toEqual(bytes("{}"));
  });

  test("cancelled dialogs give an empty list and null", async () => {
    const host = createMemoryHost({ onPickSave: () => null });
    expect(await host.files.pickOpen({ multiple: true })).toEqual([]);
    expect(await host.files.pickSave({ suggestedName: "x.zip" })).toBeNull();
  });

  test("the save dialog defaults to the suggested name and grants it", async () => {
    const host = createMemoryHost();
    const file = await host.files.pickSave({ suggestedName: "course.zip" });
    expect(file).toEqual({ id: "course.zip", name: "course.zip" });
    if (file) await host.files.write(file, bytes("x"));
    expect(host.disk.has("course.zip")).toBe(true);
  });

  test("written bytes are copied, so later changes to the buffer do not reach the file", async () => {
    const host = createMemoryHost();
    const file = await host.files.dataFile("a.bin");
    const data = bytes("abc");
    await host.files.write(file, data);
    data[0] = 0;
    expect(await host.files.read(file)).toEqual(bytes("abc"));
  });

  test("storage keeps values and forgets deleted ones", async () => {
    const { storage } = createMemoryHost();
    expect(await storage.get("recent")).toBeUndefined();
    await storage.set("recent", "[]");
    expect(await storage.get("recent")).toBe("[]");
    await storage.delete("recent");
    expect(await storage.get("recent")).toBeUndefined();
  });
});

describe("jobs", () => {
  test("runs a handler and passes its progress on", async () => {
    const jobs = createJobs({
      double: async (input, { progress }) => {
        progress(1, 1);
        return (input as number) * 2;
      },
    });
    const seen: unknown[] = [];
    const result = await jobs.run(
      { kind: "double", input: 21 },
      { onProgress: (p) => seen.push(p) },
    );
    expect(result).toBe(42);
    expect(seen).toEqual([{ done: 1, total: 1 }]);
  });

  test("refuses an unknown kind, including names inherited from Object", async () => {
    const jobs = createJobs({});
    for (const kind of ["export", "toString"]) {
      await expect(jobs.run({ kind, input: null })).rejects.toMatchObject({ code: "unsupported" });
    }
  });

  test("settles as aborted even when the handler ignores the signal", async () => {
    const jobs = createJobs({ forever: () => new Promise(() => {}) });
    const controller = new AbortController();
    const running = jobs.run({ kind: "forever", input: null }, { signal: controller.signal });
    controller.abort(new Error("stop"));
    await expect(running).rejects.toThrow("stop");
  });

  test("does not start when the signal is already aborted", async () => {
    let started = false;
    const jobs = createJobs({
      once: async () => {
        started = true;
      },
    });
    const signal = AbortSignal.abort(new Error("cancelled"));
    await expect(jobs.run({ kind: "once", input: null }, { signal })).rejects.toThrow("cancelled");
    expect(started).toBe(false);
  });
});

describe("browser host", () => {
  test("reports the server edition, keeps storage under its own prefix, refuses files", async () => {
    const store = mapStore();
    const host = createBrowserHost({ name: "Course Suite", version: "1.2.3" }, store);
    expect(await host.appInfo()).toEqual({
      name: "Course Suite",
      version: "1.2.3",
      edition: "server",
    });
    await host.storage.set("theme", "dark");
    expect([...store.map]).toEqual([["course-suite:theme", "dark"]]);
    await expect(host.files.pickOpen()).rejects.toMatchObject({ code: "unsupported" });
  });
});
