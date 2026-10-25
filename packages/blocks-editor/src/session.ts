// One open course: its project file, the doc-ops editing session, autosave for crash recovery and
// save on command (BLK-01, D-33). Edits go through the doc-ops editor; files go through the host's
// project files, so the same code runs on desktop and in a browser.
import { createEditor, type Editor } from "@course-suite/doc-ops";
import type { Course } from "@course-suite/format";
import { type FileRef, HostError, type HostFolder, type HostInterface } from "@course-suite/host";
import {
  type AssetInfo,
  addAsset,
  autosaveProject,
  discardAutosaves,
  openProject,
  type Project,
  readAsset,
  saveProject,
} from "@course-suite/project";

/**
 * How long after an edit the autosave runs, gathering the edits in between. BLK-01: a killed app
 * loses at most 10 seconds of work.
 */
export const AUTOSAVE_DELAY_MS = 3000;

export type SaveState =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "failed"; message: string };

export class CourseSession {
  readonly editor: Editor;
  readonly #files: HostFolder;
  readonly #project: Project;
  /** The document as the project file holds it; undefined when the file is behind. */
  #saved: Course | undefined;
  /** The document last written, to the file or an autosave. */
  #written: Course;
  #saving = false;
  #failure: string | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Writes of one project run one at a time (@course-suite/project). */
  #queue: Promise<unknown> = Promise.resolve();
  readonly #listeners = new Set<() => void>();
  /** Goes up on every edit and save-state change, for React's useSyncExternalStore. */
  version = 0;
  readonly #stop: () => void;

  /** `dirty`: the project is not what the file holds, such as recovered autosaved work. */
  constructor(
    host: HostInterface,
    readonly file: FileRef,
    project: Project,
    dirty = false,
  ) {
    this.#files = host.files.projectFiles(file);
    this.#project = project;
    this.editor = createEditor(project.course);
    this.#saved = dirty ? undefined : project.course;
    this.#written = project.course;
    this.#stop = this.editor.subscribe(() => {
      this.#timer ??= setTimeout(() => {
        this.#timer = undefined;
        // A failure shows in `state`; the next edit tries again.
        this.autosave().catch(() => {});
      }, AUTOSAVE_DELAY_MS);
      this.#emit();
    });
  }

  get dirty(): boolean {
    return this.editor.document !== this.#saved;
  }

  get state(): SaveState {
    if (this.#saving) return { kind: "saving" };
    if (this.#failure !== undefined) return { kind: "failed", message: this.#failure };
    return { kind: this.dirty ? "unsaved" : "saved" };
  }

  /** Calls `listener` after every edit and every change of the save state. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** A media file of the course, by storage key, to copy into another course's project. */
  async asset(key: string): Promise<{ data: Uint8Array; info: AssetInfo } | undefined> {
    const { assets } = this.#project;
    const asset = Object.hasOwn(assets, key) ? assets[key] : undefined;
    const data = asset && (await readAsset(this.#project, key));
    if (!asset || !data) return undefined;
    const { hash: _, size: __, ...info } = asset;
    return { data, info };
  }

  /** The bytes of a media file by storage key, for the preview; one function per session. */
  readonly media = (key: string): Promise<Uint8Array | undefined> =>
    this.asset(key).then((asset) => asset?.data);

  /**
   * Adds a media file copied from another course under its storage key, unless the project holds
   * that key already. shortcut: an existing key is taken to hold the same file, as keys are content
   * hashes by default; check the hashes once authors can name keys themselves.
   */
  async addAsset(key: string, asset: { data: Uint8Array; info: AssetInfo }): Promise<void> {
    if (Object.hasOwn(this.#project.assets, key)) return;
    await addAsset(this.#project, asset.data, asset.info, key);
  }

  /** Writes an autosave of the latest edits, if any, for crash recovery. */
  autosave(): Promise<void> {
    return this.#write(async () => {
      const document = this.editor.document;
      if (document === this.#written) return;
      this.#project.course = document;
      await autosaveProject(this.#files, this.file.name, this.#project);
      this.#written = document;
    });
  }

  /** Saves the latest document to the course file; rejects, keeping the old file, on failure. */
  save(): Promise<void> {
    this.#cancelAutosave();
    this.#saving = true;
    this.#emit();
    return this.#write(async () => {
      const document = this.editor.document;
      this.#project.course = document;
      try {
        await saveProject(this.#files, this.file.name, this.#project);
        this.#saved = document;
        this.#written = document;
      } finally {
        this.#saving = false;
      }
    });
  }

  /** Throws away the unsaved changes: the autosaves go, so the next open offers no recovery. */
  discard(): Promise<void> {
    this.#cancelAutosave();
    return this.#write(() => discardAutosaves(this.#files, this.file.name));
  }

  /** Stops autosaving and listening; an autosave already running still finishes. */
  close(): void {
    this.#cancelAutosave();
    this.#stop();
    this.#listeners.clear();
  }

  #cancelAutosave() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #write(write: () => Promise<void>): Promise<void> {
    const done = this.#queue.then(write);
    this.#queue = done.then(
      () => {
        this.#failure = undefined;
        this.#emit();
      },
      (error: unknown) => {
        this.#failure = error instanceof Error ? error.message : String(error);
        this.#emit();
      },
    );
    return done;
  }

  #emit() {
    this.version += 1;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** What opening a course file found. */
export type Opened =
  /** `recovered`: autosaved work newer than the file, to offer instead of `project`. */
  | { kind: "ok"; project: Project; recovered?: Project }
  /** The file cannot be opened; `recovered` is set when autosaved work can stand in for it. */
  | { kind: "damaged"; problems: string[]; recovered?: Project }
  /** The file is gone, or the host may no longer reach it. */
  | { kind: "missing" };

export async function openCourseFile(host: HostInterface, file: FileRef): Promise<Opened> {
  try {
    if ((await host.files.modified(file)) === undefined) return { kind: "missing" };
    const opened = await openProject(host.files.projectFiles(file), file.name);
    const recovered = opened.recovered && { recovered: opened.recovered };
    if (opened.ok) return { kind: "ok", project: opened.project, ...recovered };
    const problems = opened.problems.map(({ file: part, path, message }) =>
      [part, path, message].filter(Boolean).join(" "),
    );
    return { kind: "damaged", problems, ...recovered };
  } catch (error) {
    if (error instanceof HostError && error.code !== "unsupported") return { kind: "missing" };
    throw error;
  }
}

/**
 * The newest work in an opened course file, for changes made from the dashboard (rename,
 * duplicate): its autosaved work after a crash, which holds everything the file does and more,
 * else the file itself; undefined when neither opens.
 */
export function newestOf(opened: Opened): Project | undefined {
  if (opened.kind === "missing") return undefined;
  return opened.recovered ?? (opened.kind === "ok" ? opened.project : undefined);
}
