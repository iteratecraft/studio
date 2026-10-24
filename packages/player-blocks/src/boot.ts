// Browser entry of the Blocks player, built as one classic script (ADR-0003). It creates the
// registry the data file and chunks register on, loads the course data with a 10-second timeout
// (rise.md rule 20), opens the tracking session with the LMS the package was published for and
// starts the shell. A part that fails to load
// shows the error screen with Retry; the error is logged to the console and sent nowhere (ADR-0004).
import { formatLabel, type Labels, resolveLabels } from "@course-suite/labels";
import {
  createMemoryAdapter,
  createScorm12Adapter,
  createXapiAdapter,
  findScorm12Api,
  type KeyValueStorage,
  type MemoryAdapter,
  RESUME_CAPS,
  readXapiLaunch,
  type TrackingAdapter,
} from "@course-suite/tracking";
import {
  CHUNK_DIR,
  CHUNK_NAME,
  CHUNK_TIMEOUT_MS,
  type CourseData,
  DATA_CHUNK,
  DATA_FILE,
  DATA_TIMEOUT_MS,
  decodeCourseData,
  REGISTRY_GLOBAL,
} from "./data.js";
import { h } from "./dom.js";
import { ChunkLoadError, createLoader } from "./loader.js";
import { startRuntime, type TimedEvent } from "./runtime.js";
import { startShell } from "./shell.js";

/** What chunks, plugins and the data file see on the global registry. */
export interface PlayerRegistry {
  /** Registers a chunk by name; the first registration of a name wins. */
  register(name: string, value: unknown): void;
  /** Loads `chunks/<name>.js`; on failure the error screen offers Retry. */
  load(name: string): Promise<unknown>;
}

/** Test-only hooks a browser test sets before the player starts. */
export interface TestHooks {
  /** Shorter load timeouts. */
  timeoutMs?: number;
  /** Where the debug adapter keeps the saved state, so that a reload resumes. */
  storage?: KeyValueStorage;
  /** Set by the player when no LMS is connected: the debug adapter, with every call it received. */
  adapter?: MemoryAdapter;
  /** Set by the player: every player event so far. */
  events?: TimedEvent[];
}
const hooks = (globalThis as { blocksPlayerTestHooks?: TestHooks }).blocksPlayerTestHooks;
const testTimeout = hooks?.timeoutMs;

const root = document.getElementById("app") ?? document.body;
const registry = new Map<string, unknown>();
const loadScript = createLoader(document, registry);
let labels: Labels = resolveLabels();
const failures = new Map<string, () => void>();
const errorScreen = h("div", { class: "load-error", role: "alert", hidden: true });
// The notice slot: a live region in place from the start, so a notice is announced and never blocks.
const notices = h("div", { class: "notices", role: "status" });
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
      // The standard is fixed at publish (standards.md P-1). Without an LMS or LRS a Blocks
      // course keeps nothing (rise.md §4 "Published web package", ADR-0005): the debug adapter
      // holds the session in memory, and only a test hands it a storage.
      const memory = createMemoryAdapter(hooks?.storage ? { storage: hooks.storage } : {});
      const adapter = connect(data) ?? memory;
      return startRuntime({
        course: data.course,
        adapter,
        // A preview has no package version; the last edit time stands in for it.
        packageVersion: String(data.packageVersion ?? data.course.updatedAt ?? ""),
        // An LRS state document has room; anything else, a preview too, gets the strictest cap
        // (SCORM 1.2's), so a preview warns as soon as a SCORM 1.2 package would.
        resumeCap: data.standard === "xapi" ? RESUME_CAPS.xapi : RESUME_CAPS.scorm12,
      }).then((runtime) => {
        if (hooks) {
          if (adapter === memory) hooks.adapter = memory;
          const events: TimedEvent[] = [];
          hooks.events = events;
          runtime.on((event) => events.push(event));
        }
        runtime.on((event) => {
          if (event.type === "save-failed") notice();
        });
        if (runtime.saveFailed) notice();
        // Page-hide, not unload, so mobile browsers and a removed frame still save (standards.md rule 9).
        window.addEventListener("pagehide", () => runtime.exit("page-hide"));
        shell = h("div", { class: "player" });
        root.replaceChildren(notices, shell, errorScreen);
        startShell(shell, data.course, labels, runtime);
      });
    })
    .catch(() => status.remove());
}

/** The adapter for the standard the package was published for, or undefined when none is there. */
function connect(data: CourseData): TrackingAdapter | undefined {
  if (data.standard === "scorm12") {
    const api = findScorm12Api(window);
    return api && createScorm12Adapter(api);
  }
  if (data.standard !== "xapi") return undefined;
  // The LRS, learner and registration come from the launch link (standards.md X-1).
  const launch = readXapiLaunch(new URLSearchParams(location.search), data.lrs);
  if ("error" in launch) {
    // One console error and no requests; the course runs without reporting.
    console.error(`xAPI reporting is off. ${launch.error}`);
    return undefined;
  }
  return createXapiAdapter({
    launch,
    course: data.course,
    onConnection: offline,
    onError: (error) => {
      console.error(error);
      notice();
    },
  });
}

/** The offline banner while statements wait to be sent (standards.md X-5); it goes when they are. */
function offline(online: boolean): void {
  if (online) {
    notices.querySelector(".notice-offline")?.remove();
    return;
  }
  notices.replaceChildren(
    h("div", { class: "notice notice-offline" }, h("p", {}, labels["notice.offline"])),
  );
}

/** The save-failed notice: the course goes on, and the learner may dismiss it (standards.md P-20). */
function notice(): void {
  const dismiss = h(
    "button",
    { type: "button", class: "notice-dismiss" },
    labels["notice.dismiss"],
  );
  const box = h("div", { class: "notice" }, h("p", {}, labels["notice.saveFailed"]), dismiss);
  dismiss.addEventListener("click", () => box.remove());
  notices.replaceChildren(box);
}

boot();
