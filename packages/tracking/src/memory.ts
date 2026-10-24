// Debug tracking adapter (STD-01): keeps everything in memory, or in a storage the caller passes,
// and logs every call, so tests and the player's debug mode can see what an LMS would receive.
import type { Launch, TrackingAdapter } from "./tracker.js";

/** The part of the Web Storage interface the adapter uses; `localStorage` fits. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AdapterCall {
  method: keyof TrackingAdapter;
  args: unknown[];
}

export interface MemoryAdapterOptions {
  /** Where the resume payload and bookmark are kept. Default: a new in-memory store. */
  storage?: KeyValueStorage;
  /** Prefix of the storage keys. Default "course". */
  key?: string;
  /** What `initialize` reports besides the stored resume payload and bookmark. */
  launch?: Partial<Omit<Launch, "resume" | "location">>;
}

export interface MemoryAdapter extends TrackingAdapter {
  /** Every call in order, with its arguments. */
  readonly calls: AdapterCall[];
}

export function createMemoryAdapter(options: MemoryAdapterOptions = {}): MemoryAdapter {
  const storage = options.storage ?? mapStorage();
  const resumeKey = `${options.key ?? "course"}.resume`;
  const locationKey = `${options.key ?? "course"}.location`;
  const calls: AdapterCall[] = [];
  const log = (method: AdapterCall["method"], ...args: unknown[]) => calls.push({ method, args });
  // Blocked or failing storage must not stop the course: it then runs without resume.
  const read = (key: string) => {
    try {
      return storage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const write = (key: string, value: string) => {
    try {
      storage.setItem(key, value);
    } catch {}
  };

  return {
    calls,
    initialize() {
      log("initialize");
      const launch: Launch = {
        mode: "normal",
        status: { completion: "not-attempted", success: "unknown" },
        ...options.launch,
      };
      const resume = read(resumeKey);
      const location = read(locationKey);
      if (resume !== undefined) launch.resume = resume;
      if (location !== undefined) launch.location = location;
      return launch;
    },
    writeResume(payload) {
      log("writeResume", payload);
      write(resumeKey, payload);
    },
    writeLocation(location) {
      log("writeLocation", location);
      write(locationKey, location);
    },
    reportStatus(status) {
      log("reportStatus", status);
    },
    reportInteraction(interaction) {
      log("reportInteraction", interaction);
    },
    writeSessionTime(ms) {
      log("writeSessionTime", ms);
    },
    setExit(exit) {
      log("setExit", exit);
    },
    commit() {
      log("commit");
    },
    terminate() {
      log("terminate");
    },
  };
}

function mapStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}
