// In-memory host for tests: files live in a map, dialogs answer from callbacks, and the same
// scope rule as the desktop app applies, so a test fails when editor code writes a file the user
// never picked.
import {
  type AppInfo,
  checkDataName,
  type FileRef,
  HostError,
  type HostInterface,
  type OpenOptions,
  projectFolder,
  type SaveOptions,
} from "./host.js";
import { createKeyValueStorage, type KeyValueStore } from "./storage.js";

export interface MemoryHostInit {
  app?: Partial<AppInfo>;
  /** Files on the "disk", by id. The user must still pick one before the editor may read it. */
  files?: Iterable<[string, Uint8Array]>;
  /** What the open dialog returns: the ids the user picks. Default: they cancel. */
  onPickOpen?: (options: OpenOptions) => string[];
  /** What the save dialog returns: the id the user picks, or `null`. Default: the suggested name. */
  onPickSave?: (options: SaveOptions) => string | null;
}

export interface MemoryHost extends HostInterface {
  /** The "disk": every file by id, including data files under `appdata/`. */
  readonly disk: Map<string, Uint8Array>;
  /** What the user closing the window does: asks the close listener, and says whether it closed. */
  requestClose(): Promise<boolean>;
}

const DATA_PREFIX = "appdata/";

export function createMemoryHost(init: MemoryHostInit = {}): MemoryHost {
  const app: AppInfo = { name: "Course Suite", version: "0.0.0", edition: "desktop", ...init.app };
  const disk = new Map(init.files);
  // When each file last changed; files put on the disk from outside count from the host's start.
  const started = Date.now();
  const changed = new Map<string, number>();
  const put = (id: string, data: Uint8Array) => {
    disk.set(id, data.slice());
    changed.set(id, Date.now());
  };
  const picked = new Set<string>();
  const ref = (id: string): FileRef => ({ id, name: id.slice(id.lastIndexOf("/") + 1) });
  const pick = (id: string): FileRef => {
    picked.add(id);
    return ref(id);
  };
  const granted = (file: FileRef): string => {
    if (picked.has(file.id) || file.id.startsWith(DATA_PREFIX)) return file.id;
    throw new HostError("not-allowed", `Not picked by the user: ${file.id}`);
  };
  const values = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let closeListener: (() => Promise<boolean>) | undefined;
  return {
    disk,
    requestClose: async () => (closeListener ? closeListener() : true),
    onCloseRequested: (allow) => {
      closeListener = allow;
      return () => {
        if (closeListener === allow) closeListener = undefined;
      };
    },
    appInfo: async () => app,
    files: {
      pickOpen: async (options = {}) => {
        const ids = init.onPickOpen?.(options) ?? [];
        return (options.multiple ? ids : ids.slice(0, 1)).map(pick);
      },
      pickSave: async (options = {}) => {
        const id = init.onPickSave ? init.onPickSave(options) : (options.suggestedName ?? null);
        return id === null ? null : pick(id);
      },
      dataFile: async (name) => ref(DATA_PREFIX + checkDataName(name).join("/")),
      read: async (file) => {
        const data = disk.get(granted(file));
        if (!data) throw new HostError("not-found", `No such file: ${file.id}`);
        return data.slice();
      },
      modified: async (file) => {
        const id = granted(file);
        return disk.has(id) ? (changed.get(id) ?? started) : undefined;
      },
      remove: async (file) => {
        if (!file.id.startsWith(DATA_PREFIX)) {
          throw new HostError("not-allowed", `Not an app data file: ${file.id}`);
        }
        disk.delete(file.id);
        changed.delete(file.id);
      },
      // A map entry is replaced in one step, which is what atomic means here.
      write: async (file, data) => {
        put(granted(file), data);
      },
      projectFiles: (file) => {
        const folder = file.id.slice(0, file.id.length - file.name.length);
        // Checked on each call, as the desktop shell does: the file must have been picked.
        const key = (parts: string[]) => {
          granted(file);
          return folder + parts.join("/");
        };
        return projectFolder(file.name, {
          read: async (parts) => disk.get(key(parts))?.slice(),
          write: async (parts, data) => {
            put(key(parts), data);
          },
          rename: async (from, to) => {
            const data = disk.get(key(from));
            if (!data) throw new HostError("not-found", `No such file: ${key(from)}`);
            disk.delete(key(from));
            put(key(to), data);
          },
          remove: async (parts) => {
            const path = key(parts);
            for (const id of [...disk.keys()]) {
              if (id === path || id.startsWith(`${path}/`)) disk.delete(id);
            }
          },
          list: async (parts) => {
            const prefix = `${key(parts)}/`;
            return [...disk.keys()]
              .filter((id) => id.startsWith(prefix) && !id.includes("/", prefix.length))
              .map((id) => id.slice(prefix.length));
          },
        });
      },
    },
    storage: createKeyValueStorage(store),
  };
}
