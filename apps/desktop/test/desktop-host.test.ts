// The desktop adapter of the host interface (M2-02) against a stand-in for Tauri: which shell
// command each call makes, with which path. The shell's own checks of those paths are Rust unit
// tests (src-tauri/src/files.rs) and the app smoke test (e2e/app.e2e.ts).
import { HostError, UpdateError } from "@course-suite/host";
import { beforeEach, expect, test, vi } from "vitest";
import { createDesktopHost } from "../src/desktop-host.js";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  Channel: class {
    onmessage: (message: unknown) => void = () => {};
  },
}));
vi.mock("@tauri-apps/api/path", () => ({ sep: () => "\\" }));
const { listen } = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("@tauri-apps/api/app", () => ({ getName: vi.fn(), getVersion: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
const { onCloseRequested } = vi.hoisted(() => ({ onCloseRequested: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onCloseRequested }) }));
vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });

const DATA = String.raw`C:\Users\Ana\AppData\Local\org.iteratecraft.coursesuite\data`;
const project = { id: String.raw`D:\Courses\Safety.crs`, name: "Safety.crs" };

beforeEach(() => {
  invoke.mockReset();
});

test("data files resolve in the data folder the shell names, apart from WebView2's profile", async () => {
  invoke.mockResolvedValue(DATA);
  const { files } = createDesktopHost();
  expect(await files.dataFile("autosave/a.json")).toEqual({
    id: String.raw`${DATA}\autosave\a.json`,
    name: "a.json",
  });
  await files.dataFile("b.json");
  // The shell owns where the data folder is, and is asked once.
  expect(invoke.mock.calls).toEqual([["data_folder", undefined, undefined]]);
});

test("project files reach the picked file and its autosave folder through the shell's commands", async () => {
  const files = createDesktopHost().files.projectFiles(project);
  const data = new Uint8Array([1]);
  invoke.mockResolvedValue(undefined);
  await files.write(".Safety.crs.autosave/save.tmp", data);
  await files.rename(".Safety.crs.autosave/save.tmp", "Safety.crs");
  await files.remove(".Safety.crs.autosave");
  invoke.mockResolvedValueOnce(["3.crs"]);
  expect(await files.list(".Safety.crs.autosave")).toEqual(["3.crs"]);
  const autosave = String.raw`D:\Courses\.Safety.crs.autosave`;
  expect(invoke.mock.calls).toEqual([
    ["write_atomic", data, { headers: { path: encodeURIComponent(`${autosave}\\save.tmp`) } }],
    ["rename_file", { from: `${autosave}\\save.tmp`, to: project.id }, undefined],
    ["remove_path", { path: autosave }, undefined],
    ["list_folder", { path: autosave }, undefined],
  ]);
  await expect(files.write("Other.crs", data)).rejects.toMatchObject({ code: "not-allowed" });
  expect(invoke).toHaveBeenCalledTimes(4);
});

test("a missing project file reads as undefined; the shell's refusals become HostErrors", async () => {
  const files = createDesktopHost().files.projectFiles(project);
  invoke.mockRejectedValueOnce(String.raw`not-found: D:\Courses\Safety.crs: not there`);
  expect(await files.read("Safety.crs")).toBeUndefined();

  invoke.mockRejectedValueOnce(String.raw`not-allowed: D:\Courses\Safety.crs`);
  const refused = await files.read("Safety.crs").catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(HostError);
  expect(refused).toMatchObject({
    code: "not-allowed",
    message: String.raw`D:\Courses\Safety.crs`,
  });

  invoke.mockRejectedValueOnce("The disk is full");
  const failed = await files.read("Safety.crs").catch((error: unknown) => error);
  expect(failed).not.toBeInstanceOf(HostError);
  expect(failed).toMatchObject({ message: "The disk is full" });
});

test("the desktop host has no job port: long tasks keep the one contract of @course-suite/jobs (ENG-15)", () => {
  expect(Object.keys(createDesktopHost()).sort()).toEqual([
    "appInfo",
    "files",
    "media",
    "onCloseRequested",
    "storage",
    "updates",
  ]);
});

test("M2-20: the updater's refusals become UpdateErrors with their reason; anything else is a failure", async () => {
  const updates = createDesktopHost().updates;
  if (!updates) throw new Error("the desktop host has updates");
  invoke.mockResolvedValueOnce({ version: "0.2.0", notes: "" });
  expect(await updates.check()).toEqual({ version: "0.2.0", notes: "" });
  for (const reason of ["unavailable", "network", "invalid", "signature", "failed"]) {
    invoke.mockRejectedValueOnce(`${reason}: details`);
    const error = await updates.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpdateError);
    expect(error).toMatchObject({ reason, message: "details" });
  }
  invoke.mockRejectedValueOnce("The installer could not start");
  await expect(updates.install()).rejects.toMatchObject({
    reason: "failed",
    message: "The installer could not start",
  });
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    ...Array(6).fill("update_check"),
    "update_install",
  ]);
});

test("M2-20: aborting a download asks the shell to stop it and rejects with the signal's reason, even when it had just finished", async () => {
  const updates = createDesktopHost().updates;
  if (!updates) throw new Error("the desktop host has updates");
  const stop = new AbortController();
  let finish: (value?: unknown) => void = () => {};
  invoke.mockImplementation((command: string) =>
    command === "update_download" ? new Promise((resolve) => (finish = resolve)) : undefined,
  );
  const download = updates.download({ signal: stop.signal });
  stop.abort(new Error("stopped"));
  finish();
  await expect(download).rejects.toThrow("stopped");
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    "update_download",
    "update_cancel",
  ]);
});

test("M2-20: Help > Check for updates reaches the listener, which can stop listening", async () => {
  const unlisten = vi.fn();
  let fire: () => void = () => {};
  listen.mockImplementation(async (_event: string, handler: () => void) => {
    fire = handler;
    return unlisten;
  });
  const heard = vi.fn();
  const stop = createDesktopHost().updates?.onCheckRequested(heard);
  expect(listen).toHaveBeenCalledWith("check-for-updates", expect.any(Function));
  fire();
  expect(heard).toHaveBeenCalledOnce();
  stop?.();
  await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
});

test("a file's change time comes from the shell, and a missing file has none", async () => {
  const { files } = createDesktopHost();
  invoke.mockResolvedValueOnce(1_761_400_000_000).mockResolvedValueOnce(null);
  expect(await files.modified(project)).toBe(1_761_400_000_000);
  expect(await files.modified(project)).toBeUndefined();
  expect(invoke.mock.calls).toEqual([
    ["file_modified", { path: project.id }, undefined],
    ["file_modified", { path: project.id }, undefined],
  ]);
});

test("closing the window waits for the editor's answer and stays open when it says no", async () => {
  const unlisten = vi.fn();
  onCloseRequested.mockResolvedValue(unlisten);
  let answer = false;
  const stop = createDesktopHost().onCloseRequested(async () => answer);
  const handler = onCloseRequested.mock.calls[0]?.[0];
  const event = { preventDefault: vi.fn() };
  await handler(event);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  answer = true;
  await handler(event);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  stop();
  await vi.waitFor(() => expect(unlisten).toHaveBeenCalled());
});

test("D-43: the media converter runs through the shell's media commands, with progress and cancel", async () => {
  const { media } = createDesktopHost();
  if (!media) throw new Error("the desktop host converts media");
  const progress: number[][] = [];
  invoke.mockImplementationOnce(async (_command, args) => {
    args.onProgress.onmessage([500, 2000]);
    return new Uint8Array([1, 2, 3]).buffer;
  });
  const clip = { id: String.raw`D:\Media\clip.mov`, name: "clip.mov" };
  const converted = await media.convert(clip, "video", {
    onProgress: (done, total) => progress.push([done, total]),
  });
  expect(converted).toEqual({
    data: new Uint8Array([1, 2, 3]),
    type: "video/webm",
    extension: "webm",
  });
  expect(progress).toEqual([[500, 2000]]);
  const [command, args] = invoke.mock.calls[0] as [string, Record<string, unknown>];
  expect(command).toBe("media_convert");
  expect(args).toMatchObject({ input: clip.id, kind: "video", job: expect.any(String) });

  // Cancel: the shell is told to stop that job, and the call rejects with the abort reason.
  const controller = new AbortController();
  let finish: (error: unknown) => void = () => {};
  invoke.mockReset();
  invoke.mockImplementation((name: string) =>
    name === "media_install"
      ? new Promise((_, reject) => {
          finish = reject;
        })
      : Promise.resolve(),
  );
  const install = media.installConverter({ signal: controller.signal });
  controller.abort(new DOMException("Stopped", "AbortError"));
  finish("cancelled");
  await expect(install).rejects.toMatchObject({ name: "AbortError" });
  const job = (invoke.mock.calls[0] as [string, { job: string }])[1].job;
  expect(invoke.mock.calls[1]).toEqual(["media_cancel", { job }]);
});
