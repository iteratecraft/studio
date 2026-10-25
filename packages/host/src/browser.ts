import { type AppInfo, HostError, type HostInterface } from "./host.js";
import { createKeyValueStorage, type KeyValueStore } from "./storage.js";

/**
 * Stub host for the editor in a browser, until the server adapter (M3) talks to a server: app
 * info and storage work, files refuse with an "unsupported" HostError.
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
      modified: unsupported,
      write: unsupported,
      projectFiles: () => ({
        read: unsupported,
        write: unsupported,
        rename: unsupported,
        remove: unsupported,
        list: unsupported,
      }),
    },
    storage: createKeyValueStorage(store),
    // shortcut: no close guard; the server adapter (M3) saves as the author types.
    onCloseRequested: () => () => {},
  };
}
