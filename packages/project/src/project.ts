// A course project in memory: the course document, its content-addressed asset store and its
// snapshots (ENG-11). Asset and snapshot bytes stay in the file the project was opened from until
// they are needed; only what was added since is held in memory.
import type { Course, MediaEntry } from "@course-suite/format";
import { newContentId, openCourse, serializeCourse, withNewProjectId } from "@course-suite/format";
import type { ZipArchive } from "@course-suite/zip";

/** One file in the asset store: media, fonts (a `font/` type) and anything else the course uses. */
export interface Asset {
  /** SHA-256 of the bytes in lowercase hex: where they live in the store. */
  hash: string;
  /** Size in bytes. */
  size: number;
  /** The file name it was added with. */
  name: string;
  /** Media type, such as `image/png` or `font/woff2`. */
  type: string;
  source: MediaEntry["source"];
  /** Licence of the file, an SPDX id where one exists. */
  licence?: string;
  /** Attribution text the licence requires. */
  attribution?: string;
}

export type AssetInfo = Omit<Asset, "hash" | "size">;

/** What saved a snapshot: the author, or a publish, export or share-link change (automatic). */
export type SnapshotTrigger = "manual" | "publish" | "export" | "share-link";

/** A saved version of the course: its document and the asset manifest it used. */
export interface Snapshot {
  /** Content id, unique in the project. */
  id: string;
  name: string;
  trigger: SnapshotTrigger;
  /** RFC 3339 time in UTC. */
  createdAt: string;
  /** The asset store as it was, by storage key; the bytes are kept as long as the snapshot is. */
  assets: Record<string, Asset>;
}

export interface Project {
  course: Course;
  /** The asset store, by storage key (the `key` of the course's media entries). */
  assets: Record<string, Asset>;
  /** Oldest first. */
  snapshots: Snapshot[];
  /** Revision of the last write of this project, to its file or an autosave; 0 before any. */
  revision: number;
  /** Revision of the project file on disk; 0 when it was never saved. */
  savedRevision: number;
  /** Where asset and snapshot bytes come from; managed by this package. */
  readonly store: Store;
}

export interface Store {
  /** Asset bytes added since the project was opened, by hash. */
  blobs: Map<string, Uint8Array>;
  /** Snapshot documents taken since the project was opened, by snapshot id. */
  snapshots: Map<string, string>;
  /** The opened files, searched in order: an autosave first, then the project file. */
  sources: ZipArchive[];
  /** Hashes of the asset bytes in the project file on disk; autosaves leave them out. */
  saved: Set<string>;
}

export const BLOBS_FOLDER = "assets";
export const SNAPSHOTS_FOLDER = "snapshots";
export const blobPath = (hash: string) => `${BLOBS_FOLDER}/${hash}`;
export const snapshotPath = (id: string) => `${SNAPSHOTS_FOLDER}/${id}.json`;

const emptyStore = (): Store => ({
  blobs: new Map(),
  snapshots: new Map(),
  sources: [],
  saved: new Set(),
});

/** A new, never saved project for `course`. */
export function createProject(course: Course): Project {
  return { course, assets: {}, snapshots: [], revision: 0, savedRevision: 0, store: emptyStore() };
}

/**
 * Adds a file to the asset store and returns its storage key: `key`, or by default the hash and
 * the extension of its name, such as `<64 hex digits>.png`. The same bytes are stored once.
 */
export async function addAsset(
  project: Project,
  data: Uint8Array,
  info: AssetInfo,
  key?: string,
): Promise<string> {
  const hash = await sha256(data);
  const extension = /\.[A-Za-z0-9]{1,8}$/.exec(info.name)?.[0].toLowerCase() ?? "";
  const storageKey = key ?? `${hash}${extension}`;
  project.assets[storageKey] = { hash, size: data.length, ...info };
  if (!hasBlob(project.store, hash)) project.store.blobs.set(hash, data.slice());
  return storageKey;
}

/** The bytes of the asset with this storage key, or undefined when the store has none. */
export async function readAsset(project: Project, key: string): Promise<Uint8Array | undefined> {
  const asset = project.assets[key];
  return asset && readBlob(project.store, asset.hash);
}

/**
 * Saves the course and its asset manifest as a snapshot (rise.md §3J): `manual` when the author
 * asks, or the publish, export or share-link change that triggered it (UI-PUBCOLLAB-R3).
 */
export function takeSnapshot(
  project: Project,
  options: { name: string; trigger: SnapshotTrigger },
  now = new Date(),
): Snapshot {
  const id = newContentId(new Set(project.snapshots.map((snapshot) => snapshot.id)));
  const snapshot: Snapshot = {
    id,
    name: options.name,
    trigger: options.trigger,
    createdAt: now.toISOString(),
    assets: structuredClone(project.assets),
  };
  project.store.snapshots.set(id, serializeCourse(project.course));
  project.snapshots.push(snapshot);
  return snapshot;
}

/** Puts the snapshot's document and assets back in place of the current ones. */
export async function restoreSnapshot(project: Project, id: string): Promise<void> {
  const { course, assets } = await snapshotContent(project, id);
  project.course = course;
  project.assets = assets;
}

/** A new, never saved project with the snapshot's document under a new project id, and its assets. */
export async function restoreAsNewCourse(project: Project, id: string): Promise<Project> {
  const { course, assets } = await snapshotContent(project, id);
  // Content-addressed bytes are shared, never copied; the new project's first save writes them.
  const store = {
    ...emptyStore(),
    blobs: new Map(project.store.blobs),
    sources: [...project.store.sources],
  };
  return { ...createProject(withNewProjectId(course)), assets, store };
}

async function snapshotContent(project: Project, id: string) {
  const snapshot = project.snapshots.find((item) => item.id === id);
  if (!snapshot) throw new Error(`No snapshot ${id}`);
  const text = await readSnapshot(project.store, id);
  if (text === undefined) throw new Error(`The document of snapshot ${id} is missing`);
  const opened = openCourse(text);
  if (opened.status !== "ok") throw new Error(`The document of snapshot ${id} cannot be opened`);
  return { course: opened.document, assets: structuredClone(snapshot.assets) };
}

/** Every hash the project keeps bytes for: its assets and those of its snapshots. */
export function keptHashes(project: Project): Set<string> {
  const hashes = new Set(Object.values(project.assets).map((asset) => asset.hash));
  for (const snapshot of project.snapshots) {
    for (const asset of Object.values(snapshot.assets)) hashes.add(asset.hash);
  }
  return hashes;
}

export function hasBlob(store: Store, hash: string): boolean {
  return store.blobs.has(hash) || store.sources.some((source) => source.has(blobPath(hash)));
}

export async function readBlob(store: Store, hash: string): Promise<Uint8Array | undefined> {
  const added = store.blobs.get(hash);
  if (added) return added;
  const source = store.sources.find((item) => item.has(blobPath(hash)));
  return source?.read(blobPath(hash));
}

export async function readSnapshot(store: Store, id: string): Promise<string | undefined> {
  const added = store.snapshots.get(id);
  if (added !== undefined) return added;
  const source = store.sources.find((item) => item.has(snapshotPath(id)));
  const data = await source?.read(snapshotPath(id));
  return data && new TextDecoder().decode(data);
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
