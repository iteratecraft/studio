// Browser entry of the Blocks player, built as one classic script (ADR-0003). It creates the
// registry the data file and chunks register on, loads the course data with a 10-second timeout
// (rise.md rule 20), opens the tracking session with the LMS the package was published for and
// starts the shell. A part that fails to load
// shows the error screen with Retry; the error is logged to the console and sent nowhere (ADR-0004).
import { formatLabel, type Labels, resolveLabels } from "@course-suite/labels";
import {
  type Cmi5Adapter,
  createCmi5Adapter,
  createMemoryAdapter,
  createScorm12Adapter,
  createScorm2004Adapter,
  createXapiAdapter,
  findScorm12Api,
  findScorm2004Api,
  RESUME_CAPS,
  readCmi5Launch,
  readXapiLaunch,
  resumeCapFor,
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
import { fileUrl, hooks } from "./hooks.js";
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
/** The cmi5 session, which may name a page to return to when it ends (standards.md C-8). */
let cmi5: Cmi5Adapter | undefined;

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
  return loadScript(name, fileUrl(src), testTimeout ?? timeoutMs).catch((error: unknown) => {
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
        // The cap the package was published for, the same one the publish check used. Plain web
        // and a preview get the strictest (SCORM 1.2's), so a preview warns as soon as a SCORM 1.2
        // package would.
        resumeCap: (data.standard && resumeCapFor(data.standard)) ?? RESUME_CAPS.scorm12,
      }).then((runtime) => {
        if (hooks) {
          if (adapter === memory) hooks.adapter = memory;
          const events: TimedEvent[] = [];
          hooks.events = events;
          runtime.on((event) => events.push(event));
        }
        const returnUrl = safeUrl(cmi5?.returnUrl);
        runtime.on((event) => {
          if (event.type === "save-failed") notice();
          // After the session has ended, back to the LMS (standards.md C-8).
          if (event.type === "exit" && returnUrl) setTimeout(() => location.assign(returnUrl));
        });
        if (runtime.saveFailed) notice();
        // Page-hide, not unload, so mobile browsers and a removed frame still save (standards.md rule 9).
        window.addEventListener("pagehide", () => runtime.exit("page-hide"));
        shell = h("div", { class: "player" });
        root.replaceChildren(notices, shell, errorScreen);
        // An LMS that names a page to return to gets an exit button to go back by.
        const course = returnUrl
          ? {
              ...data.course,
              publish: { standard: "cmi5" as const, ...data.course.publish, exitLink: true },
            }
          : data.course;
        startShell(shell, course, labels, runtime);
      });
    })
    .catch(() => status.remove());
}

/** The adapter for the standard the package was published for, or undefined when none is there. */
function connect(data: CourseData): TrackingAdapter | undefined {
  if (data.standard === "scorm2004") {
    const api = findScorm2004Api(window);
    return api && createScorm2004Adapter(api);
  }
  if (data.standard === "scorm12") {
    const api = findScorm12Api(window);
    return api && createScorm12Adapter(api);
  }
  if (data.standard === "cmi5") {
    // The LRS, learner, registration and fetch URL come from the LMS's launch link (standards.md C-1).
    const launch = readCmi5Launch(new URLSearchParams(location.search));
    if ("error" in launch) {
      console.error(`cmi5 reporting is off. ${launch.error}`);
      return undefined;
    }
    cmi5 = createCmi5Adapter({
      launch,
      course: data.course,
      onConnection: offline,
      onError: saveError,
    });
    return cmi5;
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
    onError: saveError,
  });
}

/** The LRS refused a request for good: the console has the details, the learner gets the notice. */
function saveError(error: unknown): void {
  console.error(error);
  notice();
}

/** `url` when it is an http or https address, so a launch-data value cannot run script. */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return /^https?:$/.test(new URL(url, location.href).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
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
