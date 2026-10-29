// The updater end to end on Windows (M2-20; M0-09, D-29, D-62): builds the app twice, as versions
// 0.0.1 and 0.0.2, with a throwaway update key made for this run, serves 0.0.2's update
// information and installer from a local server, installs 0.0.1 for the current user, and checks
// that it refuses a download whose signature is not its key's, then updates in place to 0.0.2,
// which starts again and still opens the author's project.
//
// It never touches a real installation or the author's data: the test builds are called
// "Course Suite Update Test" with their own identifier, program name, install folder and data
// folder, their window stays hidden, the installer runs silently, and the page is driven over
// WebView2's DevTools port, never with keyboard or mouse input on the desktop. Everything it
// installed, wrote and generated (the key pair included) is removed at the end. It builds in
// `src-tauri/target/update-e2e` (about 10 minutes the first time), after `pnpm build`:
// UPDATE_E2E=1 pnpm --filter @course-suite/desktop exec playwright test --project update
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Course, SCHEMA_VERSION } from "@course-suite/format";
import { createProject, memoryProjectFiles, saveProject } from "@course-suite/project";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";

const desktop = join(import.meta.dirname, "..");
const shell = join(desktop, "src-tauri");
const config = JSON.parse(readFileSync(join(shell, "tauri.conf.json"), "utf8"));
const NAME = "Course Suite Update Test";
const BINARY = "course-suite-update-test";
const IDENTIFIER = `${config.identifier}.updatetest`;
const OLD = "0.0.1";
const NEW = "0.0.2";
// Fixed, because the address is built into both test builds.
const PORT = 47219;
const CDP_PORT = 9335;
const target = join(shell, "target", "update-e2e");
const installer = (version: string) =>
  join(target, "release", "bundle", "nsis", `${NAME}_${version}_x64-setup.exe`);
const installDir = join(process.env.LOCALAPPDATA ?? "", NAME);
const exe = join(installDir, `${BINARY}.exe`);
const dataFolder = join(process.env.LOCALAPPDATA ?? "", IDENTIFIER);
const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${NAME}`;
const rememberedKey = `HKCU\\Software\\${config.bundle.publisher}\\${NAME}`;

/** Runs this workspace's Tauri CLI without a shell, so paths with spaces stay whole. */
const tauri = (args: string[], env: Record<string, string> = {}) =>
  execFileSync(
    process.execPath,
    [join(desktop, "node_modules/@tauri-apps/cli/tauri.js"), ...args],
    {
      cwd: desktop,
      stdio: "ignore",
      env: { ...process.env, ...env },
    },
  );

test.skip(
  process.platform !== "win32" || !process.env.UPDATE_E2E,
  "set UPDATE_E2E=1 to build two test versions, install one and update it to the other",
);
test.describe.configure({ mode: "serial" });

const powershell = (script: string) =>
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  }).trim();
const registryValue = (key: string, value: string): string | undefined => {
  const out = powershell(
    `$k = Get-ItemProperty -LiteralPath 'Registry::${key}' -ErrorAction SilentlyContinue; if ($k) { $k.'${value}' }; exit 0`,
  );
  return out || undefined;
};
const running = () =>
  Number(powershell(`@(Get-Process -Name ${BINARY} -ErrorAction SilentlyContinue).Count`) || "0");
const mib = (n: number) => (n / 1024 / 1024).toFixed(1);
/** Working set and private bytes of the running app and its WebView2 processes. */
function idleMemory(): string {
  const tree = JSON.parse(
    powershell(`
      $all = Get-CimInstance Win32_Process
      $ids = @($all | ? Name -eq '${BINARY}.exe' | % ProcessId); $i = 0
      while ($i -lt $ids.Count) { $ids += @($all | ? ParentProcessId -eq $ids[$i] | % ProcessId); $i++ }
      ConvertTo-Json -Compress @($all | ? { $ids -contains $_.ProcessId } |
        % { @{ workingSet = $_.WorkingSetSize; privateBytes = $_.PrivatePageCount } })`),
  ) as { workingSet: number; privateBytes: number }[];
  const sum = (key: "workingSet" | "privateBytes") => tree.reduce((n, p) => n + p[key], 0);
  return `${tree.length} processes, working set ${mib(sum("workingSet"))} MiB, private ${mib(sum("privateBytes"))} MiB`;
}

let work = "";
let server: Server | undefined;
let browser: Browser | undefined;
/** What the local release site serves as the update information, and what it was asked for. */
let latest = "";
const requests: string[] = [];
const project = () => join(work, "Ladder safety.crs");
const TITLE = "Ladder safety";
const course: Course = {
  schemaVersion: SCHEMA_VERSION,
  id: "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
  kind: "course",
  title: TITLE,
  entries: [{ id: "lessladder", kind: "lesson", title: "Before you climb", blocks: [] }],
  media: [],
};
const card = (page: Page) =>
  page.getByRole("row").filter({ has: page.getByText(TITLE, { exact: true }) });

/** Builds one test version with the test key, address and hidden window, and gives its installer. */
function build(version: string, key: string, pubkey: string): string {
  const overrides = {
    productName: NAME,
    mainBinaryName: BINARY,
    identifier: IDENTIFIER,
    version,
    app: { windows: config.app.windows.map((w: object) => ({ ...w, visible: false })) },
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey,
        endpoints: [`http://127.0.0.1:${PORT}/latest.json`],
        // Only the test's local server is plain http; the real address is https (release.test.ts).
        dangerousInsecureTransportProtocol: true,
        // Silent, so nothing shows on the screen; the shipped app shows NSIS's progress bar.
        windows: { installMode: "quiet" },
      },
    },
  };
  const file = join(work, `tauri.${version}.conf.json`);
  writeFileSync(file, JSON.stringify(overrides));
  tauri(["build", "--ci", "--config", file, "--", "--locked"], {
    CARGO_TARGET_DIR: target,
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  });
  return installer(version);
}

/** Connects to the app's page over WebView2's DevTools port, once it is up. */
async function connect(): Promise<Page> {
  await browser?.close().catch(() => {});
  let page: Page | undefined;
  await expect
    .poll(
      async () => {
        browser = await chromium
          .connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
          .catch(() => undefined);
        page = browser?.contexts()[0]?.pages()[0];
        return page !== undefined;
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  return page as Page;
}

test.beforeAll(async () => {
  test.setTimeout(40 * 60_000);
  // Never replace an installation of the test app left behind by an interrupted run.
  expect(existsSync(installDir), `${installDir} exists; uninstall it first`).toBe(false);
  work = mkdtempSync(join(tmpdir(), "course-suite-update-"));

  // The throwaway key pair; the private key never leaves this folder, which is deleted after.
  tauri(["signer", "generate", "--ci", "-p", "", "-w", join(work, "update.key")]);
  const key = readFileSync(join(work, "update.key"), "utf8");
  const pubkey = readFileSync(join(work, "update.key.pub"), "utf8");
  // A second key, whose signature (of the right version) the app must refuse.
  tauri(["signer", "generate", "--ci", "-p", "", "-w", join(work, "other.key")]);

  build(OLD, key, pubkey);
  const update = build(NEW, key, pubkey);
  const signature = readFileSync(`${update}.sig`, "utf8");
  tauri(["signer", "sign", "-f", join(work, "other.key"), "-p", "", "--app-version", NEW, update]);
  const forged = readFileSync(`${update}.sig`, "utf8");
  const info = (sig: string) =>
    JSON.stringify({
      version: NEW,
      notes: "A test release.",
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: sig,
          url: `http://127.0.0.1:${PORT}/Course-Suite-Update-Test_${NEW}_x64-setup.exe`,
        },
      },
    });
  latest = info(forged);
  const good = info(signature);
  Object.assign(globalThis, { switchToGoodSignature: () => (latest = good) });

  const bytes = readFileSync(update);
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/latest.json") {
      response.writeHead(200, { "content-type": "application/json" }).end(latest);
    } else if (request.url?.endsWith("_x64-setup.exe")) {
      response
        .writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": bytes.length,
        })
        .end(bytes);
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server?.listen(PORT, "127.0.0.1", resolve));

  // The author's project, saved before the update, and allowed as if picked in a dialog.
  const files = memoryProjectFiles();
  await saveProject(files, "Ladder safety.crs", createProject(course));
  writeFileSync(project(), files.files.get("Ladder safety.crs") as Uint8Array);
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (server) await new Promise((resolve) => server?.close(resolve));
  await browser?.close().catch(() => {});
  try {
    if (running() > 0)
      powershell(`Stop-Process -Name ${BINARY} -Force -ErrorAction SilentlyContinue`);
    await expect.poll(running, { timeout: 60_000 }).toBe(0);
    if (existsSync(join(installDir, "uninstall.exe"))) {
      execFileSync(join(installDir, "uninstall.exe"), ["/S"]);
      await expect.poll(() => existsSync(exe), { timeout: 60_000 }).toBe(false);
    }
    rmSync(installDir, { recursive: true, force: true });
    // The test's own data folder and remembered install folder; nothing of the real app's.
    rmSync(dataFolder, { recursive: true, force: true });
    powershell(
      `Remove-Item -LiteralPath 'Registry::${rememberedKey}' -Recurse -ErrorAction SilentlyContinue; exit 0`,
    );
  } finally {
    // The key pair, the builds' settings and the project, whatever happened above.
    if (work) rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("M2-20, D-62: the old version installs for the current user, opens the author's project and refuses an update whose signature is not its key's", async () => {
  test.setTimeout(300_000);
  const size = statSync(installer(OLD)).size;
  console.log(`Test installer with the updater: ${size} bytes`);
  execFileSync(installer(OLD), ["/S"]);
  expect(registryValue(uninstallKey, "DisplayVersion")).toBe(OLD);
  // The project as one the author picked earlier: in the app's remembered picks (picks.rs).
  mkdirSync(dataFolder, { recursive: true });
  writeFileSync(join(dataFolder, "picked.txt"), `${project()}\n`);

  spawn(exe, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
  }).unref();
  const page = await connect();
  // On by default, the first start checks, and finds 0.0.2 (with a forged signature).
  const offer = page.getByRole("alertdialog", { name: `${NAME} ${NEW} is available` });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await expect(offer.getByRole("region", { name: "What changed" })).toHaveText("A test release.");
  await offer.getByRole("button", { name: "Install and restart" }).click();
  const refused = page.getByRole("alertdialog", { name: "The update was not installed" });
  await expect(refused).toContainText(
    `The download does not carry a valid signature of ${NAME}, so it was not installed.`,
    { timeout: 60_000 },
  );
  await refused.getByRole("button", { name: "OK" }).click();
  expect(requests).toEqual(["/latest.json", `/Course-Suite-Update-Test_${NEW}_x64-setup.exe`]);
  await expect(page.getByRole("contentinfo")).toHaveText(`Version ${OLD}`);
  expect(registryValue(uninstallKey, "DisplayVersion")).toBe(OLD);

  // The author's project is in the course list (as after opening it) and opens.
  await page.evaluate(
    ([id, name, title]) =>
      localStorage.setItem(
        "course-suite:library",
        JSON.stringify([
          { file: { id, name }, title, kind: "course", lessons: 1, created: 1, updated: 1 },
        ]),
      ),
    [project(), "Ladder safety.crs", TITLE],
  );
  await page.reload();
  await card(page).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Back to your courses" }).click();
  await page.waitForTimeout(5_000);
  console.log(`Idle memory of ${OLD} after a check: ${idleMemory()}`);
});

test("M2-20, D-62: from settings, Check now finds the update, checks its signature, installs it in place and starts the new version, which opens the author's project", async () => {
  test.setTimeout(300_000);
  (globalThis as unknown as { switchToGoodSignature(): void }).switchToGoodSignature();
  const page = await connect();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Check now" }).click();
  await page
    .getByRole("alertdialog", { name: `${NAME} ${NEW} is available` })
    .getByRole("button", { name: "Install and restart" })
    .click();
  // The app exits as the installer starts; the installer replaces it and starts the new version.
  await expect
    .poll(() => registryValue(uninstallKey, "DisplayVersion"), { timeout: 120_000 })
    .toBe(NEW);
  const updated = await connect();
  await expect(updated.getByRole("contentinfo")).toHaveText(`Version ${NEW}`, {
    timeout: 60_000,
  });
  expect(requests.filter((url) => url.endsWith(".exe"))).toHaveLength(2);
  // The same install folder, and no second copy anywhere.
  expect(existsSync(exe)).toBe(true);

  // Started again the same day: no check at start. The project is still listed and opens.
  await updated.waitForTimeout(5_000);
  console.log(`Idle memory of ${NEW} before any check: ${idleMemory()}`);
  expect(requests.filter((url) => url === "/latest.json")).toHaveLength(2);
  await card(updated).click();
  await expect(updated.getByRole("heading", { level: 1 })).toHaveText(TITLE, {
    timeout: 30_000,
  });
});
