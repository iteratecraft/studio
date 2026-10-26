// The shell's security boundary (M2-01, ADR-0006) is configuration, so these tests pin it: a change
// to the policy or the granted commands must change this file too, in a reviewed pull request.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAME_SCRIPT_HASH } from "@course-suite/preview";
import { describe, expect, test } from "vitest";

const shell = join(import.meta.dirname, "..", "src-tauri");
const read = (path: string) => JSON.parse(readFileSync(join(shell, path), "utf8"));
const config = read("tauri.conf.json");

describe.each([
  ["csp", config.app.security.csp],
  ["devCsp", config.app.security.devCsp],
])("content security policy (%s)", (_name, csp: Record<string, string>) => {
  const sources = Object.values(csp).join(" ").split(" ");

  test("denies everything not listed and allows script only from the app itself and the preview", () => {
    expect(csp["default-src"]).toBe("'none'");
    // The preview frame (ENG-13): its one inline script by hash, and the package files it holds
    // in memory as blob: addresses, which only script already running can make.
    expect(csp["script-src"]).toBe(`'self' blob: ${FRAME_SCRIPT_HASH}`);
    expect(csp["object-src"]).toBe("'none'");
    expect(csp["base-uri"]).toBe("'none'");
  });

  test("allows blob: only for the preview's in-memory files and data: only for its frame", () => {
    const using = (scheme: string) =>
      Object.keys(csp).filter((directive) => csp[directive]?.split(" ").includes(scheme));
    expect(using("blob:")).toEqual(["script-src", "style-src", "img-src"]);
    expect(using("data:")).toEqual(["frame-src"]);
    expect(csp["frame-src"]).toBe("data:");
  });

  test("allows no eval and no remote origin", () => {
    expect(sources).not.toContain("'unsafe-eval'");
    expect(sources).not.toContain("'wasm-unsafe-eval'");
    expect(sources).not.toContain("*");
    const origins = sources.filter((s) => /^[a-z][a-z0-9+.-]*:/i.test(s));
    // Tauri's IPC, the preview's in-memory files and frame, and Vite's live-reload socket in
    // development only.
    const allowed = [
      "ipc:",
      "http://ipc.localhost",
      "blob:",
      "data:",
      ...(csp === config.app.security.devCsp ? ["ws://localhost:1420"] : []),
    ];
    expect(origins.filter((origin) => !allowed.includes(origin))).toEqual([]);
  });
});

test("the release policy allows no inline script or style", () => {
  expect(Object.values(config.app.security.csp).join(" ")).not.toContain("'unsafe-inline'");
});

test("the app turns on only the main capability, for the main window", () => {
  expect(config.app.security.capabilities).toEqual(["main"]);
  expect(readdirSync(join(shell, "capabilities"))).toEqual(["main.json"]);
  expect(config.app.windows.map((w: { label: string }) => w.label)).toEqual(["main"]);
  // main.rs builds the window from this config, to keep its title in step with the page's.
  expect(config.app.windows[0].create).toBe(false);
  expect(read("capabilities/main.json").windows).toEqual(["main"]);
});

test("the main capability grants only the commands the desktop host uses", () => {
  expect(read("capabilities/main.json").permissions).toEqual([
    "core:app:allow-name",
    "core:app:allow-version",
    // The close request (onCloseRequested): listen for it, and close the window when the editor
    // allows it, so unsaved work is offered for saving first (M2-08).
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-destroy",
    "dialog:allow-open",
    "dialog:allow-save",
    // The shell's own file commands (src-tauri/src/files.rs), which check every path themselves.
    "allow-data-folder",
    "allow-read-file",
    "allow-file-modified",
    "allow-write-atomic",
    "allow-rename-file",
    "allow-remove-path",
    "allow-list-folder",
  ]);
});

test("no file system plugin command or scope is granted, so WebView2's profile next to the data folder stays out of reach", () => {
  const granted = JSON.stringify(read("capabilities/main.json").permissions);
  // No plugin command, no path variable such as $APPLOCALDATA, no glob.
  expect(granted).not.toMatch(/fs:|\$[A-Z]|\*/);
});
