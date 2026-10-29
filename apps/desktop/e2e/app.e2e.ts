// Smoke test of the built desktop app (M2-01, M2-02): launches the release executable with
// WebView2's DevTools port open and drives its window with Playwright over CDP. It checks the page
// reached the shell through the host, that the content security policy holds inside the real
// WebView2, and the file scope of the shell's file commands and media commands (M2-13). It also
// prints the app's idle memory. With MEDIA_CONVERTER_E2E=1 it downloads the media converter and
// converts a 500 MB video (BLK-05).
// Build the app first (`pnpm build`, then `pnpm --filter @course-suite/desktop build:app`); without
// the executable the test skips, except on CI. CI also sets the DevTools port as a WebView2 policy
// (ci.yml), because WebView2 ignores the variable on the runner.
import { type ChildProcess, execFile, execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import { sampleCourse } from "@course-suite/format/test/courses";
import { FRAME_URL, previewPackage } from "@course-suite/preview";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";

const exe = join(import.meta.dirname, "../src-tauri/target/release/course-suite-desktop.exe");
const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "../src-tauri/tauri.conf.json"), "utf8"),
);
const identifier = config.identifier as string;
// The workspace version (tauri.conf.json reads it), so a release bump needs no test change.
const version = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"))
  .version as string;
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
  // The DevTools port can open before WebView2 has made the app's page: wait for the page within
  // the same start-up budget, not an assertion's 5 s default (which a cold runner overran).
  const context = browser.contexts()[0];
  if (!context) throw new Error("The app's WebView2 shows no browser context over CDP.");
  page =
    context.pages()[0] ??
    (await context.waitForEvent("page", { timeout: Math.max(1, deadline - Date.now()) }));
});

test.afterAll(async () => {
  await browser?.close();
  app?.kill();
});

test("shows the dashboard with the app name and version it gets from the shell through the host", async () => {
  await expect(page.getByRole("heading", { level: 1, name: "Your courses" })).toBeVisible();
  // The app's name, and its settings (M2-20).
  await expect(page.getByRole("banner")).toHaveText("Course SuiteSettings");
  await expect(page.getByRole("contentinfo")).toHaveText(`Version ${version}`);
});

test("M2-20: the build carries the update key, so its settings offer update checks", async () => {
  // tauri.conf.json carries the lead's plugins.updater.pubkey (docs/release.md); release.test.ts
  // pins its shape, and e2e/update.e2e.ts proves an update end to end with a throwaway key.
  expect(config.plugins.updater.pubkey).not.toBe("");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settings.getByRole("switch", { name: "Check for updates automatically" }),
  ).toBeEnabled();
  await expect(settings).not.toContainText("This build cannot update itself.");
  await expect(settings.getByRole("button", { name: "Check now" })).toBeEnabled();
  await settings.getByRole("button", { name: "Done" }).click();
  await expect(settings).toHaveCount(0);
});

test("the editor runs under the release content security policy without a violation", async () => {
  // The policy blocks every <style> element. React Aria adds one unless the page's marker says its
  // rule is already in the stylesheet (packages/ui/README.md), so none must be there.
  expect(
    await page.evaluate(() => ({
      styles: document.querySelectorAll("style").length,
      marker: document.getElementById("react-aria-pressable-style")?.tagName,
    })),
  ).toEqual({ styles: 0, marker: "TEMPLATE" });
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { violations: seen });
    document.addEventListener("securitypolicyviolation", (e) => seen.push(e.effectiveDirective));
  });
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Blank course" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  expect(
    await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
  ).toEqual([]);
});

test("the window title follows the page's title (M2-08)", async () => {
  test.setTimeout(150_000);
  await page.evaluate(() => {
    document.title = "Title sync check";
  });
  await expect.poll(() => windowTitle(), { timeout: 60_000 }).toBe("Title sync check");
  await page.evaluate(() => {
    document.title = "Course Suite";
  });
  await expect.poll(() => windowTitle(), { timeout: 60_000 }).toBe("Course Suite");
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
  const { index, files } = await previewPackage(course, (key) => media[key], nodeFonts);
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

/** Calls one of the shell's media commands from page script, with a progress channel. */
const media = (command: string, args: Record<string, string>) =>
  page.evaluate(
    async ({ command, args }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the IPC bridge Tauri injects into the window
      const internals = (window as any).__TAURI_INTERNALS__;
      const progress: unknown[] = [];
      const channel = internals.transformCallback((message: unknown) => progress.push(message));
      try {
        const result = await internals.invoke(command, {
          ...args,
          onProgress: `__CHANNEL__:${channel}`,
        });
        return {
          ok: true,
          value: result instanceof ArrayBuffer ? new Uint8Array(result).length : (result ?? null),
          progress: progress.length,
        };
      } catch (error) {
        return { ok: false, error: String(error), progress: progress.length };
      }
    },
    { command, args },
  );

test("D-43: the media converter's commands say what it is, and refuse files the page may not read, unknown kinds and a converter that is not there", async () => {
  const info = (await shell("media_converter", {})) as { ok: boolean; value: unknown };
  const pin = JSON.parse(
    readFileSync(join(import.meta.dirname, "../src-tauri/media-tool.json"), "utf8"),
  );
  expect(info).toMatchObject({
    ok: true,
    value: { name: pin.name, licence: pin.licence, size: pin.size },
  });
  const refused = await media("media_convert", {
    job: "smoke-1",
    input: join(process.env.WINDIR ?? "C:\\Windows", "win.ini"),
    kind: "video",
  });
  expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/^not-allowed: /) });
  const input = join(dataDir, "media-work", "smoke.wav");
  const kind = await media("media_convert", { job: "smoke-2", input, kind: "image" });
  expect(kind).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid: /) });
  if (!(info.value as { installed: boolean }).installed) {
    const missing = await media("media_convert", { job: "smoke-3", input, kind: "audio" });
    expect(missing).toMatchObject({ ok: false, error: expect.stringMatching(/^not-found: /) });
  }
  // Cancelling a job that does not run does nothing.
  expect(await shell("media_cancel", { job: "none" })).toMatchObject({ ok: true });
});

test("D-43: a job id that is not a plain id is refused before any file is named after it, and a cancel that overtakes its task stops it", async () => {
  const input = join(dataDir, "media-work", "smoke.wav");
  for (const job of ["..\\x", "C:\\x", "../x", "", "a".repeat(65)]) {
    const install = await media("media_install", { job });
    expect(install, job).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid: /) });
    const convert = await media("media_convert", { job, input, kind: "audio" });
    expect(convert, job).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid: /) });
    const cancel = await shell("media_cancel", { job });
    expect(cancel, job).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid: /) });
  }
  const info = (await shell("media_converter", {})) as { value: { installed: boolean } };
  expect(await shell("media_cancel", { job: "early-1" })).toMatchObject({ ok: true });
  const early = await media("media_install", { job: "early-1" });
  // Not installed (as on CI): stopped as it starts, where a lost cancel would download the
  // converter. Installed: there is nothing to stop.
  expect(early).toMatchObject(
    info.value.installed ? { ok: true } : { ok: false, error: "cancelled" },
  );
  expect(existsSync(join(localData, "media-work", "early-1.zip"))).toBe(false);
});

/** A raw YUV4MPEG2 video of `frames` grey 640 x 360 frames that slowly brighten. */
function rawVideo(frames: number): Buffer[] {
  const width = 640;
  const height = 360;
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F25:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < frames; i++) {
    parts.push(Buffer.from("FRAME\n"), Buffer.alloc(width * height, 16 + (i % 200)), chroma);
  }
  return parts;
}

/** The process ids of running converters (`ffmpeg.exe`). */
async function converterProcesses(): Promise<string[]> {
  const { stdout } = await promisify(execFile)("tasklist.exe", [
    "/FI",
    "IMAGENAME eq ffmpeg.exe",
    "/FO",
    "CSV",
    "/NH",
  ]);
  return stdout
    .split("\n")
    .filter((line) => line.startsWith('"ffmpeg.exe"'))
    .map((line) => line.split('","')[1] ?? "");
}

// BLK-05 done-when: a 500 MB video converted offline on desktop with visible progress and cancel.
// It downloads the pinned converter (77 MB) once, so it runs only when asked for:
// MEDIA_CONVERTER_E2E=1 pnpm --filter @course-suite/desktop test:e2e
test("BLK-05, D-12, D-43: the converter downloads once, checked by SHA-256, converts a 500 MB video with progress, and stops at once when cancelled", async () => {
  test.skip(!process.env.MEDIA_CONVERTER_E2E, "set MEDIA_CONVERTER_E2E=1 to download and run it");
  test.setTimeout(30 * 60_000);
  const installed = await media("media_install", { job: "install-1" });
  expect(installed).toMatchObject({ ok: true });
  const pin = JSON.parse(
    readFileSync(join(import.meta.dirname, "../src-tauri/media-tool.json"), "utf8"),
  );
  expect(readFileSync(join(localData, "tools", pin.folder, ".verified"), "utf8")).toBe(pin.sha256);

  // 1,450 frames of 640 x 360: just over 500 MB, put where a dropped file would go.
  const folder = join(dataDir, "media-work");
  mkdirSync(folder, { recursive: true });
  const input = join(folder, "large.y4m");
  writeFileSync(input, Buffer.concat(rawVideo(1450)));
  expect(statSync(input).size).toBeGreaterThan(500 * 1000 * 1000);

  // Cancel: started, then stopped after its first progress report.
  const cancelled = page.evaluate(
    async ({ input }) => {
      // biome-ignore lint/suspicious/noExplicitAny: the IPC bridge Tauri injects into the window
      const internals = (window as any).__TAURI_INTERNALS__;
      let first: () => void = () => {};
      const progressed = new Promise<void>((resolve) => {
        first = resolve;
      });
      const channel = internals.transformCallback(() => first());
      const run = internals.invoke("media_convert", {
        job: "convert-1",
        input,
        kind: "video",
        onProgress: `__CHANNEL__:${channel}`,
      });
      await progressed;
      const asked = Date.now();
      await internals.invoke("media_cancel", { job: "convert-1" });
      const error = await run.then(
        () => "finished",
        (reason: unknown) => String(reason),
      );
      return { error, ms: Date.now() - asked };
    },
    { input },
  );
  // A data file under media-work is removed once read, cancelled or not; write it again.
  const stopped = await cancelled;
  expect(stopped.error).toBe("cancelled");
  expect(stopped.ms).toBeLessThan(2_000);
  expect(await converterProcesses()).toEqual([]);
  writeFileSync(input, Buffer.concat(rawVideo(1450)));

  const converted = await media("media_convert", { job: "convert-2", input, kind: "video" });
  expect(converted).toMatchObject({ ok: true });
  expect(converted.progress).toBeGreaterThan(0);
  expect(converted.value).toBeGreaterThan(0);
  expect(existsSync(input)).toBe(false);
  expect(readdirSync(join(localData, "media-work"))).toEqual([]);
});

test("closing the window asks the page, which lets it close with no course open", async () => {
  // PowerShell can take tens of seconds to start on a CI runner.
  test.setTimeout(150_000);
  // The window, its page and then WebView2 go. The test ends only once the connection to WebView2
  // has ended too: Playwright's end-of-test trace handling fails on a connection that is closing.
  const closed = new Promise<void>((resolve) => browser.once("disconnected", () => resolve()));
  // WM_CLOSE, as the window's close button sends.
  await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `[Diagnostics.Process]::GetProcessById(${app.pid}).CloseMainWindow() | Out-Null`,
    ],
    { timeout: 60_000 },
  );
  // The page allowed it: the window and its page go, then the app ends.
  await closed;
  await expect.poll(() => app.exitCode, { timeout: 60_000 }).not.toBeNull();
});

/**
 * The title of the app's main window, as Windows shows it. Asked without blocking the test's own
 * event loop, and given up after 20 s, so a slow PowerShell start cannot stall Playwright.
 */
/**
 * The app window's title, or undefined when PowerShell did not answer in time: it can take tens of
 * seconds to start on a CI runner, so the caller's poll asks again rather than failing.
 */
async function windowTitle(): Promise<string | undefined> {
  try {
    const { stdout } = await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[Diagnostics.Process]::GetProcessById(${app.pid}).MainWindowTitle`,
      ],
      { encoding: "utf8", timeout: 45_000 },
    );
    return stdout.trim();
  } catch (error) {
    if ((error as { killed?: boolean }).killed) return undefined;
    throw error;
  }
}

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
