// The blocks editor in a plain browser against the in-memory host (M2-08): the dev and test route
// next to the kit gallery, which the Playwright tests drive. `?theme=light|dark` pins a theme.
// `window.editorTest` lets a test answer the file dialogs, read the in-memory disk, close the
// window and restart the app on the same disk, as after a crash. `?converter` gives the host a
// stand-in media converter (M2-13) whose download and conversion stop half way until the test
// calls `editorTest.converter.finish()` or the author cancels. `?hold-export` holds each export's
// build until the test calls `editorTest.exports.release()` (M2-18), so cancel can be tested.
// `?updates` gives the host a stand-in updater (M2-20): `?updates=found` finds version 9.9.10 at
// start, `?updates=unavailable` is a build without an update key; `editorTest.updates` sets what
// the next check answers, picks Help > Check for updates (`menu()`) and finishes a download.
// `?version=0.1.0` sets the version the app reports (the user guide's pictures, M2-22).
import "@course-suite/ui/styles.css";
import "@course-suite/blocks-editor/styles.css";
import { BlocksEditorApp } from "@course-suite/blocks-editor";
import {
  type AppUpdate,
  createMemoryHost,
  type HostMedia,
  type HostUpdates,
  type MediaTaskOptions,
  type MemoryHost,
  UpdateError,
  type UpdateFailure,
} from "@course-suite/host";
// The export worker as the desktop app starts it (M2-18, ADR-0006).
import ExportWorker from "@course-suite/jobs/export-worker?worker";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

interface EditorTest {
  host: MemoryHost;
  /** What the open dialog picks next; empty: the user cancels. */
  open: string[];
  /** What the save dialog picks next: an id, `null` to cancel, or undefined for the suggestion. */
  save: string | null | undefined;
  /** Unmounts the app without asking anything and starts it again on the same disk. */
  restart(): void;
  /** With `?hold-export`: builds waiting to start, and builds stopped by cancel. */
  exports: { release(): void; held: number; terminated: number };
  /** The stand-in converter, with `?converter`. */
  converter: {
    installed: boolean;
    /** What it was asked to do: `install`, or `convert <kind> <file id>`. */
    calls: string[];
    /** Lets the task waiting half way finish. */
    finish(): void;
  };
  /** The stand-in updater, with `?updates`. */
  updates: {
    /** Whether the build has an update key. */
    ready: boolean;
    /** What the next check answers: an update, `null` for none, or the reason it fails. */
    answer: AppUpdate | null | UpdateFailure;
    /** The reason the next download fails once finished; undefined: it succeeds. */
    downloadFails?: UpdateFailure;
    /** What it was asked to do: `check`, `download`, `install`. */
    calls: string[];
    /** The author picks Help > Check for updates. */
    menu(): void;
    /** Lets the download waiting half way finish. */
    finish(): void;
  };
}

declare global {
  interface Window {
    editorTest: EditorTest;
  }
}

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

/**
 * A task that reports half its work, then waits for the test to finish it (`hold` gets the
 * finish function; the converter's by default) or for cancel. A result that throws rejects.
 */
function halfway<T>(
  { signal, onProgress }: MediaTaskOptions,
  total: number,
  result: () => T,
  hold = (finish: () => void) => {
    test.converter.finish = finish;
  },
) {
  return new Promise<T>((resolve, reject) => {
    signal?.throwIfAborted();
    onProgress?.(total / 2, total);
    const stop = () => reject(signal?.reason);
    signal?.addEventListener("abort", stop);
    hold(() => {
      signal?.removeEventListener("abort", stop);
      try {
        resolve(result());
      } catch (error) {
        reject(error);
      }
    });
  });
}

const converter: HostMedia = {
  converter: async () => ({
    installed: test.converter.installed,
    name: "Stand-in converter 1.0",
    licence: "LGPL-3.0-or-later",
    size: 77_000_000,
  }),
  installConverter: (options = {}) => {
    test.converter.calls.push("install");
    return halfway(options, 77_000_000, () => {
      test.converter.installed = true;
    });
  },
  convert: (input, kind, options = {}) => {
    test.converter.calls.push(`convert ${kind} ${input.id}`);
    // Stand-in output: an EBML header is enough for the editor to take it as WebM.
    const data = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new TextEncoder().encode(input.id)]);
    return halfway(options, 90_000, () =>
      kind === "video"
        ? { data, type: "video/webm", extension: "webm" }
        : { data: new Uint8Array([0x49, 0x44, 0x33, 4, 0]), type: "audio/mpeg", extension: "mp3" },
    );
  },
};

/** The stand-in updater: what a check finds is set by the test, and a download waits half way. */
const updatesMode = new URLSearchParams(location.search).get("updates");
const version = new URLSearchParams(location.search).get("version");
const menuListeners = new Set<() => void>();
const updater: HostUpdates = {
  available: async () => test.updates.ready,
  check: async () => {
    test.updates.calls.push("check");
    const { answer } = test.updates;
    if (typeof answer === "string") throw new UpdateError(answer, `stand-in ${answer}`);
    return answer;
  },
  download: (options = {}) => {
    test.updates.calls.push("download");
    return halfway(
      options,
      12_000_000,
      () => {
        const reason = test.updates.downloadFails;
        if (reason) throw new UpdateError(reason, `stand-in ${reason}`);
      },
      (finish) => {
        test.updates.finish = finish;
      },
    );
  },
  // The real one ends the page as the installer starts; this one never settles.
  install: () => {
    test.updates.calls.push("install");
    return new Promise(() => {});
  },
  onCheckRequested: (listener) => {
    menuListeners.add(listener);
    return () => menuListeners.delete(listener);
  },
};

const test: EditorTest = {
  host: createMemoryHost({
    onPickOpen: () => test.open,
    onPickSave: (options) =>
      test.save === undefined ? (options.suggestedName ?? null) : test.save,
    ...(new URLSearchParams(location.search).has("converter") && { media: converter }),
    ...(updatesMode !== null && { updates: updater }),
    ...(version && { app: { version } }),
  }),
  open: [],
  save: undefined,
  restart: () => {},
  exports: { release: () => {}, held: 0, terminated: 0 },
  converter: { installed: false, calls: [], finish: () => {} },
  updates: {
    ready: updatesMode !== "unavailable",
    answer:
      updatesMode === "found"
        ? { version: "9.9.10", notes: "Faster preview.\nClearer error messages." }
        : null,
    calls: [],
    menu: () => {
      for (const listener of menuListeners) listener();
    },
    finish: () => {},
  },
};
window.editorTest = test;

/**
 * The export worker, or with `?hold-export` one whose build starts only when the test releases it:
 * the page's side of runInWorker sees a worker, so cancel terminates it as it would the real one.
 */
function exportWorker(): Worker {
  if (!new URLSearchParams(location.search).has("hold-export")) return new ExportWorker();
  const real = new ExportWorker();
  const held = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage(input: unknown) {
      test.exports.held += 1;
      test.exports.release = () => {
        test.exports.held -= 1;
        real.onmessage = (event) => held.onmessage?.(event);
        real.onerror = (event) => held.onerror?.(event);
        real.onmessageerror = (event) => held.onmessageerror?.(event);
        real.postMessage(input);
      };
    },
    terminate() {
      test.exports.terminated += 1;
      real.terminate();
    },
  };
  return held as unknown as Worker;
}

const element = document.getElementById("root");
if (!element) throw new Error("editor.html has no #root element");
let root = createRoot(element);
const render = () =>
  root.render(
    <StrictMode>
      <BlocksEditorApp host={test.host} exportWorker={exportWorker} />
    </StrictMode>,
  );
test.restart = () => {
  root.unmount();
  root = createRoot(element);
  render();
};
render();
