// One open course: its project file, the doc-ops editing session, autosave for crash recovery and
// save on command (BLK-01, D-33). Edits go through the doc-ops editor; files go through the host's
// project files, so the same code runs on desktop and in a browser.
import { createEditor, type Editor } from "@course-suite/doc-ops";
import type { Course } from "@course-suite/format";
import { type FileRef, HostError, type HostFolder, type HostInterface } from "@course-suite/host";
import {
  autosaveProject,
  discardAutosaves,
  openProject,
  type Project,
  saveProject,
} from "@course-suite/project";

/**
 * How long after an edit the autosave runs, gathering the edits in between. BLK-01: a killed app
 * loses at most 10 seconds of work.
 */
export const AUTOSAVE_DELAY_MS = 3000;

let sessions = 0;

export type SaveState =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "failed"; message: string };

export class CourseSession {
  readonly editor: Editor;
  /** Tells sessions apart, for React keys: the file can change (save as). */
  readonly id = ++sessions;
  #file: FileRef;
  #files: HostFolder;
  readonly #host: HostInterface;
  readonly #project: Project;
  /** Fields holding typed text not yet in the document, each with its way to put it there. */
  readonly #drafts = new Set<() => void>();
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
  constructor(host: HostInterface, file: FileRef, project: Project, dirty = false) {
    this.#host = host;
    this.#file = file;
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

  /** The course file. */
  get file(): FileRef {
    return this.#file;
  }

  /**
   * Registers a field whose typed text may not be in the document yet; `commit` puts it there.
   * Returns a function that unregisters it.
   */
  holdDraft(commit: () => void): () => void {
    this.#drafts.add(commit);
    return () => this.#drafts.delete(commit);
  }

  /** Puts what every field holds into the document: before saving, leaving or closing. */
  commitDrafts(): void {
    for (const commit of [...this.#drafts]) commit();
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

  /** Writes an autosave of the latest edits, if any, for crash recovery. */
  autosave(): Promise<void> {
    return this.#write(async () => {
      const document = this.editor.document;
      if (document === this.#written) return;
      this.#project.course = document;
      await autosaveProject(this.#files, this.#file.name, this.#project);
      this.#written = document;
    });
  }

  /** Saves the latest document to the course file; rejects, keeping the old file, on failure. */
  save(): Promise<void> {
    this.commitDrafts();
    this.#cancelAutosave();
    this.#saving = true;
    this.#emit();
    return this.#write(async () => {
      const document = this.editor.document;
      this.#project.course = document;
      try {
        await saveProject(this.#files, this.#file.name, this.#project);
        this.#saved = document;
        this.#written = document;
      } finally {
        this.#saving = false;
      }
    });
  }

  /**
   * Saves the latest document, with its media and snapshots, as a new course file and goes on
   * editing that file (BLK-01 save as). The old file keeps what it last saved; its autosaves go,
   * since the work they hold now lives in the new file. Rejects, still on the old file, on failure.
   */
  saveAs(file: FileRef): Promise<void> {
    this.commitDrafts();
    this.#cancelAutosave();
    this.#saving = true;
    this.#emit();
    return this.#write(async () => {
      const document = this.editor.document;
      this.#project.course = document;
      const files = this.#host.files.projectFiles(file);
      try {
        await saveProject(files, file.name, this.#project);
        const old = { files: this.#files, name: this.#file.name };
        this.#file = file;
        this.#files = files;
        this.#saved = document;
        this.#written = document;
        await discardAutosaves(old.files, old.name).catch(() => {});
      } finally {
        this.#saving = false;
      }
    });
  }

  /** Throws away the unsaved changes: the autosaves go, so the next open offers no recovery. */
  discard(): Promise<void> {
    this.#cancelAutosave();
    return this.#write(() => discardAutosaves(this.#files, this.#file.name));
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
