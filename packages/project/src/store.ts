// Saving, autosaving and opening a project file through the ProjectFiles port (ENG-11, D-4).
//
// Save: write the whole file under a temporary name in the hidden autosave folder, flush it, read
// it back and compare, and only then rename it over the project file in one step. The previous
// file stays whole until that rename, so a crash at any point leaves either the old file or the
// new one. Autosave: the same, into `.<name>.autosave/<revision>.course`, leaving out the asset
// bytes the project file already holds. Open: the project file, plus the newest autosave that is
// newer than it and opens cleanly, offered for recovery.
import {
  decodeProject,
  encodeProject,
  PROJECT_EXTENSION,
  type ProjectProblem,
} from "./container.js";
import type { ProjectFiles } from "./files.js";
import { keptHashes, type Project } from "./project.js";

/** How many autosaves are kept; the newest valid one is offered on open. */
const AUTOSAVES_KEPT = 3;

/** The hidden folder next to the project file `name` that holds its autosaves. */
export function autosaveFolder(name: string): string {
  const slash = name.lastIndexOf("/");
  return `${name.slice(0, slash + 1)}.${name.slice(slash + 1)}.autosave`;
}

/** Saves the project to `name`; on any failure the previous file is kept and this rejects. */
export async function saveProject(files: ProjectFiles, name: string, project: Project) {
  const revision = project.revision + 1;
  const bytes = await encodeProject(project, revision);
  const folder = autosaveFolder(name);
  const temporary = `${folder}/save.tmp`;
  await writeVerified(files, temporary, bytes);
  await files.rename(temporary, name);
  project.revision = revision;
  project.savedRevision = revision;
  const { saved } = project.store;
  saved.clear();
  for (const hash of keptHashes(project)) saved.add(hash);
  // Every autosave is older than the file now.
  await files.remove(folder);
}

/** Writes an autosave of the project for crash recovery, and drops the older ones. */
export async function autosaveProject(files: ProjectFiles, name: string, project: Project) {
  const revision = project.revision + 1;
  const bytes = await encodeProject(project, revision, project.savedRevision);
  const folder = autosaveFolder(name);
  const file = `${folder}/${revision}${PROJECT_EXTENSION}`;
  await writeVerified(files, `${file}.tmp`, bytes);
  await files.rename(`${file}.tmp`, file);
  project.revision = revision;
  for (const old of autosaveRevisions(await files.list(folder)).slice(AUTOSAVES_KEPT)) {
    await files.remove(`${folder}/${old}${PROJECT_EXTENSION}`);
  }
}

/** Deletes the project's autosaves, for when the author declines to recover one. */
export async function discardAutosaves(files: ProjectFiles, name: string) {
  await files.remove(autosaveFolder(name));
}

export type OpenedProject =
  /** `recovered`: an autosave newer than the file, to offer the author instead of `project`. */
  | { ok: true; project: Project; recovered?: Project }
  /** The file is missing or damaged; `recovered` is set when an autosave can stand in for it. */
  | { ok: false; problems: ProjectProblem[]; recovered?: Project };

/** Opens the project file `name` and finds the newest valid autosave newer than it. */
export async function openProject(files: ProjectFiles, name: string): Promise<OpenedProject> {
  const bytes = await files.read(name);
  const decoded = bytes
    ? await decodeProject(bytes)
    : { ok: false as const, problems: [{ file: "", message: "does not exist" }] };
  const main = decoded.ok ? decoded.value.project : undefined;
  const recovered = await newestAutosave(files, name, main);
  const extra = recovered && { recovered };
  if (decoded.ok) return { ok: true, project: decoded.value.project, ...extra };
  return { ok: false, problems: decoded.problems, ...extra };
}

async function newestAutosave(files: ProjectFiles, name: string, main?: Project) {
  const folder = autosaveFolder(name);
  for (const revision of autosaveRevisions(await files.list(folder))) {
    if (main && revision <= main.revision) return undefined;
    const bytes = await files.read(`${folder}/${revision}${PROJECT_EXTENSION}`);
    if (!bytes) continue;
    const decoded = await decodeProject(bytes, main?.store.sources[0]);
    if (!decoded.ok || decoded.value.project.revision !== revision) continue;
    const { project } = decoded.value;
    // It builds on the project file: saving it next replaces that file, not an autosave.
    project.savedRevision = main?.revision ?? 0;
    project.store.saved.clear();
    for (const hash of main?.store.saved ?? []) project.store.saved.add(hash);
    return project;
  }
  return undefined;
}

/** Revisions of the autosave files among `names`, newest first. */
function autosaveRevisions(names: readonly string[]): number[] {
  const pattern = new RegExp(`^([1-9][0-9]*)\\${PROJECT_EXTENSION}$`);
  return names
    .map((name) => Number(pattern.exec(name)?.[1]))
    .filter((revision) => Number.isSafeInteger(revision))
    .sort((a, b) => b - a);
}

async function writeVerified(files: ProjectFiles, path: string, bytes: Uint8Array) {
  await files.write(path, bytes);
  const written = await files.read(path);
  if (!written || !sameBytes(written, bytes)) {
    throw new Error(`${path} did not read back as written; the previous file is kept`);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
