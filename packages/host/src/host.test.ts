import { describe, expect, test } from "vitest";
import * as host from "./index.js";
import {
  checkDataName,
  checkFolderPath,
  createBrowserHost,
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

describe("checkFolderPath", () => {
  test.each(["Safety.crs", ".Safety.crs.autosave/3.crs", "Jörg's course.crs"])(
    "accepts %s",
    (path) => {
      expect(checkFolderPath(path)).toEqual(path.split("/"));
    },
  );

  test.each([
    "",
    ".",
    "..",
    "../x",
    "a/../b",
    "...",
    "a.",
    "a ",
    "a//b",
    "/abs",
    "a\\b",
    "C:x",
    "a\u0001b",
  ])("rejects %j", (path) => {
    expect(() => checkFolderPath(path)).toThrow(HostError);
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

  test("reading a missing file rejects with not-found", async () => {
    const host = createMemoryHost();
    const file = await host.files.dataFile("missing.json");
    await expect(host.files.read(file)).rejects.toMatchObject({ code: "not-found" });
  });

  test("tells when a file last changed, without reading it, and undefined when it is missing", async () => {
    const host = createMemoryHost({
      files: [["docs/a.crs", bytes("a")]],
      onPickOpen: () => ["docs/a.crs"],
    });
    const unpicked = { id: "docs/a.crs", name: "a.crs" };
    await expect(host.files.modified(unpicked)).rejects.toMatchObject({ code: "not-allowed" });
    const [file] = await host.files.pickOpen();
    const before = Date.now();
    expect(await host.files.modified(unpicked)).toBeLessThanOrEqual(before);
    if (file) await host.files.write(file, bytes("b"));
    expect(await host.files.modified(unpicked)).toBeGreaterThanOrEqual(before);
    host.disk.delete("docs/a.crs");
    expect(await host.files.modified(unpicked)).toBeUndefined();
    expect(await host.files.modified(await host.files.dataFile("none.json"))).toBeUndefined();
  });

  test("closing the window asks the last close listener set, and closes without one", async () => {
    const host = createMemoryHost();
    expect(await host.requestClose()).toBe(true);
    const stopFirst = host.onCloseRequested(async () => false);
    expect(await host.requestClose()).toBe(false);
    const stop = host.onCloseRequested(async () => true);
    stopFirst();
    expect(await host.requestClose()).toBe(true);
    host.onCloseRequested(async () => false);
    stop();
    expect(await host.requestClose()).toBe(false);
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

describe("project files", () => {
  const picked = () => {
    const host = createMemoryHost({
      files: [
        ["docs/Safety.crs", bytes("v1")],
        ["docs/Other.crs", bytes("other")],
      ],
      onPickOpen: () => ["docs/Safety.crs"],
    });
    return host;
  };

  test("serve the project container's save: autosave folder, verify, rename over the file", async () => {
    const host = picked();
    const [file] = await host.files.pickOpen();
    if (!file) throw new Error("nothing picked");
    const project = host.files.projectFiles(file);
    const autosave = ".Safety.crs.autosave";
    // The order @course-suite/project saves and autosaves in (D-4).
    await project.write(`${autosave}/4.crs.tmp`, bytes("v4"));
    await project.rename(`${autosave}/4.crs.tmp`, `${autosave}/4.crs`);
    expect(await project.list(autosave)).toEqual(["4.crs"]);
    await project.write(`${autosave}/save.tmp`, bytes("v5"));
    expect(await project.read(`${autosave}/save.tmp`)).toEqual(bytes("v5"));
    await project.rename(`${autosave}/save.tmp`, "Safety.crs");
    await project.remove(autosave);
    expect(await project.read("Safety.crs")).toEqual(bytes("v5"));
    expect(await project.read(`${autosave}/4.crs`)).toBeUndefined();
    expect(await project.list(autosave)).toEqual([]);
    expect([...host.disk.keys()].sort()).toEqual(["docs/Other.crs", "docs/Safety.crs"]);
  });

  test("reach nothing else in the project's folder, and never move or delete the project file", async () => {
    const host = picked();
    const [file] = await host.files.pickOpen();
    if (!file) throw new Error("nothing picked");
    const project = host.files.projectFiles(file);
    const refused = [
      () => project.read("Other.crs"),
      () => project.write("Other.crs", bytes("x")),
      () => project.write(".Other.crs.autosave/1.crs", bytes("x")),
      () => project.list("Safety.crs"),
      () => project.remove("Safety.crs"),
      () => project.rename("Safety.crs", ".Safety.crs.autosave/x"),
      () => project.rename(".Safety.crs.autosave/x", "Other.crs"),
    ];
    for (const call of refused) await expect(call()).rejects.toMatchObject({ code: "not-allowed" });
    for (const call of [() => project.read("../Safety.crs"), () => project.list(".")]) {
      await expect(call()).rejects.toMatchObject({ code: "invalid" });
    }
    expect(new TextDecoder().decode(host.disk.get("docs/Other.crs"))).toBe("other");
  });

  test("of a file the user did not pick are refused", async () => {
    const host = picked();
    const project = host.files.projectFiles({ id: "docs/Safety.crs", name: "Safety.crs" });
    await expect(project.read("Safety.crs")).rejects.toMatchObject({ code: "not-allowed" });
    await expect(project.list(".Safety.crs.autosave")).rejects.toMatchObject({
      code: "not-allowed",
    });
  });
});

test("the host has no job port: long tasks keep the one contract of @course-suite/jobs (ENG-15)", () => {
  const ports = ["appInfo", "files", "onCloseRequested", "storage"];
  expect(Object.keys(createBrowserHost({ name: "a", version: "1" }, mapStore())).sort()).toEqual(
    ports,
  );
  expect(Object.keys(createMemoryHost()).sort()).toEqual(["disk", "requestClose", ...ports].sort());
  expect(Object.keys(host).filter((name) => /job/i.test(name))).toEqual([]);
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
    const project = host.files.projectFiles({ id: "a.crs", name: "a.crs" });
    await expect(project.read("a.crs")).rejects.toMatchObject({ code: "unsupported" });
  });
});
