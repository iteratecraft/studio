// Smoke test of the built desktop app (M2-01, M2-02): launches the release executable with
// WebView2's DevTools port open and drives its window with Playwright over CDP. It checks the page
// reached the shell through the host, that the content security policy holds inside the real
// WebView2, and the file scope of the shell's file commands. It also prints the app's idle memory.
// Build the app first (`pnpm build`, then `pnpm --filter @course-suite/desktop build:app`); without
// the executable the test skips, except on CI. CI also sets the DevTools port as a WebView2 policy
// (ci.yml), because WebView2 ignores the variable on the runner.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCourse } from "@course-suite/format/test/courses";
import { FRAME_URL, previewPackage } from "@course-suite/preview";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";

const exe = join(import.meta.dirname, "../src-tauri/target/release/course-suite-desktop.exe");
const identifier = JSON.parse(
  readFileSync(join(import.meta.dirname, "../src-tauri/tauri.conf.json"), "utf8"),
).identifier as string;
const CDP_PORT = 9333;

test.skip(
  process.platform !== "win32" || (!existsSync(exe) && !process.env.CI),
  "needs the Windows release build: pnpm --filter @course-suite/desktop build:app",
);
test.describe.configure({ mode: "serial" });

let app: ChildProcess;
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  // WebView2's first start on a fresh machine creates its profile, which can take a while.
  test.setTimeout(120_000);
  app = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      break;
    } catch (error) {
      if (Date.now() > deadline || app.exitCode !== null) {
        throw new Error(
          `The app opened no DevTools port (exit code ${app.exitCode}, WebView2 runtime ` +
            `${webView2Version()}). Its processes:\n` +
            processTree()
              .map((p) => `${p.name}: ${p.commandLine}`)
              .join("\n"),
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await expect.poll(() => browser.contexts()[0]?.pages()[0]).toBeTruthy();
  page = browser.contexts()[0]?.pages()[0] as Page;
});

test.afterAll(async () => {
  await browser?.close();
  app?.kill();
});

test("shows the app name and version it gets from the shell through the host", async () => {
  await expect(page.getByRole("heading", { level: 1, name: "Course Suite" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Version 0.0.0, desktop edition");
});

test("the content security policy blocks inline script, eval and other origins", async () => {
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      violations.push(e.effectiveDirective);
    });
    const script = document.createElement("script");
    script.textContent = "window.inlineRan = true";
    document.body.append(script);
    // A string handed to setTimeout is compiled like eval. (Playwright's evaluate itself runs
    // through DevTools, which the policy does not cover, so eval() here would prove nothing.)
    const evalRan = await new Promise<boolean>((resolve) => {
      Object.assign(window, { evalRan: resolve });
      setTimeout("window.evalRan(true)", 0);
      setTimeout(() => resolve(false), 100);
    });
    await fetch("http://127.0.0.1:9/").catch(() => {});
    const image = new Image();
    image.src = "http://127.0.0.1:9/x.png";
    document.body.append(image);
    // Violation events arrive after the blocked request has failed.
    await new Promise((resolve) => setTimeout(resolve, 300));
    image.remove();
    return {
      inlineRan: "inlineRan" in window,
      evalRan,
      violations: [...new Set(violations)].sort(),
    };
  });
  expect(result).toEqual({
    inlineRan: false,
    evalRan: false,
    violations: ["connect-src", "img-src", "script-src", "script-src-elem"],
  });
});

/** Calls one of the shell's commands from page script, as any script in the window could. */
const shell = (command: string, args: Record<string, string>) =>
  page.evaluate(
    async ({ command, args }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the IPC bridge Tauri injects into the window
      const { invoke } = (window as any).__TAURI_INTERNALS__;
      try {
        const result =
          command === "write_atomic"
            ? await invoke(command, new Uint8Array([1, 2, 3]), {
                headers: { path: encodeURIComponent(args.path ?? "") },
              })
            : await invoke(command, args);
        return {
          ok: true,
          value: result instanceof ArrayBuffer ? [...new Uint8Array(result)] : (result ?? null),
        };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
    { command, args },
  );

const localData = join(process.env.LOCALAPPDATA ?? "", identifier);
const dataDir = join(localData, "data");

test("reads, writes, lists, renames and removes files in the data folder", async () => {
  const folder = join(dataDir, "smoke-test");
  const file = join(folder, "data é.bin");
  const moved = join(folder, "moved.bin");
  try {
    expect(await shell("data_folder", {})).toEqual({ ok: true, value: dataDir });
    expect(await shell("write_atomic", { path: file })).toEqual({ ok: true, value: null });
    expect([...readFileSync(file)]).toEqual([1, 2, 3]);
    expect(await shell("read_file", { path: file })).toEqual({ ok: true, value: [1, 2, 3] });
    expect(await shell("list_folder", { path: folder })).toEqual({
      ok: true,
      value: ["data é.bin"],
    });
    expect(await shell("rename_file", { from: file, to: moved })).toMatchObject({ ok: true });
    expect(existsSync(moved)).toBe(true);
    expect(await shell("remove_path", { path: folder })).toMatchObject({ ok: true });
    expect(existsSync(folder)).toBe(false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("page script can neither read nor change WebView2's profile or anything outside the data folder", async () => {
  const profile = join(localData, "EBWebView");
  const localState = join(profile, "Local State");
  // WebView2 has made its profile by now, so the refusals below are about real files.
  expect(existsSync(localState)).toBe(true);
  const unpicked = join(tmpdir(), "Unpicked.crs");
  // Built by hand where join() would resolve the "..".
  const refused: [string, Record<string, string>][] = [
    ["read_file", { path: localState }],
    ["read_file", { path: join(profile, "Default", "Preferences") }],
    ["read_file", { path: `${dataDir}\\..\\EBWebView\\Local State` }],
    ["read_file", { path: join(process.env.WINDIR ?? "C:\\Windows", "win.ini") }],
    ["write_atomic", { path: localState }],
    ["write_atomic", { path: join(profile, "smoke-test.bin") }],
    ["write_atomic", { path: join(localData, "smoke-test.bin") }],
    ["write_atomic", { path: `${dataDir}\\..\\smoke-test.bin` }],
    ["write_atomic", { path: `${localData}\\data.\\smoke-test.bin` }],
    ["write_atomic", { path: join(tmpdir(), `course-suite-outside-${process.pid}.bin`) }],
    ["write_atomic", { path: join(tmpdir(), ".Unpicked.crs.autosave", "1.crs") }],
    ["list_folder", { path: profile }],
    ["list_folder", { path: localData }],
    ["remove_path", { path: localState }],
    ["remove_path", { path: dataDir }],
    ["rename_file", { from: localState, to: join(dataDir, "smoke-test.bin") }],
    ["rename_file", { from: join(dataDir, "smoke-test.bin"), to: localState }],
    ["rename_file", { from: unpicked, to: join(tmpdir(), "Moved.crs") }],
  ];
  for (const [command, args] of refused) {
    const result = await shell(command, args);
    expect(result, `${command} ${JSON.stringify(args)}`).toMatchObject({ ok: false });
    expect(result.error).toMatch(/^not-allowed: /);
  }
  // WebView2 rewrites its own Local State whenever it likes (on CI it once added a captions
  // setting mid-test), so the check is that the file is still WebView2's JSON, not the bytes the
  // refused write would have put there.
  const after = readFileSync(localState);
  expect([...after]).not.toEqual([1, 2, 3]);
  expect(() => JSON.parse(after.toString("utf8"))).not.toThrow();
  for (const path of [
    join(profile, "smoke-test.bin"),
    join(localData, "smoke-test.bin"),
    join(tmpdir(), ".Unpicked.crs.autosave"),
  ]) {
    expect(existsSync(path), path).toBe(false);
  }
});

test("reports idle memory of the app and its WebView2 processes", async () => {
  await page.waitForTimeout(5_000);
  const tree = processTree();
  const sum = (key: "workingSet" | "privateBytes") => tree.reduce((n, p) => n + p[key], 0);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  const report = `${tree.length} processes, working set ${mb(sum("workingSet"))} MiB, private ${mb(sum("privateBytes"))} MiB`;
  console.log(`Idle memory after 5 s: ${report}`);
  test.info().annotations.push({ type: "idle memory", description: report });
  expect(tree.length).toBeGreaterThan(1);
});

test("the course preview runs the real player in WebView2 under the shell's policy (M2-11)", async () => {
  const course = sampleCourse();
  const svg = (text: string) =>
    new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`);
  const media: Record<string, Uint8Array> = { "cover.svg": svg("c"), "compost-bin.svg": svg("b") };
  const { index, files } = await previewPackage(course, (key) => media[key]);
  // What createPreview does, by hand: the page bundle has no preview yet (the editor brings it).
  const violations = await page.evaluate(
    async ({ url, index, files }) => {
      const found: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => found.push(e.effectiveDirective));
      const frame = document.createElement("iframe");
      frame.title = "Course preview";
      frame.sandbox.add("allow-scripts");
      frame.src = url;
      await new Promise<void>((resolve) => {
        addEventListener("message", (event) => {
          if (event.source !== frame.contentWindow) return;
          if (event.data.type === "rendered") resolve();
          if (event.data.type !== "ready") return;
          const bytes = files.map(([path, base64, type]) => [
            path,
            Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
            type,
          ]);
          const load = { type: "load", index, files: bytes, hash: "", scrollY: 0, state: [] };
          frame.contentWindow?.postMessage(load, "*");
        });
        document.body.append(frame);
      });
      return found;
    },
    {
      url: FRAME_URL,
      index,
      files: files.map(([path, data, type]): [string, string, string] => [
        path,
        Buffer.from(data).toString("base64"),
        type,
      ]),
    },
  );
  expect(violations).toEqual([]);
  const frame = page.frameLocator("iframe[title='Course preview']");
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText(course.title);
  // The media come from the frame's own in-memory addresses.
  const image = frame.locator("img").first();
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  const tree = processTree();
  const sum = (key: "workingSet" | "privateBytes") => tree.reduce((n, p) => n + p[key], 0);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  const report = `${tree.length} processes, working set ${mb(sum("workingSet"))} MiB, private ${mb(sum("privateBytes"))} MiB`;
  console.log(`Memory with a course in the preview: ${report}`);
  test.info().annotations.push({ type: "memory with preview", description: report });
});

/** The app process and every process below it (the WebView2 browser, renderer, GPU...). */
function processTree(): {
  name: string;
  commandLine: string;
  workingSet: number;
  privateBytes: number;
}[] {
  const script = `
    $all = Get-CimInstance Win32_Process
    $ids = @(${app.pid}); $i = 0
    while ($i -lt $ids.Count) { $ids += @($all | ? ParentProcessId -eq $ids[$i] | % ProcessId); $i++ }
    ConvertTo-Json -Compress @($all | ? { $ids -contains $_.ProcessId } |
      % { @{ name = $_.Name; commandLine = $_.CommandLine; workingSet = $_.WorkingSetSize; privateBytes = $_.PrivatePageCount } })`;
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
    },
  );
  return JSON.parse(output);
}

/** The installed WebView2 runtime's version, for the message when the app does not start. */
function webView2Version(): string {
  const key = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;
  try {
    return (
      execFileSync("reg", ["query", key, "/v", "pv"], { encoding: "utf8" })
        .trim()
        .split(/\s+/)
        .at(-1) ?? ""
    );
  } catch {
    return "not found";
  }
}
