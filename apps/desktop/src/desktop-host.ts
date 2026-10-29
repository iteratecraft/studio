// The desktop adapter of the host interface (M2-02): HostInterface over Tauri's API, its official
// dialog plugin, the shell's own file commands (src-tauri/src/files.rs), which check every path
// against one scope rule, and its updater commands (src-tauri/src/update.rs, M2-20). This folder is
// the only place allowed to import @tauri-apps/* (biome.json); the capability file in
// src-tauri/capabilities grants exactly the commands used here.
import {
  type AppUpdate,
  type ConverterInfo,
  checkDataName,
  createKeyValueStorage,
  type FileFilter,
  type FileRef,
  HostError,
  type HostErrorCode,
  type HostInterface,
  type HostUpdates,
  type MediaTaskOptions,
  projectFolder,
  UpdateError,
  type UpdateFailure,
} from "@course-suite/host";
import { getName, getVersion } from "@tauri-apps/api/app";
import { Channel, type InvokeArgs, type InvokeOptions, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sep } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";

const ref = (path: string): FileRef => ({
  id: path,
  name: path.slice(path.lastIndexOf(sep()) + 1),
});
const filters = (list: readonly FileFilter[] = []) =>
  list.map(({ name, extensions }) => ({ name, extensions: [...extensions] }));

/** The shell's refusals start with a HostError code and a colon; other errors pass through. */
const REFUSAL = /^(not-allowed|invalid|not-found): /;

/** Calls one of the shell's file commands, turning its refusals into HostErrors. */
async function call<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(command, args, options);
  } catch (error) {
    const message = String(error);
    const code = REFUSAL.exec(message)?.[1] as HostErrorCode | undefined;
    throw code ? new HostError(code, message.slice(code.length + 2)) : new Error(message);
  }
}

/**
 * Runs one of the shell's media commands (src-tauri/src/media.rs) as a task: progress comes back
 * through a channel, and aborting the signal asks the shell to stop it.
 */
async function task<T>(
  command: string,
  args: InvokeArgs & Record<string, unknown>,
  { signal, onProgress }: MediaTaskOptions = {},
): Promise<T> {
  signal?.throwIfAborted();
  const job = crypto.randomUUID();
  const progress = new Channel<[number, number]>();
  progress.onmessage = ([done, total]) => onProgress?.(done, total);
  const stop = () => void invoke("media_cancel", { job });
  signal?.addEventListener("abort", stop);
  try {
    return await call<T>(command, { ...args, job, onProgress: progress });
  } catch (error) {
    // The shell's own word for a stopped task; the caller gets the signal's reason, as fetch does.
    if (signal?.aborted) throw signal.reason;
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
}

/** The updater's refusals start with an UpdateFailure and a colon (src-tauri/src/update.rs). */
const UPDATE_FAILURE = /^(unavailable|network|invalid|signature|cancelled|failed): /;

/** Calls one of the updater's commands, turning its refusals into UpdateErrors. */
async function updater<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = String(error);
    const reason = (UPDATE_FAILURE.exec(message)?.[1] ?? "failed") as UpdateFailure;
    throw new UpdateError(reason, message.replace(UPDATE_FAILURE, ""));
  }
}

/** The shell's updater (M2-20): Tauri's updater plugin behind the commands of update.rs. */
const updates: HostUpdates = {
  available: () => invoke<boolean>("update_ready"),
  check: () => updater<AppUpdate | null>("update_check"),
  download: async ({ signal, onProgress } = {}) => {
    signal?.throwIfAborted();
    const progress = new Channel<[number, number]>();
    progress.onmessage = ([done, total]) => onProgress?.(done, total);
    const stop = () => void invoke("update_cancel");
    signal?.addEventListener("abort", stop);
    try {
      await updater<void>("update_download", { onProgress: progress });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw error;
    } finally {
      signal?.removeEventListener("abort", stop);
    }
    // A cancel that came as the download finished: the caller gets it, and nothing is installed.
    signal?.throwIfAborted();
  },
  install: () => updater<void>("update_install"),
  onCheckRequested: (listener) => {
    // Help > Check for updates in the window's menu (update.rs).
    const stop = listen("check-for-updates", () => listener());
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  },
};

const readFile = async (path: string) =>
  new Uint8Array(await call<ArrayBuffer>("read_file", { path }));
const writeFile = (path: string, data: Uint8Array) =>
  call<void>("write_atomic", data, { headers: { path: encodeURIComponent(path) } });

export function createDesktopHost(): HostInterface {
  let dataDir: Promise<string> | undefined;
  return {
    appInfo: async () => {
      const [name, version] = await Promise.all([getName(), getVersion()]);
      return { name, version, edition: "desktop" };
    },
    files: {
      pickOpen: async ({ title, multiple = false, filters: list } = {}) => {
        const picked = await open({ multiple, filters: filters(list), ...(title && { title }) });
        return (picked === null ? [] : [picked].flat()).map(ref);
      },
      pickSave: async ({ title, suggestedName, filters: list } = {}) => {
        const picked = await save({
          filters: filters(list),
          ...(title && { title }),
          ...(suggestedName && { defaultPath: suggestedName }),
        });
        return picked === null ? null : ref(picked);
      },
      dataFile: async (name) => {
        const parts = checkDataName(name);
        dataDir ??= call<string>("data_folder");
        return ref([await dataDir, ...parts].join(sep()));
      },
      read: (file) => readFile(file.id),
      modified: async (file) =>
        (await call<number | null>("file_modified", { path: file.id })) ?? undefined,
      write: (file, data) => writeFile(file.id, data),
      // The shell refuses to remove a picked file; the data folder check is here, before the call.
      remove: async (file) => {
        dataDir ??= call<string>("data_folder");
        const folder = `${await dataDir}${sep()}`;
        if (!file.id.startsWith(folder)) {
          throw new HostError("not-allowed", `Not an app data file: ${file.id}`);
        }
        await call<void>("remove_path", { path: file.id });
      },
      projectFiles: (file) => {
        const folder = file.id.slice(0, file.id.length - file.name.length);
        const path = (parts: string[]) => folder + parts.join(sep());
        return projectFolder(file.name, {
          read: (parts) =>
            readFile(path(parts)).catch((error: unknown) => {
              if (error instanceof HostError && error.code === "not-found") return undefined;
              throw error;
            }),
          write: (parts, data) => writeFile(path(parts), data),
          rename: (from, to) => call("rename_file", { from: path(from), to: path(to) }),
          remove: (parts) => call("remove_path", { path: path(parts) }),
          list: (parts) => call("list_folder", { path: path(parts) }),
        });
      },
    },
    // The media converter (D-12, D-43): the shell downloads, checks and runs it.
    media: {
      converter: () => call<ConverterInfo>("media_converter"),
      installConverter: (options) => task<void>("media_install", {}, options),
      convert: async (input, kind, options) => {
        const data = await task<ArrayBuffer>("media_convert", { input: input.id, kind }, options);
        const video = kind === "video";
        return {
          data: new Uint8Array(data),
          type: video ? "video/webm" : "audio/mpeg",
          extension: video ? "webm" : "mp3",
        };
      },
    },
    // WebView2 keeps localStorage in the app's own profile folder, so it is private to the app.
    storage: createKeyValueStorage(localStorage),
    updates,
    onCloseRequested: (allow) => {
      // While a page listener exists, the shell leaves closing to it (destroy when allowed).
      const stop = getCurrentWindow().onCloseRequested(async (event) => {
        if (!(await allow())) event.preventDefault();
      });
      return () => {
        void stop.then((unlisten) => unlisten());
      };
    },
  };
}
