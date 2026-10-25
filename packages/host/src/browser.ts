import { type AppInfo, HostError, type HostInterface } from "./host.js";
import { createJobs } from "./jobs.js";
import { createKeyValueStorage, type KeyValueStore } from "./storage.js";

/**
 * Stub host for the editor in a browser, until the server adapter (M3) talks to a server: app
 * info and storage work, files and jobs refuse with an "unsupported" HostError.
 */
export function createBrowserHost(
  app: Omit<AppInfo, "edition">,
  store: KeyValueStore,
): HostInterface {
  const unsupported = async (): Promise<never> => {
    throw new HostError("unsupported", "Files need the server edition, which is not built yet");
  };
  return {
    appInfo: async () => ({ ...app, edition: "server" }),
    files: {
      pickOpen: unsupported,
      pickSave: unsupported,
      dataFile: unsupported,
      read: unsupported,
      write: unsupported,
    },
    storage: createKeyValueStorage(store),
    jobs: createJobs({}),
  };
}
