// The preview frame (ENG-13): a sandboxed document (scripts only, opaque origin) that turns the
// package files the editor posts it into in-memory addresses and boots the real player from them,
// as the package's index page would. It reports what the learner sees back to the editor and keeps
// the debug adapter's saved state there, so a live update or a restart can carry it or drop it.
//
// The editor's content security policy covers the frame too (a data: document inherits it). It
// allows this script by its hash (FRAME_SCRIPT_HASH), blob: script, style and images for the
// in-memory files, and data: frames; apps/desktop/README.md lists the additions.
//
// shortcut: the script is a literal because its hash is pinned in the policy; a bundler must never
// rewrite it. Change it here and the hash with it (frame.test.ts fails until they match).
import { HOOKS_GLOBAL } from "@course-suite/player-blocks";
import type { AdapterCall } from "@course-suite/tracking";

/** One package file: its path, its bytes and the media type a web server would give it. */
export type PackageFile = [path: string, data: Uint8Array, type: string];

/** What the editor posts the frame. */
export type ToFrame =
  | {
      type: "load";
      /** The package's index page: it names the player's style sheets and scripts. */
      index: string;
      files: PackageFile[];
      /** Address to open: `#/lessons/<id>`, or empty for the overview. */
      hash: string;
      scrollY: number;
      /** The debug adapter's saved state, by storage key. */
      state: [key: string, value: string][];
    }
  | { type: "calls" };

/** What the frame posts the editor. */
export type FromFrame =
  | { type: "ready" }
  /** The player shows its first page (or its load-error screen). */
  | { type: "rendered" }
  | { type: "view"; hash: string; scrollY: number }
  | { type: "save"; key: string; value: string }
  | { type: "calls"; calls: AdapterCall[] };

export const FRAME_SCRIPT = `"use strict";
(() => {
  const send = (message) => parent.postMessage(message, "*");
  let hooks;
  let started = false;
  let queued = 0;
  const view = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      send({ type: "view", hash: location.hash, scrollY: scrollY });
    });
  };
  addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== parent || typeof message !== "object" || message === null) return;
    if (message.type === "calls") {
      const calls = (hooks && hooks.adapter && hooks.adapter.calls) || [];
      send({ type: "calls", calls: JSON.parse(JSON.stringify(calls)) });
    }
    if (message.type !== "load" || started) return;
    started = true;
    const urls = {};
    for (const [path, data, type] of message.files) {
      urls[path] = URL.createObjectURL(new Blob([data], { type: type }));
    }
    const state = new Map(message.state);
    hooks = window.${HOOKS_GLOBAL} = {
      files: urls,
      storage: {
        getItem: (key) => (state.has(key) ? state.get(key) : null),
        setItem: (key, value) => {
          state.set(key, value);
          send({ type: "save", key: key, value: value });
        },
      },
    };
    if (message.hash) location.hash = message.hash;
    const shown = new MutationObserver(() => {
      if (!document.getElementById("content") && !document.querySelector(".load-error:not([hidden])")) return;
      shown.disconnect();
      scrollTo(0, message.scrollY);
      addEventListener("scroll", view, { passive: true });
      addEventListener("hashchange", view);
      send({ type: "rendered" });
      view();
    });
    shown.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    const page = new DOMParser().parseFromString(message.index, "text/html");
    document.documentElement.lang = page.documentElement.lang;
    const styles = [];
    for (const link of page.querySelectorAll("link[rel=stylesheet][href]")) {
      const url = urls[link.getAttribute("href")];
      if (!url) continue;
      const own = document.createElement("link");
      own.rel = "stylesheet";
      own.href = url;
      styles.push(new Promise((done) => { own.onload = own.onerror = done; }));
      document.head.append(own);
    }
    Promise.all(styles).then(() => {
      for (const script of page.querySelectorAll("script[src]")) {
        const url = urls[script.getAttribute("src")];
        if (!url) continue;
        const own = document.createElement("script");
        own.async = false;
        own.src = url;
        document.body.append(own);
      }
    });
  });
  send({ type: "ready" });
})();
`;

/** The script's hash as a content security policy source, pinned in the desktop app's policy. */
export const FRAME_SCRIPT_HASH = "'sha256-uPxSU/VO/1HWm6/T+D+HviZehnA75vmzgauNk/jh00E='";

/** The frame's document, as the address a sandboxed iframe opens. */
export const FRAME_URL = `data:text/html;charset=utf-8,${encodeURIComponent(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title></title></head><body><div id="app"></div><script>${FRAME_SCRIPT}</script></body></html>`,
)}`;
