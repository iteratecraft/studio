// The host interface (M2-02, ENG-12, ADR-0006): everything the editors need from the edition they
// run in. Editor code reaches files, dialogs, storage and jobs only through it, never through Tauri
// or Node.js APIs, so one editor runs unchanged in the desktop app and in a browser.

/** Which edition the editor runs in, for the few features that differ (ARCHITECTURE.md Editions). */
export type Edition = "desktop" | "server";

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly edition: Edition;
}

/**
 * A file the editor was given: one the user picked in a dialog, or one in the app data folder.
 * `id` is opaque and stable (a path on desktop), so it can be kept, for example in a recent-files
 * list, and handed back later; never parse it. `name` is the file name, for display.
 */
export interface FileRef {
  readonly id: string;
  readonly name: string;
}

export interface FileFilter {
  /** Label shown in the dialog, from the string catalogue. */
  readonly name: string;
  /** Extensions without the dot, for example `["png", "jpg"]`. */
  readonly extensions: readonly string[];
}

export interface OpenOptions {
  readonly title?: string;
  readonly filters?: readonly FileFilter[];
  readonly multiple?: boolean;
}

export interface SaveOptions {
  readonly title?: string;
  readonly filters?: readonly FileFilter[];
  readonly suggestedName?: string;
}

export interface HostFiles {
  /** Asks the user for files to open. Resolves to an empty list when they cancel. */
  pickOpen(options?: OpenOptions): Promise<FileRef[]>;
  /** Asks the user where to save. Resolves to `null` when they cancel. */
  pickSave(options?: SaveOptions): Promise<FileRef | null>;
  /**
   * A file in the app data folder, which need not exist yet. `name` is a relative path of
   * `/`-separated parts made of letters, digits, `.`, `_` and `-` (see `checkDataName`).
   */
  dataFile(name: string): Promise<FileRef>;
  /** Reads a file the user picked, or one in the app data folder. */
  read(file: FileRef): Promise<Uint8Array>;
  /**
   * Replaces a file's contents atomically: a reader, or the file after a crash, holds either the
   * old bytes or the new ones, never a mix. Only files the user picked and files in the app data
   * folder can be written; the folders in a data file's name are created as needed.
   */
  write(file: FileRef, data: Uint8Array): Promise<void>;
}

/**
 * Small values kept between sessions, such as settings and the recent-files list. Projects and
 * media never go here: they are files.
 */
export interface HostStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface JobRequest {
  /** Which job to run, for example `"export"`; the host knows how to run each kind. */
  readonly kind: string;
  /** The job's input; it must survive structured cloning, since a job may run in a worker. */
  readonly input: unknown;
}

export interface JobProgress {
  readonly done: number;
  readonly total: number;
}

export interface JobOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: JobProgress) => void;
}

/** Long tasks. The job runner (M2-06) implements this with Web Workers on desktop. */
export interface HostJobs {
  /** Resolves to the job's result; rejects with the signal's reason when it is aborted. */
  run(request: JobRequest, options?: JobOptions): Promise<unknown>;
}

export interface HostInterface {
  appInfo(): Promise<AppInfo>;
  readonly files: HostFiles;
  readonly storage: HostStorage;
  readonly jobs: HostJobs;
}

export type HostErrorCode =
  /** The file was not picked by the user and is not in the app data folder. */
  | "not-allowed"
  /** The name or request is malformed, for example a data file name with `..`. */
  | "invalid"
  /** No job of that kind, or no such capability in this edition. */
  | "unsupported";

/** A request the host refused. Failures of the platform itself (disk full, file locked) pass through. */
export class HostError extends Error {
  constructor(
    readonly code: HostErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HostError";
  }
}

const DATA_NAME_PART = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Checks a data file name and returns its parts. A part may not start with `.`, which rules out
 * `.` and `..`; parts are short enough for Windows paths.
 */
export function checkDataName(name: string): string[] {
  const parts = name.split("/");
  if (!parts.every((part) => part.length <= 100 && DATA_NAME_PART.test(part))) {
    throw new HostError("invalid", `Not a valid app data file name: ${JSON.stringify(name)}`);
  }
  return parts;
}
