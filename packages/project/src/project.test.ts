import { serializeCourse } from "@course-suite/format";
import { readZip, writeZip } from "@course-suite/zip";
import { describe, expect, test } from "vitest";
import { assetBytes, fixtures, full, projectOf, sample } from "../test/fixtures.js";
import {
  addAsset,
  autosaveFolder,
  autosaveProject,
  createProject,
  discardAutosaves,
  memoryProjectFiles,
  openProject,
  PROJECT_FORMAT_VERSION,
  type Project,
  type ProjectFiles,
  readAsset,
  restoreAsNewCourse,
  restoreSnapshot,
  saveProject,
  takeSnapshot,
} from "./index.js";

const NAME = "Course.crs";
const FONT = {
  name: "Body.woff2",
  type: "font/woff2",
  source: "upload" as const,
  licence: "OFL-1.1",
};

async function opened(files: ProjectFiles, name = NAME): Promise<Project> {
  const result = await openProject(files, name);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.project;
}

/** The project's document and assets, in a form that compares exactly. */
async function contents(project: Project) {
  return {
    course: serializeCourse(project.course),
    assets: structuredClone(project.assets),
    bytes: await assetBytes(project),
  };
}

describe("save and reopen (ENG-11 done-when: a project reopens identically after save)", () => {
  for (const fixture of fixtures()) {
    test(`${fixture.name}: the document and every asset come back identical`, async () => {
      const files = memoryProjectFiles();
      const project = await projectOf(fixture);
      await addAsset(project, new Uint8Array([0, 1, 2, 255]), FONT, "body.woff2");
      takeSnapshot(project, { name: "First", trigger: "manual" });
      const before = await contents(project);
      await saveProject(files, NAME, project);
      const reopened = await opened(files);
      expect(await contents(reopened)).toEqual(before);
      expect(reopened.snapshots).toEqual(project.snapshots);
      expect(reopened.revision).toBe(1);
      // Saving the reopened project again gives the same bytes: nothing drifts between saves.
      const first = files.files.get(NAME);
      reopened.revision = 0;
      await saveProject(files, NAME, reopened);
      expect(files.files.get(NAME)).toEqual(first);
    });
  }
});

describe("asset store", () => {
  test("stores the same bytes once, under their SHA-256, with their source and licence", async () => {
    const files = memoryProjectFiles();
    const project = createProject(sample().course);
    const data = new TextEncoder().encode("same bytes");
    const info = { name: "Photo.PNG", type: "image/png", source: "stock" as const };
    const first = await addAsset(project, data, { ...info, attribution: "Photo by A. Person" });
    const second = await addAsset(project, data, { ...info, name: "copy.png" }, "copy.png");
    expect(first).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(project.assets[first]).toEqual({
      hash: first.slice(0, 64),
      size: data.length,
      ...info,
      attribution: "Photo by A. Person",
    });
    expect(project.assets[second]?.hash).toBe(project.assets[first]?.hash);
    await saveProject(files, NAME, project);
    const zip = await readZip(files.files.get(NAME) as Uint8Array);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
    expect(zip.value.names.filter((name) => name.startsWith("assets/"))).toEqual([
      `assets/${first.slice(0, 64)}`,
    ]);
    expect(await readAsset(await opened(files), second)).toEqual(data);
    expect(await readAsset(project, "missing")).toBeUndefined();
  });

  test("keeps the bytes a snapshot needs after the asset leaves the store, and drops the rest", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    const kept = await addAsset(project, new Uint8Array([1]), FONT, "kept.woff2");
    const dropped = await addAsset(project, new Uint8Array([2]), FONT, "dropped.woff2");
    const keptHash = project.assets[kept]?.hash;
    const droppedHash = project.assets[dropped]?.hash;
    takeSnapshot(project, { name: "With font", trigger: "manual" });
    delete project.assets[kept];
    delete project.assets[dropped];
    takeSnapshot(project, { name: "Without", trigger: "manual" });
    project.snapshots.pop();
    await saveProject(files, NAME, project);
    const zip = await readZip(files.files.get(NAME) as Uint8Array);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
    expect(zip.value.has(`assets/${keptHash}`)).toBe(true);
    expect(zip.value.has(`assets/${droppedHash}`)).toBe(true);
    const reopened = await opened(files);
    reopened.snapshots = [];
    await saveProject(files, NAME, reopened);
    const pruned = await readZip(files.files.get(NAME) as Uint8Array);
    if (!pruned.ok) throw new Error(JSON.stringify(pruned.problems));
    expect(pruned.value.has(`assets/${keptHash}`)).toBe(false);
  });
});

describe("storage keys", () => {
  test.each([
    ["__proto__", "__proto__"],
    ["../../escape.png", "../../escape.png"],
    ["a/b.png", "a/b.png"],
    ["Photo.png", "Photo.png"],
    ["an empty key", ""],
    ["a 129-character key", "x".repeat(129)],
  ])("addAsset refuses %s and leaves the store unchanged", async (_, key) => {
    const project = createProject(sample().course);
    await expect(addAsset(project, new Uint8Array([1]), FONT, key)).rejects.toThrow(
      "is not a valid storage key",
    );
    expect(Object.getPrototypeOf(project.assets)).toBe(Object.prototype);
    expect(project.assets).toEqual({});
    expect(project.store.blobs.size).toBe(0);
  });

  test("readAsset finds only the store's own keys, not inherited ones", async () => {
    const project = createProject(sample().course);
    await addAsset(project, new Uint8Array([1]), FONT, "x".repeat(128));
    expect(await readAsset(project, "x".repeat(128))).toEqual(new Uint8Array([1]));
    expect(await readAsset(project, "constructor")).toBeUndefined();
    expect(await readAsset(project, "toString")).toBeUndefined();
    expect(await readAsset(project, "__proto__")).toBeUndefined();
  });
});

describe("snapshots (ENG-11 done-when: restoring a snapshot reproduces the exact document and assets)", () => {
  for (const fixture of fixtures()) {
    test(`${fixture.name}: restore, after a save and reopen, gives back the snapshot's document and assets`, async () => {
      const files = memoryProjectFiles();
      const project = await projectOf(fixture);
      const at = new Date("2026-10-25T10:00:00Z");
      const manual = takeSnapshot(project, { name: "Before edits", trigger: "manual" }, at);
      const wanted = await contents(project);

      project.course = {
        ...project.course,
        title: `${project.course.title} (edited)`,
        description: "<p>Edited after the snapshot.</p>",
      };
      await addAsset(project, new Uint8Array([9, 9, 9]), FONT, "new.woff2");
      for (const asset of Object.values(project.assets)) asset.licence = "changed";
      takeSnapshot(project, { name: "Export", trigger: "export" }, at);
      await saveProject(files, NAME, project);

      const reopened = await opened(files);
      expect(reopened.snapshots.map((s) => [s.name, s.trigger, s.createdAt])).toEqual([
        ["Before edits", "manual", at.toISOString()],
        ["Export", "export", at.toISOString()],
      ]);
      await restoreSnapshot(reopened, manual.id);
      expect(await contents(reopened)).toEqual(wanted);
      // The restore is a change like any other: it saves and reopens identically too.
      await saveProject(files, NAME, reopened);
      expect(await contents(await opened(files))).toEqual(wanted);
    });
  }

  test("restore as a new course: a new project id, the snapshot's content, no history", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    const snapshot = takeSnapshot(project, { name: "v1", trigger: "publish" });
    const wanted = await contents(project);
    project.course = { ...project.course, title: "Changed" };
    await saveProject(files, NAME, project);

    const copy = await restoreAsNewCourse(await opened(files), snapshot.id);
    expect(copy.course.id).not.toBe(project.course.id);
    expect(copy.snapshots).toEqual([]);
    expect(copy.revision).toBe(0);
    await saveProject(files, "Copy.crs", copy);
    const reopened = await contents(await opened(files, "Copy.crs"));
    expect({
      ...reopened,
      course: reopened.course.replace(copy.course.id, project.course.id),
    }).toEqual(wanted);
  });

  test("UI-PUBCOLLAB-R3: publish, export and share-link changes are automatic snapshots beside the manual ones", () => {
    const project = createProject(sample().course);
    for (const trigger of ["manual", "publish", "export", "share-link"] as const) {
      takeSnapshot(project, { name: trigger, trigger });
    }
    expect(project.snapshots.map((s) => s.trigger)).toEqual([
      "manual",
      "publish",
      "export",
      "share-link",
    ]);
    expect(new Set(project.snapshots.map((s) => s.id)).size).toBe(4);
  });

  test("a snapshot keeps the document as it was, not as it is later edited", async () => {
    const project = createProject(sample().course);
    const wanted = serializeCourse(project.course);
    const snapshot = takeSnapshot(project, { name: "v1", trigger: "manual" });
    project.course.title = "Edited in place";
    await restoreSnapshot(project, snapshot.id);
    expect(serializeCourse(project.course)).toBe(wanted);
    await expect(restoreSnapshot(project, "nosuchid00")).rejects.toThrow("No snapshot");
  });
});

describe("crash-safe save", () => {
  test("keeps the previous file when writing fails part-way or reads back wrong", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    await saveProject(files, NAME, project);
    const previous = files.files.get(NAME);
    project.course = { ...project.course, title: "Not saved" };

    const failing = { ...files, write: async () => Promise.reject(new Error("disk full")) };
    await expect(saveProject(failing, NAME, project)).rejects.toThrow("disk full");
    const garbling: ProjectFiles = {
      ...files,
      write: (path, data) => files.write(path, data.subarray(0, data.length - 1)),
    };
    await expect(saveProject(garbling, NAME, project)).rejects.toThrow("did not read back");
    expect(files.files.get(NAME)).toBe(previous);
    expect((await opened(files)).course.title).not.toBe("Not saved");

    // A later save goes through and replaces the leftover temporary file.
    await saveProject(files, NAME, project);
    expect((await opened(files)).course.title).toBe("Not saved");
    expect([...files.files.keys()]).toEqual([NAME]);
  });
});

test("refuses to save or autosave a course that would not open, keeping the previous file", async () => {
  const files = memoryProjectFiles();
  const project = await projectOf(full());
  await saveProject(files, NAME, project);
  const previous = files.files.get(NAME);
  // The publish settings point at a quiz that is no longer there.
  project.course = { ...project.course, entries: [] };
  await expect(saveProject(files, NAME, project)).rejects.toThrow("cannot be saved");
  await expect(autosaveProject(files, NAME, project)).rejects.toThrow("cannot be saved");
  expect([...files.files.keys()]).toEqual([NAME]);
  expect(files.files.get(NAME)).toBe(previous);
});

describe("autosave and recovery", () => {
  test("offers the newest autosave newer than the file, leaving out the bytes the file holds", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    const big = new Uint8Array(64 * 1024).map((_, i) => (i * 7919) % 251);
    await addAsset(project, big, { ...FONT, name: "big.woff2" }, "big.woff2");
    await saveProject(files, NAME, project);
    expect((await openProject(files, NAME)).recovered).toBeUndefined();

    project.course = { ...project.course, title: "First change" };
    await autosaveProject(files, NAME, project);
    project.course = { ...project.course, title: "Second change" };
    const added = await addAsset(project, new Uint8Array([7, 7]), FONT, "added.woff2");
    await autosaveProject(files, NAME, project);
    const folder = autosaveFolder(NAME);
    expect(folder).toBe(".Course.crs.autosave");
    expect((files.files.get(`${folder}/3.crs`)?.length ?? 0) < big.length).toBe(true);

    const result = await openProject(files, NAME);
    if (!result.ok || !result.recovered) throw new Error("expected an autosave to recover");
    expect(result.project.course.title).not.toBe("Second change");
    const recovered = result.recovered;
    expect(recovered.course.title).toBe("Second change");
    expect(await contents(recovered)).toEqual(await contents(project));
    expect(await readAsset(recovered, added)).toEqual(new Uint8Array([7, 7]));

    // Saving the recovered project replaces the file and clears the autosaves.
    await saveProject(files, NAME, recovered);
    expect([...files.files.keys()]).toEqual([NAME]);
    const again = await openProject(files, NAME);
    expect(again.ok && again.recovered).toBe(undefined);
    expect(await contents(await opened(files))).toEqual(await contents(project));
  });

  test("skips a damaged autosave and offers the next one; keeps three", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    await saveProject(files, NAME, project);
    for (let i = 1; i <= 5; i++) {
      project.course = { ...project.course, title: `Change ${i}` };
      await autosaveProject(files, NAME, project);
    }
    const folder = autosaveFolder(NAME);
    expect((await files.list(folder)).sort()).toEqual(["4.crs", "5.crs", "6.crs"]);
    files.files.set(`${folder}/6.crs`, new Uint8Array([1, 2, 3]));
    const result = await openProject(files, NAME);
    expect(result.recovered?.course.title).toBe("Change 4");
    expect(result.recovered?.revision).toBe(5);

    await discardAutosaves(files, NAME);
    expect((await openProject(files, NAME)).recovered).toBeUndefined();
  });

  test("recovers a project that was autosaved but never saved", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    await autosaveProject(files, NAME, project);
    const result = await openProject(files, NAME);
    expect(result.ok).toBe(false);
    if (result.ok || !result.recovered) throw new Error("expected only a recovered project");
    expect(result.problems).toEqual([{ file: "", message: "does not exist" }]);
    expect(await contents(result.recovered)).toEqual(await contents(project));
    expect(result.recovered.savedRevision).toBe(0);
  });

  test("never offers an autosave older than the file", async () => {
    const files = memoryProjectFiles();
    const project = await projectOf(full());
    await autosaveProject(files, NAME, project);
    const stale = files.files.get(`${autosaveFolder(NAME)}/1.crs`) as Uint8Array;
    await saveProject(files, NAME, project);
    // As if the app stopped after the rename and before the autosaves were cleared.
    files.files.set(`${autosaveFolder(NAME)}/1.crs`, stale);
    expect((await openProject(files, NAME)).recovered).toBeUndefined();
  });
});

describe("opening damaged or foreign files", () => {
  async function problemsOf(entries: Record<string, string | Uint8Array>) {
    const files = memoryProjectFiles();
    const data = await writeZip(
      Object.entries(entries).map(([name, value]) => ({
        name,
        data: typeof value === "string" ? new TextEncoder().encode(value) : value,
      })),
    );
    files.files.set(NAME, data);
    const result = await openProject(files, NAME);
    if (result.ok) throw new Error("expected the file to be refused");
    return result.problems;
  }
  const course = serializeCourse(sample().course);
  const manifest = (fields: object) =>
    JSON.stringify({ formatVersion: 1, revision: 1, assets: {}, snapshots: [], ...fields });

  test("refuses a file from a newer project format, naming it", async () => {
    expect(
      await problemsOf({
        "project.json": manifest({ formatVersion: PROJECT_FORMAT_VERSION + 1 }),
        "course.json": course,
      }),
    ).toEqual([
      { file: "project.json", message: expect.stringContaining("written by a newer version") },
    ]);
  });

  test.each([
    [{ "course.json": course }, "is not a project file (no project.json)"],
    [{ "project.json": "{", "course.json": course }, "is not JSON"],
    [{ "project.json": manifest({ revision: -1 }), "course.json": course }, "has no revision"],
    [{ "project.json": manifest({}) }, "has no course.json"],
    [
      {
        "project.json": manifest({
          assets: {
            "a.png": { hash: "0".repeat(64), size: 1, name: "a", type: "", source: "upload" },
          },
        }),
        "course.json": course,
      },
      "is missing; an asset needs its bytes",
    ],
    [
      {
        "project.json": manifest({
          assets: { "a.png": { hash: "xyz", size: 1, name: "a", type: "", source: "upload" } },
        }),
        "course.json": course,
      },
      "has an invalid entry 'a.png'",
    ],
    [
      {
        "project.json": manifest({
          snapshots: [{ id: "a000000000", name: "v", trigger: "x", createdAt: "", assets: {} }],
        }),
        "course.json": course,
      },
      "unknown trigger",
    ],
    [{ "project.json": manifest({}), "course.json": "{}" }, ""],
  ])("refuses a damaged file %#", async (entries, message) => {
    const problems = await problemsOf(entries);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]?.message).toContain(message);
  });

  // `__proto__` is spliced into the JSON text: as an object literal key it would set a prototype.
  const record = { hash: "0".repeat(64), size: 1, name: "a", type: "", source: "upload" };
  const withKey = (key: string, place: (assets: object) => object) =>
    manifest(place({ KEY: record })).replace('"KEY"', JSON.stringify(key));
  const inSnapshot = (assets: object) => ({
    snapshots: [{ id: "a000000000", name: "v", trigger: "manual", createdAt: "", assets }],
  });
  test.each([
    ["__proto__", (assets: object) => ({ assets })],
    ["../../../evil.png", (assets: object) => ({ assets })],
    ["assets/a.png", (assets: object) => ({ assets })],
    ["Photo.png", (assets: object) => ({ assets })],
    ["", (assets: object) => ({ assets })],
    ["__proto__", inSnapshot],
    ["../evil.png", inSnapshot],
  ])(
    "refuses the asset key '%s' in the manifest: storage keys follow the course format's rule",
    async (key, place) => {
      const problems = await problemsOf({
        "project.json": withKey(key, place),
        "course.json": course,
      });
      expect(problems).toEqual([
        { file: "project.json", message: expect.stringContaining("is not a valid storage key") },
      ]);
    },
  );

  /** The project file with some entries replaced, written with valid CRCs. */
  async function rewritten(data: Uint8Array, change: Record<string, Uint8Array | string>) {
    const zip = await readZip(data);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
    const entries = new Map<string, Uint8Array | string>();
    for (const name of zip.value.names) entries.set(name, (await zip.value.read(name)) ?? "");
    for (const [name, value] of Object.entries(change)) entries.set(name, value);
    return writeZip(
      [...entries].map(([name, value]) => ({
        name,
        data: typeof value === "string" ? new TextEncoder().encode(value) : value,
      })),
    );
  }

  async function savedWithAsset() {
    const files = memoryProjectFiles();
    const project = createProject(sample().course);
    const genuine = new TextEncoder().encode("the genuine font, 29 bytes...");
    const key = await addAsset(project, genuine, FONT, "body.woff2");
    const hash = project.assets[key]?.hash as string;
    await saveProject(files, NAME, project);
    return { files, genuine, key, hash, data: files.files.get(NAME) as Uint8Array };
  }

  test.each([
    ["other bytes of another size", new TextEncoder().encode("19 bytes, not ours")],
    ["other bytes of the same size", new TextEncoder().encode("a forged font of 29 bytes....")],
  ])(
    "refuses a file whose asset bytes were replaced with %s and a valid CRC",
    async (_, forged) => {
      const { files, hash, data } = await savedWithAsset();
      files.files.set(NAME, await rewritten(data, { [`assets/${hash}`]: forged }));
      const result = await openProject(files, NAME);
      expect(result).toEqual({
        ok: false,
        problems: [
          { file: `assets/${hash}`, message: "does not match its SHA-256; the file is damaged" },
        ],
      });
    },
  );

  test("refuses forged bytes the manifest does not list, so adding the genuine file never keeps them", async () => {
    const { files, genuine, hash } = await savedWithAsset();
    const empty = memoryProjectFiles();
    await saveProject(empty, NAME, createProject(sample().course));
    const forged = genuine.map((byte) => byte ^ 1);
    const data = await rewritten(empty.files.get(NAME) as Uint8Array, {
      [`assets/${hash}`]: forged,
    });
    files.files.set(NAME, data);
    const result = await openProject(files, NAME);
    expect(result.ok).toBe(false);
    expect(result.ok || result.problems[0]?.message).toContain("does not match its SHA-256");
  });

  test("refuses a file whose asset store declares another size than the bytes hold", async () => {
    const { files, key, hash, data } = await savedWithAsset();
    const zip = await readZip(data);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
    const text = new TextDecoder().decode(await zip.value.read("project.json"));
    const manifest = JSON.parse(text);
    manifest.assets[key].size = 30;
    files.files.set(NAME, await rewritten(data, { "project.json": JSON.stringify(manifest) }));
    expect(await openProject(files, NAME)).toEqual({
      ok: false,
      problems: [
        { file: `assets/${hash}`, message: "holds 29 bytes but the asset store declares 30" },
      ],
    });
  });

  test("skips an autosave whose asset bytes do not match their hash", async () => {
    const { files } = await savedWithAsset();
    const project = await opened(files);
    const added = new Uint8Array([7, 7, 7]);
    const key = await addAsset(project, added, FONT, "added.woff2");
    await autosaveProject(files, NAME, project);
    const autosave = `${autosaveFolder(NAME)}/2.crs`;
    const hash = project.assets[key]?.hash as string;
    const forged = await rewritten(files.files.get(autosave) as Uint8Array, {
      [`assets/${hash}`]: new Uint8Array([6, 6, 6]),
    });
    files.files.set(autosave, forged);
    const result = await openProject(files, NAME);
    expect(result.ok).toBe(true);
    expect(result.recovered).toBeUndefined();
  });

  test("refuses bytes that are not a ZIP archive", async () => {
    const files = memoryProjectFiles();
    files.files.set(NAME, new TextEncoder().encode("not a zip"));
    const result = await openProject(files, NAME);
    expect(result.ok).toBe(false);
  });
});
