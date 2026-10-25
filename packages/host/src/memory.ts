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
  type SaveOptions,
} from "./host.js";
import { createJobs, type JobHandlers } from "./jobs.js";
import { createKeyValueStorage, type KeyValueStore } from "./storage.js";

export interface MemoryHostInit {
  app?: Partial<AppInfo>;
  /** Files on the "disk", by id. The user must still pick one before the editor may read it. */
  files?: Iterable<[string, Uint8Array]>;
  /** What the open dialog returns: the ids the user picks. Default: they cancel. */
  onPickOpen?: (options: OpenOptions) => string[];
  /** What the save dialog returns: the id the user picks, or `null`. Default: the suggested name. */
  onPickSave?: (options: SaveOptions) => string | null;
  jobs?: JobHandlers;
}

export interface MemoryHost extends HostInterface {
  /** The "disk": every file by id, including data files under `appdata/`. */
  readonly disk: Map<string, Uint8Array>;
}

const DATA_PREFIX = "appdata/";

export function createMemoryHost(init: MemoryHostInit = {}): MemoryHost {
  const app: AppInfo = { name: "Course Suite", version: "0.0.0", edition: "desktop", ...init.app };
  const disk = new Map(init.files);
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
  return {
    disk,
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
        if (!data) throw new Error(`No such file: ${file.id}`);
        return data.slice();
      },
      // A map entry is replaced in one step, which is what atomic means here.
      write: async (file, data) => {
        disk.set(granted(file), data.slice());
      },
    },
    storage: createKeyValueStorage(store),
    jobs: createJobs(init.jobs ?? {}),
  };
}
