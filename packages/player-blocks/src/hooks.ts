// Hooks a host page sets before the player starts: a browser test, or the editor's preview, which
// holds the package's files in memory (ENG-13). A published course sets none, and the player then
// loads every file by its path next to the index page.
import type { KeyValueStorage, MemoryAdapter } from "@course-suite/tracking";
import type { TimedEvent } from "./runtime.js";

export interface PlayerHooks {
  /** Shorter load timeouts. */
  timeoutMs?: number;
  /**
   * Where the page holds package files instead of next to the index page, by package path (such as
   * `course-data.js` or `media/cover.jpg`): the editor's preview gives in-memory addresses.
   */
  files?: Readonly<Record<string, string>>;
  /** Where the debug adapter keeps the saved state, so that a reload resumes. */
  storage?: KeyValueStorage;
  /** Set by the player when no LMS is connected: the debug adapter, with every call it received. */
  adapter?: MemoryAdapter;
  /** Set by the player: every player event so far. */
  events?: TimedEvent[];
}

/** The global a host page sets the hooks on. */
export const HOOKS_GLOBAL = "blocksPlayerHooks";

export const hooks = (globalThis as Record<string, unknown>)[HOOKS_GLOBAL] as
  | PlayerHooks
  | undefined;

/** The address of a package file: where the page holds it, else its path next to the index page. */
export const fileUrl = (path: string): string => {
  const own = hooks?.files;
  return own && Object.hasOwn(own, path) ? (own[path] as string) : path;
};
