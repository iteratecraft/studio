// Smoke test of the built desktop app (M2-01, M2-02): launches the release executable with
// WebView2's DevTools port open and drives its window with Playwright over CDP. It checks the page
// reached the shell through the host, that the content security policy holds inside the real
// WebView2, and the file scope of our one command. It also prints the app's idle memory.
// Build the app first (`pnpm build`, then `pnpm --filter @course-suite/desktop build:app`); without
// the executable the test skips, except on CI.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
          `The app opened no DevTools port (exit code ${app.exitCode}, WebView2 processes: ` +
            `${processTree().filter((p) => /msedgewebview2/i.test(p.name)).length}, ` +
            `WebView2 runtime ${webView2Version()})`,
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

test("writes and reads only app data files and files the user picked", async () => {
  const dataDir = join(process.env.LOCALAPPDATA ?? "", identifier);
  const target = join(dataDir, "smoke-test", "data é.bin");
  const outside = join(tmpdir(), `course-suite-outside-${process.pid}.bin`);
  const call = (path: string, write: boolean) =>
    page.evaluate(
      async ({ path, write }) => {
        // biome-ignore lint/suspicious/noExplicitAny: the IPC bridge Tauri injects into the window
        const { invoke } = (window as any).__TAURI_INTERNALS__;
        try {
          const result = write
            ? await invoke("write_atomic", new Uint8Array([1, 2, 3]), {
                headers: { path: encodeURIComponent(path) },
              })
            : await invoke("plugin:fs|read_file", { path });
          return { ok: true, bytes: result ? [...new Uint8Array(result)] : [] };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      { path, write },
    );
  try {
    expect(await call(target, true)).toEqual({ ok: true, bytes: [] });
    expect([...readFileSync(target)]).toEqual([1, 2, 3]);
    expect(await call(target, false)).toEqual({ ok: true, bytes: [1, 2, 3] });

    // Built by hand: join() would resolve the "..".
    const parentPath = `${dataDir}\\..\\escape.bin`;
    for (const path of [outside, parentPath]) {
      expect(await call(path, true)).toMatchObject({ ok: false });
      expect(existsSync(path)).toBe(false);
    }
    expect(await call(join(process.env.WINDIR ?? "C:\\Windows", "win.ini"), false)).toMatchObject({
      ok: false,
    });
  } finally {
    rmSync(join(dataDir, "smoke-test"), { recursive: true, force: true });
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

/** The app process and every process below it (the WebView2 browser, renderer, GPU...). */
function processTree(): { name: string; workingSet: number; privateBytes: number }[] {
  const script = `
    $all = Get-CimInstance Win32_Process
    $ids = @(${app.pid}); $i = 0
    while ($i -lt $ids.Count) { $ids += @($all | ? ParentProcessId -eq $ids[$i] | % ProcessId); $i++ }
    ConvertTo-Json -Compress @($all | ? { $ids -contains $_.ProcessId } |
      % { @{ name = $_.Name; workingSet = $_.WorkingSetSize; privateBytes = $_.PrivatePageCount } })`;
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
