// Browser entry of the Blocks player, built as one classic script (ADR-0003). It creates the
// registry the data file and chunks register on, loads the course data with a 10-second timeout
// (rise.md rule 20), and starts the shell. A part that fails to load shows the error screen with
// Retry; the error is logged to the console and sent nowhere (ADR-0004).
import { formatLabel, type Labels, resolveLabels } from "@course-suite/labels";
import {
  CHUNK_DIR,
  CHUNK_NAME,
  CHUNK_TIMEOUT_MS,
  DATA_CHUNK,
  DATA_FILE,
  DATA_TIMEOUT_MS,
  decodeCourseData,
  REGISTRY_GLOBAL,
} from "./data.js";
import { h } from "./dom.js";
import { ChunkLoadError, createLoader } from "./loader.js";
import { startShell } from "./shell.js";

/** What chunks, plugins and the data file see on the global registry. */
export interface PlayerRegistry {
  /** Registers a chunk by name; the first registration of a name wins. */
  register(name: string, value: unknown): void;
  /** Loads `chunks/<name>.js`; on failure the error screen offers Retry. */
  load(name: string): Promise<unknown>;
}

// Test-only: browser tests shorten the load timeouts before the player starts.
const testTimeout = (globalThis as { blocksPlayerTestHooks?: { timeoutMs?: number } })
  .blocksPlayerTestHooks?.timeoutMs;

const root = document.getElementById("app") ?? document.body;
const registry = new Map<string, unknown>();
const loadScript = createLoader(document, registry);
let labels: Labels = resolveLabels();
const failures = new Map<string, () => void>();
const errorScreen = h("div", { class: "load-error", role: "alert", hidden: true });
let shell: HTMLElement | undefined;

const player: PlayerRegistry = {
  register(name, value) {
    if (!registry.has(name)) registry.set(name, value);
  },
  load(name) {
    if (!CHUNK_NAME.test(name))
      return Promise.reject(new ChunkLoadError(name, "is not a chunk name"));
    return load(
      name,
      `${CHUNK_DIR}/${name}.js`,
      CHUNK_TIMEOUT_MS,
      () => void player.load(name).catch(() => {}),
    );
  },
};
(globalThis as Record<string, unknown>)[REGISTRY_GLOBAL] = player;

function load(name: string, src: string, timeoutMs: number, retry: () => void): Promise<unknown> {
  return loadScript(name, src, testTimeout ?? timeoutMs).catch((error: unknown) => {
    fail(name, error, retry);
    throw error;
  });
}

function fail(name: string, error: unknown, retry: () => void): void {
  console.error(error);
  failures.set(name, retry);
  showErrors();
}

function showErrors(): void {
  const parts = [...failures.keys()];
  errorScreen.hidden = parts.length === 0;
  if (shell) shell.hidden = parts.length > 0;
  if (parts.length === 0) return;
  const retry = h("button", { type: "button", class: "button" }, labels["error.retry"]);
  retry.addEventListener("click", () => {
    const pending = [...failures.values()];
    failures.clear();
    showErrors();
    for (const again of pending) again();
  });
  errorScreen.replaceChildren(
    ...parts.map((part) =>
      h(
        "p",
        {},
        formatLabel(labels, "error.loadFailed", {
          part: part === DATA_CHUNK ? labels["error.partContent"] : part,
        }),
      ),
    ),
    retry,
  );
  document.title = errorScreen.firstChild?.textContent ?? "";
  retry.focus();
}

function boot(): void {
  const status = h("p", { class: "loading", role: "status" }, labels["status.loading"]);
  root.replaceChildren(status, errorScreen);
  load(DATA_CHUNK, DATA_FILE, DATA_TIMEOUT_MS, boot)
    .then((value) => {
      const data = decodeCourseData(value);
      if (!data) {
        // The file loaded but holds no course; only reading the whole package again can help.
        fail(DATA_CHUNK, new ChunkLoadError(DATA_CHUNK, "is not course data"), () =>
          location.reload(),
        );
        status.remove();
        return;
      }
      labels = resolveLabels(data.labels);
      document.documentElement.lang = data.course.sourceLanguage ?? data.labels?.language ?? "en";
      shell = h("div", { class: "player" });
      root.replaceChildren(shell, errorScreen);
      startShell(shell, data.course, labels);
    })
    .catch(() => status.remove());
}

boot();
