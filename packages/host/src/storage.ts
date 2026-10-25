import type { HostStorage } from "./host.js";

/** The part of the Web Storage API the storage port needs; `localStorage` is one. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "course-suite:";

/**
 * Host storage over a Web Storage object. On desktop `localStorage` lives in the app's own WebView2
 * profile, so it is private to the app and survives restarts.
 */
export function createKeyValueStorage(store: KeyValueStore): HostStorage {
  return {
    get: async (key) => store.getItem(PREFIX + key) ?? undefined,
    set: async (key, value) => store.setItem(PREFIX + key, value),
    delete: async (key) => store.removeItem(PREFIX + key),
  };
}
