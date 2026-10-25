// The desktop adapter of the host interface (M2-02) against a stand-in for Tauri: which shell
// command each call makes, with which path. The shell's own checks of those paths are Rust unit
// tests (src-tauri/src/files.rs) and the app smoke test (e2e/app.e2e.ts).
import { HostError } from "@course-suite/host";
import { beforeEach, expect, test, vi } from "vitest";
import { createDesktopHost } from "../src/desktop-host.js";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ sep: () => "\\" }));
vi.mock("@tauri-apps/api/app", () => ({ getName: vi.fn(), getVersion: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });

const DATA = String.raw`C:\Users\Ana\AppData\Local\org.iteratecraft.coursesuite\data`;
const project = { id: String.raw`D:\Courses\Safety.course`, name: "Safety.course" };

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
  await files.write(".Safety.course.autosave/save.tmp", data);
  await files.rename(".Safety.course.autosave/save.tmp", "Safety.course");
  await files.remove(".Safety.course.autosave");
  invoke.mockResolvedValueOnce(["3.course"]);
  expect(await files.list(".Safety.course.autosave")).toEqual(["3.course"]);
  const autosave = String.raw`D:\Courses\.Safety.course.autosave`;
  expect(invoke.mock.calls).toEqual([
    ["write_atomic", data, { headers: { path: encodeURIComponent(`${autosave}\\save.tmp`) } }],
    ["rename_file", { from: `${autosave}\\save.tmp`, to: project.id }, undefined],
    ["remove_path", { path: autosave }, undefined],
    ["list_folder", { path: autosave }, undefined],
  ]);
  await expect(files.write("Other.course", data)).rejects.toMatchObject({ code: "not-allowed" });
  expect(invoke).toHaveBeenCalledTimes(4);
});

test("a missing project file reads as undefined; the shell's refusals become HostErrors", async () => {
  const files = createDesktopHost().files.projectFiles(project);
  invoke.mockRejectedValueOnce(String.raw`not-found: D:\Courses\Safety.course: not there`);
  expect(await files.read("Safety.course")).toBeUndefined();

  invoke.mockRejectedValueOnce(String.raw`not-allowed: D:\Courses\Safety.course`);
  const refused = await files.read("Safety.course").catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(HostError);
  expect(refused).toMatchObject({
    code: "not-allowed",
    message: String.raw`D:\Courses\Safety.course`,
  });

  invoke.mockRejectedValueOnce("The disk is full");
  const failed = await files.read("Safety.course").catch((error: unknown) => error);
  expect(failed).not.toBeInstanceOf(HostError);
  expect(failed).toMatchObject({ message: "The disk is full" });
});

test("the desktop host has no job port: long tasks keep the one contract of @course-suite/jobs (ENG-15)", () => {
  expect(Object.keys(createDesktopHost()).sort()).toEqual(["appInfo", "files", "storage"]);
});
