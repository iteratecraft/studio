// The host interface (M2-02, ENG-12, ADR-0006): everything the editors need from the edition they
// run in. Editor code reaches files, dialogs and storage only through it, never through Tauri
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
  /**
   * Reads a file the user picked, or one in the app data folder. Rejects with
   * `HostError("not-found")` when it does not exist.
   */
  read(file: FileRef): Promise<Uint8Array>;
  /**
   * Replaces a file's contents atomically: a reader, or the file after a crash, holds either the
   * old bytes or the new ones, never a mix. Only files the user picked and files in the app data
   * folder can be written; the folders in a data file's name are created as needed.
   */
  write(file: FileRef, data: Uint8Array): Promise<void>;
  /**
   * When a file the user picked, or one in the app data folder, last changed, in milliseconds
   * since 1970; `undefined` when it does not exist. The file is not read.
   */
  modified(file: FileRef): Promise<number | undefined>;
  /**
   * Deletes a file in the app data folder, such as a font the author removed from their library;
   * nothing happens when it does not exist. A file the user picked is never deleted: refused with
   * `HostError("not-allowed")`.
   */
  remove(file: FileRef): Promise<void>;
  /**
   * The files of a project the user picked, for the project container (`ProjectFiles` of
   * @course-suite/project): the picked file, by its `name`, and everything in its autosave folder
   * `.<name>.autosave` next to it (`autosaveFolderOf`, D-4). Nothing else in that folder is
   * reachable; a file the user did not pick has no project files.
   */
  projectFiles(file: FileRef): HostFolder;
}

/**
 * Files in one folder by relative paths with forward slashes, such as `Safety.crs` or
 * `.Safety.crs.autosave/3.crs`. A path outside what the folder grants is refused with
 * `HostError("not-allowed")`.
 */
export interface HostFolder {
  /** The file's bytes, or undefined when it does not exist. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Creates or replaces the file atomically, creating missing folders, flushed before resolving. */
  write(path: string, data: Uint8Array): Promise<void>;
  /**
   * Moves `from` to `to` in one step, replacing `to`: within the autosave folder, or from it over
   * the project file. The project file itself is never moved away.
   */
  rename(from: string, to: string): Promise<void>;
  /**
   * Deletes a file, or a folder and everything in it, in the autosave folder; nothing happens
   * when it does not exist.
   */
  remove(path: string): Promise<void>;
  /** Names of the files directly in the autosave folder or a folder in it; empty when missing. */
  list(folder: string): Promise<string[]>;
}

/** The autosave folder of the project file `name`, next to it (D-4). */
export const autosaveFolderOf = (name: string): string => `.${name}.autosave`;

/**
 * Small values kept between sessions, such as settings and the recent-files list. Projects and
 * media never go here: they are files.
 */
export interface HostStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Progress and cancel of a long media task. */
export interface MediaTaskOptions {
  /** Aborting it stops the task: it rejects with the signal's reason and leaves nothing behind. */
  signal?: AbortSignal;
  /** `done` of `total`: bytes while downloading, milliseconds of media while converting. */
  onProgress?: (done: number, total: number) => void;
}

/** The media converter: whether it is on this computer, and what it is. */
export interface ConverterInfo {
  installed: boolean;
  /** Its name and version, such as `FFmpeg n9.0.2`, to show before the download. */
  name: string;
  /** SPDX licence id. */
  licence: string;
  /** Bytes the download takes. */
  size: number;
}

/** A web-ready file made by the converter. */
export interface ConvertedMedia {
  data: Uint8Array;
  /** Media type: `video/webm` (VP9 and Opus) or `audio/mpeg` (MP3). */
  type: string;
  /** Extension without the dot: `webm` or `mp3`. */
  extension: string;
}

/**
 * Converting audio and video that is not web-ready (D-12, D-43): the desktop app downloads a
 * pinned LGPL converter build the first time it is needed, after the editor asks the author, checks
 * its SHA-256 and keeps it in the app's own data folder. The editions that cannot convert have no
 * `media`; the editor then asks for a web-ready file instead.
 */
export interface HostMedia {
  converter(): Promise<ConverterInfo>;
  /** Downloads, checks and keeps the converter; resolves at once when it is there already. */
  installConverter(options?: MediaTaskOptions): Promise<void>;
  /**
   * Converts a file the user picked, or a data file, with fixed settings: video to WebM (VP9 and
   * Opus, at most 1920 by 1080), audio to MP3. A data file under `media-work/` is removed once read.
   */
  convert(
    input: FileRef,
    kind: "audio" | "video",
    options?: MediaTaskOptions,
  ): Promise<ConvertedMedia>;
}

// M2-20: updates of the desktop app.

/** A newer version of the app, found by `HostUpdates.check`. */
export interface AppUpdate {
  version: string;
  /** What changed, as plain text from the release; may be empty. */
  notes: string;
}

/**
 * Why an update could not be checked, downloaded or installed:
 * - `unavailable`: this build cannot update itself (no update signing key is built in);
 * - `network`: the release site could not be reached, or the download broke off;
 * - `invalid`: the release's update information could not be read, or has nothing for this
 *   computer;
 * - `signature`: the download does not carry a valid signature of this app's key, so it was not
 *   installed;
 * - `cancelled`: the author stopped the download;
 * - `failed`: anything else, such as the installer not starting.
 */
export type UpdateFailure =
  | "unavailable"
  | "network"
  | "invalid"
  | "signature"
  | "cancelled"
  | "failed";

/** An update that did not happen; the installed app keeps working. */
export class UpdateError extends Error {
  constructor(
    readonly reason: UpdateFailure,
    message: string,
  ) {
    super(message);
    this.name = "UpdateError";
  }
}

/**
 * Updating the desktop app from the project's published releases (M2-20, ADR-0004). The editor
 * decides when to check and asks the author before anything is downloaded. Failures reject with
 * an `UpdateError`.
 */
export interface HostUpdates {
  /** Whether this build can update itself, without connecting anywhere. */
  available(): Promise<boolean>;
  /** Asks the latest published release whether it is newer; `null` when it is not. */
  check(): Promise<AppUpdate | null>;
  /**
   * Downloads the update the last check found and checks its signature against the key built
   * into the app; `onProgress` gets bytes. Aborting the signal stops it. Nothing is installed yet.
   */
  download(options?: MediaTaskOptions): Promise<void>;
  /**
   * Runs the downloaded update's installer, which replaces the app in place and starts the new
   * version: the page goes away, so it resolves only where an edition cannot restart.
   */
  install(): Promise<void>;
  /** Help > Check for updates in the app's menu; returns a function that stops listening. */
  onCheckRequested(listener: () => void): () => void;
}

/**
 * What the editors get from the edition they run in. Long tasks are not here: they keep the one
 * job contract of @course-suite/jobs (ENG-15), which wave G wires to the host's files.
 */
export interface HostInterface {
  appInfo(): Promise<AppInfo>;
  readonly files: HostFiles;
  readonly storage: HostStorage;
  /** Converting audio and video; only where the edition can (the desktop app). */
  readonly media?: HostMedia;
  /** Updating the app itself; only where the edition installs it (the desktop app). */
  readonly updates?: HostUpdates;
  /**
   * Asks `allow` before the app window closes, for example to offer to save unsaved work: the
   * window closes when it resolves to true and stays open otherwise. One listener at a time, the
   * last one set; returns a function that removes it.
   */
  onCloseRequested(allow: () => Promise<boolean>): () => void;
}

export type HostErrorCode =
  /** The file was not picked by the user and is not in the app data folder. */
  | "not-allowed"
  /** The name or request is malformed, for example a data file name with `..`. */
  | "invalid"
  /** The file does not exist. */
  | "not-found"
  /** No such capability in this edition. */
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

// A part Windows keeps as written: no separators, reserved or control characters, and no trailing
// dot or space, which Windows drops (so `...` would name the folder it is in).
const FOLDER_PART = /^[^\\/:*?"<>|]*[^\\/:*?"<>|. ]$/;
const isFolderPart = (part: string) => FOLDER_PART.test(part) && ![...part].some((c) => c < " ");

/** Checks a folder-relative path (`HostFolder`) and returns its parts. */
export function checkFolderPath(path: string): string[] {
  const parts = path.split("/");
  if (!parts.every(isFolderPart)) {
    throw new HostError("invalid", `Not a valid relative path: ${JSON.stringify(path)}`);
  }
  return parts;
}

/** What an adapter does for `projectFolder`, by path parts inside the project's folder. */
export interface FolderOps {
  read(parts: string[]): Promise<Uint8Array | undefined>;
  write(parts: string[], data: Uint8Array): Promise<void>;
  rename(from: string[], to: string[]): Promise<void>;
  remove(parts: string[]): Promise<void>;
  list(parts: string[]): Promise<string[]>;
}

/**
 * The `HostFolder` of the project file `name` over an adapter's folder operations: the rules of
 * `HostFiles.projectFiles` in one place, so every adapter refuses the same paths. (The desktop
 * shell checks them again, for page script that does not go through the host.)
 */
export function projectFolder(name: string, ops: FolderOps): HostFolder {
  const autosave = autosaveFolderOf(name);
  const refuse = (path: string): never => {
    throw new HostError("not-allowed", `Not ${name} or in ${autosave}: ${JSON.stringify(path)}`);
  };
  /** Any path the project grants. */
  const granted = (path: string): string[] => {
    const parts = checkFolderPath(path);
    return path === name || parts[0] === autosave ? parts : refuse(path);
  };
  /** A path in the autosave folder, or the folder itself. */
  const inAutosave = (path: string): string[] => {
    const parts = checkFolderPath(path);
    return parts[0] === autosave ? parts : refuse(path);
  };
  return {
    read: async (path) => ops.read(granted(path)),
    write: async (path, data) => ops.write(granted(path), data),
    rename: async (from, to) => ops.rename(inAutosave(from), granted(to)),
    remove: async (path) => ops.remove(inAutosave(path)),
    list: async (path) => ops.list(inAutosave(path)),
  };
}
