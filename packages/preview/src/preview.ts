// The preview controller (ENG-13; UI-BLOCKS-EDITOR P1, R52): shows the current course in the real
// player inside a sandboxed frame, from the overview or from a given lesson, and shows it again
// after every change of the document, once the author pauses. A new frame loads beside the shown
// one and replaces it once the player shows its page, at the same lesson and scroll position and
// with the same learner progress, so an update does not flash. Tracking goes to the player's debug
// adapter, inside the frame: nothing is sent anywhere.
import type { Course } from "@course-suite/format";
import { pageHash, pagesOf, parseRoute } from "@course-suite/player-blocks";
import type { AdapterCall } from "@course-suite/tracking";
import { type FontSource, type MediaSource, type PreviewPackage, previewPackage } from "./files.js";
import { FRAME_URL, type FromFrame, type ToFrame } from "./frame.js";

/** The document and its change events; a doc-ops Editor is one. */
export interface PreviewSource {
  readonly document: Course;
  subscribe(listener: (event: { document: Course }) => void): () => void;
}

export interface PreviewOptions {
  source: PreviewSource;
  media: MediaSource;
  /** The files of the theme's fonts: bundled, or from the author's font library (ENG-08). */
  fonts: FontSource;
  /** Id of the lesson or quiz to open first; the overview when absent. */
  start?: string | undefined;
  /** Accessible name of the frame. */
  title: string;
  /** How long the document must stay unchanged before the preview updates. */
  updateDelayMs?: number;
  /** Each time a load shows its first page: milliseconds since the load began. */
  onRender?: (ms: number) => void;
}

export interface Preview {
  /** Id of the lesson or quiz on show, or undefined on the overview. */
  readonly page: string | undefined;
  /** How far the page on show is scrolled, in CSS pixels. */
  readonly scrollY: number;
  /** Forgets all learner progress and opens the start page again. */
  restart(): void;
  /** The calls the player made to its debug adapter since the frame on show loaded. */
  calls(): Promise<AdapterCall[]>;
  /** Removes the frames and stops listening. */
  dispose(): void;
}

export const UPDATE_DELAY_MS = 300;

interface Load {
  frame: HTMLIFrameElement;
  started: number;
  /** After a restart the frame still on show reports nothing more: its progress is forgotten. */
  retired?: boolean;
  files: Promise<PreviewPackage>;
}

/**
 * Starts a preview in `container`, which gets the frames. The frame still loading carries the
 * `data-pending` attribute: style it hidden, over the frame on show.
 */
export function createPreview(container: HTMLElement, options: PreviewOptions): Preview {
  const { source, media, fonts } = options;
  const startHash = options.start ? pageHash(options.start) : "";
  let hash = startHash;
  let scrollY = 0;
  let state = new Map<string, string>();
  let shown: Load | undefined;
  let pending: Load | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const replies: ((calls: AdapterCall[]) => void)[] = [];

  function load(): void {
    const frame = container.ownerDocument.createElement("iframe");
    frame.title = options.title;
    // Scripts only: an opaque origin, no forms, pop-ups or navigation of the editor.
    frame.sandbox.add("allow-scripts");
    frame.setAttribute("data-pending", "");
    frame.src = FRAME_URL;
    pending?.frame.remove();
    pending = {
      frame,
      started: performance.now(),
      files: previewPackage(source.document, media, fonts),
    };
    container.append(frame);
  }

  // "*": a sandboxed frame's origin is opaque, so no origin can name it; its window is the target.
  const post = (to: Load, message: ToFrame) => to.frame.contentWindow?.postMessage(message, "*");

  function onMessage(event: MessageEvent): void {
    const from = [pending, shown].find((load) => load && event.source === load.frame.contentWindow);
    const message = event.data as FromFrame;
    if (!from || typeof message !== "object" || message === null) return;
    if (message.type === "ready" && from === pending) {
      const sent = pending;
      sent.files.then(({ index, files }) => {
        if (sent === pending)
          post(sent, { type: "load", index, files, hash, scrollY, state: [...state] });
      });
    } else if (message.type === "rendered" && from === pending) {
      const refocus = shown !== undefined && container.ownerDocument.activeElement === shown.frame;
      shown?.frame.remove();
      shown = pending;
      pending = undefined;
      shown.frame.removeAttribute("data-pending");
      if (refocus) shown.frame.focus();
      options.onRender?.(performance.now() - shown.started);
    } else if (message.type === "calls" && from === shown && Array.isArray(message.calls)) {
      for (const reply of replies.splice(0)) reply(message.calls);
    } else if (from.retired) {
      return;
    } else if (
      message.type === "save" &&
      typeof message.key === "string" &&
      typeof message.value === "string"
    ) {
      state.set(message.key, message.value);
    } else if (
      message.type === "view" &&
      from === shown &&
      typeof message.hash === "string" &&
      Number.isFinite(message.scrollY)
    ) {
      hash = message.hash;
      scrollY = message.scrollY;
    }
  }

  const owner = container.ownerDocument.defaultView;
  owner?.addEventListener("message", onMessage);
  const unsubscribe = source.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(load, options.updateDelayMs ?? UPDATE_DELAY_MS);
  });
  load();

  return {
    get page() {
      const route = parseRoute(hash, pagesOf(source.document));
      return route.kind === "page" ? route.page.id : undefined;
    },
    get scrollY() {
      return scrollY;
    },
    restart() {
      clearTimeout(timer);
      if (shown) shown.retired = true;
      state = new Map();
      hash = startHash;
      scrollY = 0;
      load();
    },
    calls() {
      if (!shown) return Promise.resolve([]);
      const reply = new Promise<AdapterCall[]>((resolve) => replies.push(resolve));
      post(shown, { type: "calls" });
      return reply;
    },
    dispose() {
      clearTimeout(timer);
      unsubscribe();
      owner?.removeEventListener("message", onMessage);
      pending?.frame.remove();
      shown?.frame.remove();
      pending = shown = undefined;
      for (const reply of replies.splice(0)) reply([]);
    },
  };
}
