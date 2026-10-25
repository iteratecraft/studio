// The project file (D-4): one ZIP archive per course. Layout, format version 1:
//
//   project.json          manifest: format version, revision, asset store, snapshot list
//   course.json           the course document, as serializeCourse writes it
//   assets/<sha256>       each asset's bytes once, stored without compression
//   snapshots/<id>.json   each snapshot's course document
//
// An autosave is a file of the same format whose manifest also names the revision of the project
// file it builds on (`base`); it leaves out the asset bytes that file already holds.
import type { Course } from "@course-suite/format";
import { openCourse, serializeCourse } from "@course-suite/format";
import {
  readZip,
  writeZip,
  ZIP_MAX_BYTES,
  ZIP_MAX_ENTRIES,
  type ZipArchive,
  type ZipFile,
  type ZipLimits,
} from "@course-suite/zip";
import {
  type Asset,
  BLOBS_FOLDER,
  blobPath,
  isStorageKey,
  keptHashes,
  type Project,
  readBlob,
  readSnapshot,
  type Snapshot,
  type SnapshotTrigger,
  type Store,
  sha256,
  snapshotPath,
} from "./project.js";

/** The extension of project and autosave files. */
export const PROJECT_EXTENSION = ".course";
/** The version of the layout above this package writes; older ones are migrated on open. */
export const PROJECT_FORMAT_VERSION = 1;

const MANIFEST = "project.json";
const COURSE = "course.json";

/** One reason a project file cannot be opened. */
export interface ProjectProblem {
  /** The file inside the project, such as `course.json`, or "" for the project file itself. */
  file: string;
  /** Place inside it, a JSON Pointer. */
  path?: string;
  message: string;
}

export type ProjectResult<T> = { ok: true; value: T } | { ok: false; problems: ProjectProblem[] };

interface Manifest {
  formatVersion: number;
  revision: number;
  /** Autosaves only: the revision of the project file whose asset bytes it leaves out. */
  base?: number;
  assets: Record<string, Asset>;
  snapshots: Snapshot[];
}

export type ManifestMigration = (manifest: Record<string, unknown>) => Record<string, unknown>;

/**
 * Forward steps of the project format: entry `n` turns a version `n + 1` manifest into version
 * `n + 2` and may move files. Version 1 is the first, so there are none yet.
 */
export const PROJECT_MIGRATIONS: readonly ManifestMigration[] = [];

// A project holds media, so it may inflate to the most a ZIP without ZIP64 holds. The ratio
// limits stay: our own files never come near them, so only a hostile file trips them.
const LIMITS: ZipLimits = {
  maxEntries: ZIP_MAX_ENTRIES,
  maxTotalBytes: ZIP_MAX_BYTES,
  maxRatio: 100,
  ratioFloorBytes: 1024 * 1024,
};

const utf8 = new TextEncoder();

/** The project file's bytes at `revision`; an autosave passes the file it builds on as `base`. */
export async function encodeProject(
  project: Project,
  revision: number,
  base?: number,
): Promise<Uint8Array> {
  const manifest: Manifest = {
    formatVersion: PROJECT_FORMAT_VERSION,
    revision,
    ...(base !== undefined && { base }),
    assets: project.assets,
    snapshots: project.snapshots,
  };
  const course = serializeCourse(project.course);
  // Opened exactly as decodeProject opens it, so no save can write a file that will not open.
  const check = openCourse(course);
  if (check.status !== "ok") {
    const why = check.status === "invalid" ? check.errors : `schema ${check.writtenBy}`;
    throw new Error(`The course cannot be saved: ${JSON.stringify(why)}`);
  }
  const files: ZipFile[] = [
    { name: MANIFEST, data: utf8.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: COURSE, data: utf8.encode(course) },
  ];
  for (const hash of keptHashes(project)) {
    if (base !== undefined && project.store.saved.has(hash)) continue;
    const data = await readBlob(project.store, hash);
    if (!data) throw new Error(`The bytes of asset ${hash} are missing; nothing was saved`);
    // Media is compressed already; deflating it on every save would cost time for nothing.
    files.push({ name: blobPath(hash), data, compress: false });
  }
  for (const { id } of project.snapshots) {
    const text = await readSnapshot(project.store, id);
    if (text === undefined) throw new Error(`Snapshot ${id} is missing; nothing was saved`);
    files.push({ name: snapshotPath(id), data: utf8.encode(text) });
  }
  return writeZip(files);
}

/** A project file read from `bytes`, and the base revision when it is an autosave. */
export interface Decoded {
  project: Project;
  base?: number;
}

/**
 * Opens a project file. Every entry is checked, the manifest is migrated and validated, the course
 * is opened with the format package, every asset's bytes must match their SHA-256 and declared
 * size, and every asset and snapshot must have its bytes, in the file or, for an autosave, in the
 * store of the project file it builds on (`fallback`).
 */
export async function decodeProject(
  bytes: Uint8Array,
  fallback?: Pick<Store, "sources" | "verified">,
): Promise<ProjectResult<Decoded>> {
  const unzipped = await readZip(bytes, LIMITS);
  if (!unzipped.ok) return unzipped;
  const archive = unzipped.value;
  const problem = (file: string, message: string, path?: string) => ({
    ok: false as const,
    problems: [{ file, message, ...(path !== undefined && { path }) }],
  });

  const manifestText = await readText(archive, MANIFEST);
  if (manifestText === undefined) return problem("", "is not a project file (no project.json)");
  let raw: unknown;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    return problem(MANIFEST, "is not JSON");
  }
  const manifest = parseManifest(raw);
  if (typeof manifest === "string") return problem(MANIFEST, manifest);

  const courseText = await readText(archive, COURSE);
  if (courseText === undefined) return problem("", "has no course.json");
  const opened = openCourse(courseText);
  if (opened.status === "read-only") {
    return problem(COURSE, `was written by a newer version (schema ${opened.writtenBy})`);
  }
  if (opened.status === "invalid") {
    return { ok: false, problems: opened.errors.map((error) => ({ file: COURSE, ...error })) };
  }

  // Every asset's bytes are checked here, once, so that no later read, dedupe or save trusts bytes
  // that do not match their hash. Stored entries are not inflated, so this costs one copy and one
  // hash of each.
  const verified = new Map(fallback?.verified);
  for (const name of archive.names) {
    if (!name.startsWith(`${BLOBS_FOLDER}/`)) continue;
    const hash = name.slice(BLOBS_FOLDER.length + 1);
    if (!HASH.test(hash)) return problem(name, "is not named by the SHA-256 of an asset");
    const data = (await archive.read(name)) as Uint8Array;
    if ((await sha256(data)) !== hash) {
      return problem(name, "does not match its SHA-256; the file is damaged");
    }
    verified.set(hash, data.length);
  }
  const sources = fallback ? [archive, ...fallback.sources] : [archive];
  const project: Project = {
    course: opened.document as Course,
    assets: manifest.assets,
    snapshots: manifest.snapshots,
    revision: manifest.revision,
    savedRevision: manifest.revision,
    store: { blobs: new Map(), snapshots: new Map(), sources, verified, saved: new Set() },
  };
  const records = [project.assets, ...project.snapshots.map((snapshot) => snapshot.assets)];
  for (const { hash, size } of records.flatMap((assets) => Object.values(assets))) {
    const actual = verified.get(hash);
    if (actual === undefined)
      return problem(blobPath(hash), "is missing; an asset needs its bytes");
    if (actual !== size) {
      return problem(blobPath(hash), `holds ${actual} bytes but the asset store declares ${size}`);
    }
  }
  for (const hash of keptHashes(project)) {
    if (archive.has(blobPath(hash))) project.store.saved.add(hash);
  }
  for (const { id } of project.snapshots) {
    if (!sources.some((source) => source.has(snapshotPath(id)))) {
      return problem(snapshotPath(id), "is missing; a snapshot needs its document");
    }
  }
  return {
    ok: true,
    value: { project, ...(manifest.base !== undefined && { base: manifest.base }) },
  };
}

async function readText(archive: ZipArchive, name: string): Promise<string | undefined> {
  const data = await archive.read(name);
  if (!data) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return undefined;
  }
}

const HASH = /^[0-9a-f]{64}$/;
const SNAPSHOT_ID = /^[a-z][a-z0-9]{9}$/;
const SOURCES = new Set(["upload", "ai", "stock", "default"]);
const TRIGGERS = new Set<SnapshotTrigger>(["manual", "publish", "export", "share-link"]);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

/** The manifest at the current format version, or why it is not one. */
function parseManifest(value: unknown): Manifest | string {
  if (!isObject(value)) return "must be an object";
  const version = value.formatVersion;
  if (!Number.isSafeInteger(version) || Number(version) < 1) {
    return "has no format version (a whole number from 1)";
  }
  if (Number(version) > PROJECT_FORMAT_VERSION) {
    return `was written by a newer version of the app (project format ${version}; this one reads up to ${PROJECT_FORMAT_VERSION})`;
  }
  let manifest = value;
  for (let from = Number(version); from < PROJECT_FORMAT_VERSION; from++) {
    const step = PROJECT_MIGRATIONS[from - 1];
    if (!step) return `cannot be brought up from project format ${from}`;
    manifest = { ...step(manifest), formatVersion: from + 1 };
  }
  if (!isCount(manifest.revision)) return "has no revision (a whole number from 0)";
  if (manifest.base !== undefined && !isCount(manifest.base)) return "has an invalid base revision";
  const assets = parseAssets(manifest.assets);
  if (typeof assets === "string") return `has an asset store that ${assets}`;
  if (!Array.isArray(manifest.snapshots)) return "has no snapshot list";
  const ids = new Set<string>();
  const snapshots: Snapshot[] = [];
  for (const [index, item] of manifest.snapshots.entries()) {
    const at = `snapshot ${index + 1}`;
    if (!isObject(item) || typeof item.id !== "string" || !SNAPSHOT_ID.test(item.id)) {
      return `has ${at} without a valid id`;
    }
    if (ids.has(item.id)) return `has two snapshots with the id ${item.id}`;
    ids.add(item.id);
    if (typeof item.name !== "string") return `has ${at} without a name`;
    if (!TRIGGERS.has(item.trigger as SnapshotTrigger)) return `has ${at} with an unknown trigger`;
    if (typeof item.createdAt !== "string") return `has ${at} without a creation time`;
    const kept = parseAssets(item.assets);
    if (typeof kept === "string") return `has ${at} with an asset manifest that ${kept}`;
    snapshots.push({
      id: item.id,
      name: item.name,
      trigger: item.trigger as SnapshotTrigger,
      createdAt: item.createdAt,
      assets: kept,
    });
  }
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    revision: manifest.revision,
    ...(manifest.base !== undefined && { base: manifest.base as number }),
    assets,
    snapshots,
  };
}

function parseAssets(value: unknown): Record<string, Asset> | string {
  if (!isObject(value)) return "is not an object";
  const assets: [string, Asset][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (!isStorageKey(key)) return `has an entry whose key '${key}' is not a valid storage key`;
    const bad = `has an invalid entry '${key}'`;
    if (!isObject(item)) return bad;
    const { hash, size, name, type, source, licence, attribution } = item;
    if (typeof hash !== "string" || !HASH.test(hash) || !isCount(size)) return bad;
    if (typeof name !== "string" || typeof type !== "string") return bad;
    if (!SOURCES.has(source as string) || !isOptionalString(licence)) return bad;
    if (!isOptionalString(attribution)) return bad;
    assets.push([
      key,
      {
        hash,
        size,
        name,
        type,
        source: source as Asset["source"],
        ...(licence !== undefined && { licence: licence as string }),
        ...(attribution !== undefined && { attribution: attribution as string }),
      },
    ]);
  }
  // Built from entries, so no key, `__proto__` included, can reach the object's prototype.
  return Object.fromEntries(assets);
}
