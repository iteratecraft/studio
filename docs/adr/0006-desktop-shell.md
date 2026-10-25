# ADR-0006: Desktop shell is Tauri, and the engine runs without Node.js

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** project lead
- **Roadmap / spec ids:** D-31, M2-01, M2-02, M2-06, M2-13; supersedes the Electron line of
  ARCHITECTURE.md and the electron-builder row of ADR-0001

## Context

The project lead asked for a desktop app that is small to download and light on the computer.
Electron ships its own Chromium and Node.js: an installer of about 100 MB and 150 to 300 MB of memory
when idle. Desktop 0.1 is Windows only (D-29), and Windows 10 and 11 already carry WebView2, the
Chromium engine of Edge, which Tauri uses. A Tauri installer is about 5 to 15 MB.

## Decision

- The desktop app is a **Tauri 2** app in `apps/desktop`. The window shows the same React UI that the
  server edition serves in a browser.
- The Rust side stays small: window and menu setup, Tauri's official plugins (file system, dialog,
  updater, shell for sidecars) with capability files that allow only the commands and paths the app
  needs, and a strict content security policy. No product logic is written in Rust.
- **No Node.js at run time on desktop.** Every engine package used by the editor (format, labels,
  tracking, player, exporters, project container, command layer, job contract) must run in a browser
  or a Web Worker as well as in Node.js. Node-only modules (`node:fs`, `node:zlib`, `node:crypto`) are
  replaced by web-standard APIs (`CompressionStream`, `crypto.subtle`, `fetch`, files passed in by the
  host). The server edition keeps running the same code on Node.js.
- Editor code reaches the file system, dialogs and processes only through the host interface
  (M2-02), never through Tauri APIs directly. A lint rule enforces this.
- Long tasks run in Web Workers on desktop. ffmpeg is a sidecar program the app downloads, after
  asking, the first time an author adds video or audio; it is not in the installer.
- Installers come from the Tauri bundler (NSIS `.exe` for Windows), and updates from the Tauri
  updater with signed update metadata, published on GitHub Releases.

## Consequences

- Building the desktop app needs the Rust toolchain (`rustup`, the MSVC target) and the Visual Studio
  C++ build tools. CI's windows-latest image has both; contributors install `rustup` once.
- The exporters lose their `node:` imports, so export becomes a job that runs in a worker in the app.
- On macOS (WKWebView) and Linux (WebKitGTK) the editor renders with a different engine from Windows.
  The Slides editor's text-layout spike (ENG-25) and pixel-parity suite must cover those engines when
  those platforms start; learners already open courses in every browser, so the player is unaffected.
- Tauri's file-system scope and capability files become the security boundary; the review of M2-01
  checks them like the Electron IPC allow-list would have been checked.

## Alternatives considered

- **Electron:** one Chromium everywhere and Node.js built in, but about ten times the download and
  more memory; rejected on the lead's size and resource goal.
- **Neutralinojs:** smaller still, but a thinner plugin set and no signed updater; too young for a
  product people install.
- **A Node.js sidecar inside Tauri:** keeps Node-only engine code but adds 40 to 70 MB and a second
  process to supervise; rejected in favour of a runtime-neutral engine.
