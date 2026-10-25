// The desktop adapter of the host interface (M2-02): HostInterface over Tauri's API and its
// official dialog and file system plugins. This folder is the only place allowed to import
// @tauri-apps/* (biome.json); the capability file in src-tauri/capabilities grants exactly the
// commands used here.
import {
  checkDataName,
  createJobs,
  createKeyValueStorage,
  type FileFilter,
  type FileRef,
  type HostInterface,
} from "@course-suite/host";
import { getName, getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, sep } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

const ref = (path: string): FileRef => ({
  id: path,
  name: path.slice(path.lastIndexOf(sep()) + 1),
});
const filters = (list: readonly FileFilter[] = []) =>
  list.map(({ name, extensions }) => ({ name, extensions: [...extensions] }));

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
        dataDir ??= appLocalDataDir();
        return ref([await dataDir, ...parts].join(sep()));
      },
      read: (file) => readFile(file.id),
      write: (file, data) =>
        invoke("write_atomic", data, { headers: { path: encodeURIComponent(file.id) } }),
    },
    // WebView2 keeps localStorage in the app's own profile folder, so it is private to the app.
    storage: createKeyValueStorage(localStorage),
    // shortcut: jobs run on the UI thread with no kinds registered; the job runner (M2-06) brings
    // Web Workers and wave G wires it here.
    jobs: createJobs({}),
  };
}
