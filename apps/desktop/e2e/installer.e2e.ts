// The Windows installer end to end (M2-19; D-2, D-29): installs the built NSIS installer silently
// for the current user, checks its Start menu and uninstall entries, starts the installed app and
// measures its cold start and idle memory, then uninstalls it and checks the author's files are
// still there. It installs into your user profile (%LOCALAPPDATA%\Course Suite), so it runs only
// when asked for, after `pnpm --filter @course-suite/desktop build:installer`:
// INSTALLER_E2E=1 pnpm --filter @course-suite/desktop exec playwright test --project installer
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";

const desktop = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(desktop, "package.json"), "utf8"));
const config = JSON.parse(readFileSync(join(desktop, "src-tauri/tauri.conf.json"), "utf8"));
const name: string = config.productName;
const installer = join(
  desktop,
  `src-tauri/target/release/bundle/nsis/${name}_${version}_x64-setup.exe`,
);
const installDir = join(process.env.LOCALAPPDATA ?? "", name);
const exe = join(installDir, "course-suite-desktop.exe");
const dataFolder = join(process.env.LOCALAPPDATA ?? "", config.identifier);
const startMenu = join(
  process.env.APPDATA ?? "",
  "Microsoft/Windows/Start Menu/Programs",
  `${name}.lnk`,
);
const uninstallKey = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${name}`;
// Where the installer remembers the install folder, to install there again next time.
const rememberedKey = `Software\\${config.bundle.publisher}\\${name}`;
const CDP_PORT = 9334;

test.skip(
  process.platform !== "win32" || !process.env.INSTALLER_E2E,
  "set INSTALLER_E2E=1 to install, start and uninstall the built installer",
);
test.describe.configure({ mode: "serial" });

const powershell = (script: string) =>
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  }).trim();
/** The values of a registry key, or undefined when it does not exist. */
const registry = (root: "HKCU" | "HKLM", key: string): Record<string, unknown> | undefined => {
  const out = powershell(
    `$k = Get-ItemProperty -LiteralPath 'Registry::${root}\\${key}' -ErrorAction SilentlyContinue; if ($k) { $k | ConvertTo-Json -Compress }; exit 0`,
  );
  return out ? JSON.parse(out) : undefined;
};
const desktopShortcut = () =>
  join(powershell("[Environment]::GetFolderPath('Desktop')"), `${name}.lnk`);
const folderSize = (folder: string): number =>
  readdirSync(folder, { withFileTypes: true }).reduce((sum, entry) => {
    const path = join(folder, entry.name);
    return sum + (entry.isDirectory() ? folderSize(path) : statSync(path).size);
  }, 0);
const mb = (bytes: number) => (bytes / 1_000_000).toFixed(2);

test.beforeAll(() => {
  expect(existsSync(installer), `build it first: ${installer}`).toBe(true);
  // Never replace a real installation of the app.
  expect(existsSync(installDir), `${installDir} exists; uninstall the app first`).toBe(false);
  // An earlier install into another folder would be repeated there.
  const remembered = registry("HKCU", rememberedKey)?.["(default)"];
  expect([undefined, installDir], `HKCU\\${rememberedKey} names another folder`).toContain(
    remembered,
  );
});

test("M2-19, D-29: installs for the current user without administrator rights, in the Start menu and in Apps", () => {
  test.setTimeout(120_000);
  const size = statSync(installer).size;
  console.log(`Installer: ${size} bytes (${mb(size)} MB)`);
  test.info().annotations.push({ type: "installer size", description: `${size} bytes` });

  // NSIS's silent switch; the installer asks for no elevation (RequestExecutionLevel user).
  execFileSync(installer, ["/S"]);

  expect(existsSync(exe)).toBe(true);
  expect(existsSync(startMenu)).toBe(true);
  expect(registry("HKCU", uninstallKey)).toMatchObject({
    DisplayName: name,
    DisplayVersion: version,
    Publisher: "iteratecraft",
    UninstallString: `"${join(installDir, "uninstall.exe")}"`,
  });
  // Nothing machine-wide.
  expect(registry("HKLM", uninstallKey)).toBeUndefined();

  const installed = folderSize(installDir);
  console.log(`Installed size: ${installed} bytes (${mb(installed)} MB)`);
  test.info().annotations.push({ type: "installed size", description: `${installed} bytes` });
});

test("the installed app starts: cold start to the dashboard, and idle memory", async () => {
  test.setTimeout(180_000);
  const started = performance.now();
  const app: ChildProcess = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
  });
  let browser: Browser | undefined;
  try {
    await expect
      .poll(
        async () => {
          browser = await chromium
            .connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
            .catch(() => undefined);
          return browser !== undefined;
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    await expect.poll(() => browser?.contexts()[0]?.pages()[0]).toBeTruthy();
    const page = browser?.contexts()[0]?.pages()[0] as Page;
    await expect(page.getByRole("heading", { level: 1, name: "Your courses" })).toBeVisible({
      timeout: 60_000,
    });
    const coldStart = Math.round(performance.now() - started);
    await expect(page.getByRole("contentinfo")).toHaveText(`Version ${version}`);
    console.log(`Cold start to the dashboard: ${coldStart} ms`);
    test.info().annotations.push({ type: "cold start", description: `${coldStart} ms` });

    // Idle memory is measured the way app.e2e.ts does: five seconds after the page is up.
    await page.waitForTimeout(5_000);
    const tree = JSON.parse(
      powershell(`
        $all = Get-CimInstance Win32_Process
        $ids = @(${app.pid}); $i = 0
        while ($i -lt $ids.Count) { $ids += @($all | ? ParentProcessId -eq $ids[$i] | % ProcessId); $i++ }
        ConvertTo-Json -Compress @($all | ? { $ids -contains $_.ProcessId } |
          % { @{ workingSet = $_.WorkingSetSize; privateBytes = $_.PrivatePageCount } })`),
    ) as { workingSet: number; privateBytes: number }[];
    const sum = (key: "workingSet" | "privateBytes") => tree.reduce((n, p) => n + p[key], 0);
    const mib = (n: number) => (n / 1024 / 1024).toFixed(1);
    const report = `${tree.length} processes, working set ${mib(sum("workingSet"))} MiB, private ${mib(sum("privateBytes"))} MiB`;
    console.log(`Idle memory of the installed app: ${report}`);
    test.info().annotations.push({ type: "idle memory", description: report });
  } finally {
    await browser?.close();
    app.kill();
  }
  // The uninstaller cannot remove a running program: wait until it has gone.
  await expect
    .poll(() =>
      powershell(
        `(Get-Process -Name course-suite-desktop -ErrorAction SilentlyContinue | ? Path -eq '${exe}').Count`,
      ),
    )
    .toBe("0");
});

test("M2-19: uninstalls cleanly and keeps the author's projects and app data", async () => {
  test.setTimeout(120_000);
  // A project saved anywhere, one saved by mistake inside the install folder, and the app data
  // folder (the author's font library and course list) the app made when it started.
  const projects = mkdtempSync(join(tmpdir(), "course-suite-projects-"));
  const project = join(projects, "Safety basics.crs");
  const misplaced = join(installDir, "Saved here.crs");
  writeFileSync(project, "project bytes");
  writeFileSync(misplaced, "project bytes");
  expect(existsSync(dataFolder)).toBe(true);

  try {
    // The NSIS uninstaller copies itself to a temporary folder and returns at once.
    execFileSync(join(installDir, "uninstall.exe"), ["/S"]);
    await expect.poll(() => registry("HKCU", uninstallKey), { timeout: 60_000 }).toBeUndefined();
    await expect.poll(() => existsSync(exe), { timeout: 60_000 }).toBe(false);

    expect(existsSync(join(installDir, "uninstall.exe"))).toBe(false);
    expect(existsSync(startMenu)).toBe(false);
    expect(existsSync(desktopShortcut())).toBe(false);
    expect(readFileSync(project, "utf8")).toBe("project bytes");
    // The uninstaller removes only what it installed, so a file of the author's is kept.
    expect(readFileSync(misplaced, "utf8")).toBe("project bytes");
    expect(readdirSync(installDir)).toEqual(["Saved here.crs"]);
    expect(existsSync(dataFolder)).toBe(true);
    // Kept with the app data, so a reinstall goes to the same folder.
    expect(registry("HKCU", rememberedKey)?.["(default)"]).toBe(installDir);
  } finally {
    rmSync(projects, { recursive: true, force: true });
    rmSync(misplaced, { force: true });
    if (existsSync(installDir) && readdirSync(installDir).length === 0)
      rmSync(installDir, { recursive: true });
  }
});
