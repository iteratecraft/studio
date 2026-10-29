// The Windows installer and its release (M2-19; M0-08, D-2, D-29, D-30, D-49) are configuration
// and workflows that never run on pull requests, so these tests pin them there: a change to how a
// release is built or published must change this file too, in a reviewed pull request.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(text(path));
const config = json("apps/desktop/src-tauri/tauri.conf.json");
const release = text(".github/workflows/release.yml");
const mirror = text(".github/workflows/mirror-media-tool.yml");

/** A workflow's `on:` block, as written. */
const triggers = (workflow: string) => /^on:\n(?:(?: .*)?\n)*/m.exec(workflow)?.[0].trimEnd();

/** The `run: |` script of a workflow's step, by the step's name, as bash gets it. */
function stepScript(workflow: string, name: string): string {
  const lines = workflow.split("\n");
  const at = lines.indexOf(`      - name: ${name}`);
  expect(at, name).toBeGreaterThan(0);
  const run = lines.findIndex((line, i) => i > at && line === "        run: |");
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line !== "" && !line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

// GitHub's Windows runners run `shell: bash` with Git's bash, as these tests do.
const bash =
  process.platform === "win32"
    ? resolve(
        execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(),
        "../../../bin/bash.exe",
      )
    : "bash";
// Each run starts bash, node and a few coreutils: about 0.3 s here, several seconds on a cold
// Windows runner, so these tests get more than the default 5 s.
const runsBash = { timeout: 60_000 };

describe("M2-19: the Windows installer", () => {
  test("is Tauri's NSIS installer, installed for the current user without administrator rights", () => {
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.targets).toEqual(["nsis"]);
    expect(config.bundle.windows.nsis.installMode).toBe("currentUser");
  });

  test("D-30: is named Course Suite and takes its version from the workspace", () => {
    expect(config.productName).toBe("Course Suite");
    expect(config.version).toBe("../package.json");
    expect(config.bundle.icon).toEqual(["icons/icon.ico", "icons/icon.png"]);
  });

  test("is built by the same command on a contributor's machine and in the release workflow", () => {
    const command = json("apps/desktop/package.json").scripts["build:installer"];
    expect(command).toBe("tauri build --ci -- --locked");
    expect(release).toContain("run: pnpm --filter @course-suite/desktop build:installer\n");
  });
});

describe("M2-19: the release workflow", () => {
  test("runs only on a version tag or when started by hand, never on a pull request", () => {
    expect(triggers(release)).toBe('on:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:');
  });

  test("refuses a tag that is not the workspace version", () => {
    expect(release).toContain('"$GITHUB_REF_NAME" != "v$version"');
  });

  test("D-2: signs only when both signing secrets exist, and otherwise says the build is unsigned", () => {
    const steps = release.split(/\n {6}- /);
    const usingSecrets = steps.filter((step) => step.includes("secrets.WINDOWS_CERTIFICATE }}"));
    expect(usingSecrets).toHaveLength(1);
    expect(usingSecrets[0]).toContain("if: env.SIGNING_SET == 'true'");
    expect(release).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not a template
      "SIGNING_SET: ${{ secrets.WINDOWS_CERTIFICATE != '' && secrets.WINDOWS_CERTIFICATE_PASSWORD != '' }}",
    );
    expect(steps.find((step) => step.startsWith("name: Unsigned build"))).toContain(
      "if: env.SIGNING_SET != 'true'",
    );
  });

  test("D-2: attaches the installer and its SHA-256 checksums to a draft release only", () => {
    expect(release).toContain("sha256sum");
    expect(release).toContain('gh release create "$TAG" --draft');
    expect(release).not.toMatch(/gh release (delete|edit .*--draft=false)|--latest(?!=false)/);
  });
});

describe("D-49: the media converter mirror", () => {
  const pin = json("apps/desktop/src-tauri/media-tool.json");
  const file = basename(pin.upstream);
  const mirrorUrl = `https://github.com/iteratecraft/studio/releases/download/${pin.folder}/${file}`;

  test("the app downloads the pinned build from its upstream release until the mirror run has checked it", () => {
    expect(pin.upstream).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//);
    // A follow-up pull request points `url` at `mirrorUrl` once the mirror workflow has run on
    // main; until then a mirror address here is a download that does not exist yet.
    expect(pin.url).toBe(pin.upstream);
    // The release is never taken for an app release (v*), which the release workflow builds.
    expect(pin.folder).not.toMatch(/^v/);
  });

  test("the mirror workflow runs only when started by hand and checks the pinned SHA-256", () => {
    expect(triggers(mirror)).toBe("on:\n  workflow_dispatch:");
    expect(mirror).toContain("require('./apps/desktop/src-tauri/media-tool.json')");
    expect(mirror).toContain("sha256sum --check --strict");
    expect(mirror).toContain("--prerelease --latest=false");
  });

  // The workflow's own script, run by bash with the flags GitHub uses, against a fake GitHub
  // (fake-github.sh) in a checkout whose pin is the real one but for a small stand-in archive.
  const script = stepScript(mirror, "Mirror the build");
  const fakeGitHub = readFileSync(join(import.meta.dirname, "fake-github.sh"), "utf8");
  const build = Buffer.from("a stand-in for the pinned archive\n");
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A checkout with the real pin apart from `changes`, and a run of the workflow's script in it. */
  const setUp = (changes: Record<string, unknown>) => {
    dir = mkdtempSync(join(tmpdir(), "mirror-"));
    const at = (...parts: string[]) => join(dir, ...parts).replaceAll("\\", "/");
    mkdirSync(at("checkout/apps/desktop/src-tauri"), { recursive: true });
    mkdirSync(at("store"));
    mkdirSync(at("runner"));
    const sha256 = createHash("sha256").update(build).digest("hex");
    const fake = { ...pin, sha256, size: build.length, ...changes };
    writeFileSync(at("checkout/apps/desktop/src-tauri/media-tool.json"), JSON.stringify(fake));
    writeFileSync(at("fixture.zip"), build);
    writeFileSync(at("mirror.sh"), `${fakeGitHub}\n${script}\n`);
    const run = () => {
      writeFileSync(at("log"), "");
      const result = spawnSync(
        bash,
        ["--noprofile", "--norc", "-eo", "pipefail", at("mirror.sh")],
        {
          cwd: at("checkout"),
          encoding: "utf8",
          env: {
            ...process.env,
            GH_REPO: "iteratecraft/studio",
            GITHUB_SHA: "0".repeat(40),
            RUNNER_TEMP: at("runner"),
            STORE: at("store"),
            LOG: at("log"),
            FIXTURE: at("fixture.zip"),
            UPSTREAM: pin.upstream,
          },
        },
      );
      const log = readFileSync(at("log"), "utf8").trim();
      return { status: result.status, out: result.stdout, log: log ? log.split("\n") : [] };
    };
    return { run, mirrored: at("store", pin.folder, file) };
  };

  test(
    "with url still at upstream, the first run builds the mirror address from folder and the file name, uploads the build there and checks the copy",
    runsBash,
    () => {
      const { run, mirrored } = setUp({});
      const first = run();
      expect(first.out).toContain(`::notice title=Mirrored::${mirrorUrl} (SHA-256`);
      expect(first.out).toContain("Point media-tool.json url at it in a pull request.");
      expect(first.status).toBe(0);
      expect(first.log).toEqual([
        `fetch ${pin.upstream}`,
        `create ${pin.folder}`,
        `fetch ${mirrorUrl}`,
      ]);
      expect(readFileSync(mirrored)).toEqual(build);

      // Run again: the release holds the build, so nothing is fetched upstream or uploaded.
      const again = run();
      expect(again.status).toBe(0);
      expect(again.log).toEqual([`fetch ${mirrorUrl}`]);
    },
  );

  test(
    "with url at the mirror (the follow-up pull request), it runs the same and says the app downloads it",
    runsBash,
    () => {
      const { run, mirrored } = setUp({ url: mirrorUrl });
      const result = run();
      expect(result.out).toContain(`::notice title=Mirrored::the app downloads ${mirrorUrl}`);
      expect(result.status).toBe(0);
      expect(existsSync(mirrored)).toBe(true);
    },
  );

  test(
    "a download whose SHA-256 is not the pinned one is refused and nothing is uploaded",
    runsBash,
    () => {
      const { run, mirrored } = setUp({ sha256: "0".repeat(64) });
      const result = run();
      expect(result.status).not.toBe(0);
      expect(result.log).toEqual([`fetch ${pin.upstream}`]);
      expect(existsSync(mirrored)).toBe(false);
    },
  );

  test(
    "a url that is neither upstream nor the mirror is refused before anything is fetched",
    runsBash,
    () => {
      const { run } = setUp({ url: "https://example.org/ffmpeg.zip" });
      const result = run();
      expect(result.status).not.toBe(0);
      expect(result.out).toContain(
        `::error title=Pin mismatch::media-tool.json url must be upstream or ${mirrorUrl}`,
      );
      expect(result.log).toEqual([]);
    },
  );
});

describe("ADR-0004: the installer's outbound connections", () => {
  const adr = text("docs/adr/0004-outbound-connections.md");
  const row = adr.split("\n").find((line) => line.startsWith("| WebView2 bootstrapper"));

  test("M2-19: the WebView2 bootstrapper the installer downloads has a row: what, when, and the closed-network alternative", () => {
    expect(config.bundle.windows.webviewInstallMode.type).toBe("downloadBootstrapper");
    // The address Tauri's NSIS installer fetches the bootstrapper from.
    expect(row).toContain("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
    expect(row).toContain("`downloadBootstrapper`");
    expect(row).toContain("only on a machine without the WebView2 runtime");
    expect(row).toContain("`offlineInstaller`");
    expect(row).toContain("`embedBootstrapper`");
  });
});

describe("M2-20: updates from GitHub Releases", () => {
  const updater = config.plugins.updater;

  test("[teams-collab:3R] R13: the app asks only the latest published release of this repository, over https", () => {
    // GitHub serves releases/latest from the newest release that is neither a draft nor a
    // pre-release, so a draft or the media converter's mirror (a pre-release) is never offered.
    expect(updater.endpoints).toEqual([
      "https://github.com/iteratecraft/studio/releases/latest/download/latest.json",
    ]);
    expect(Object.keys(updater).filter((key) => key.startsWith("dangerous"))).toEqual([]);
  });

  test("D-62: a signature binds its version, nothing older is installed, and the per-user install is replaced showing only its progress", () => {
    expect(updater.requireSignedVersion).toBe(true);
    expect(updater.allowDowngrades).toBeUndefined();
    expect(updater.windows).toEqual({ installMode: "passive" });
  });

  test("the public key is one value the lead fills in; the release workflow alone makes update files", () => {
    const { pubkey } = updater;
    // Empty until then (the app says it cannot update), or the public key `tauri signer generate`
    // writes: two lines of minisign, in base64.
    if (pubkey !== "") {
      expect(Buffer.from(pubkey, "base64").toString()).toMatch(
        /^untrusted comment: minisign public key: [0-9A-F]{16}\nRW[A-Za-z0-9+/]{54}\n?$/,
      );
    }
    expect(config.bundle.createUpdaterArtifacts).toBeUndefined();
  });
});

describe("M2-20: the release workflow's update metadata", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const shell = "apps/desktop/src-tauri";

  /** A checkout whose app carries `pubkey`, with `files` in it, and a run of a step's script. */
  const setUp = (pubkey: string, files: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), "release-"));
    const at = (...parts: string[]) => join(dir, ...parts).replaceAll("\\", "/");
    const all = {
      [`${shell}/tauri.conf.json`]: JSON.stringify({ plugins: { updater: { pubkey } } }),
      ...files,
    };
    for (const [path, content] of Object.entries(all)) {
      mkdirSync(join(at("checkout"), path, ".."), { recursive: true });
      writeFileSync(at("checkout", path), content);
    }
    mkdirSync(at("out"));
    const run = (step: string, env: Record<string, string> = {}) => {
      writeFileSync(at("step.sh"), stepScript(release, step));
      const result = spawnSync(bash, ["--noprofile", "--norc", "-eo", "pipefail", at("step.sh")], {
        cwd: at("checkout"),
        encoding: "utf8",
        env: { ...process.env, OUT: at("out"), ...env },
      });
      return { status: result.status, out: result.stdout };
    };
    return { run, at };
  };

  test("the signing secret reaches only the installer build, and latest.json and the signature go on the draft", () => {
    const steps = release.split(/\n {6}- /);
    const using = steps.filter((step) =>
      /secrets\.TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)? }}/.test(step),
    );
    expect(using.map((step) => step.split("\n")[0])).toEqual(["name: Build the installer"]);
    expect(release).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not a template
      "UPDATE_SIGNING_SET: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY != '' }}",
    );
    for (const name of ["Sign the update for the updater", "Write the update information"]) {
      expect(steps.find((step) => step.startsWith(`name: ${name}`))).toContain(
        "if: env.UPDATE_SIGNING_SET == 'true'",
      );
    }
    expect(steps.find((step) => step.startsWith("name: No update metadata"))).toContain(
      "if: env.UPDATE_SIGNING_SET != 'true'",
    );
    expect(release).toContain(
      '[ ! -f "$OUT/latest.json" ] || files+=("$OUT/latest.json" "$OUT"/*.sig)',
    );
  });

  test(
    "without the secret, update signing is skipped cleanly: a notice for an app without an update key, a warning for one with a key",
    runsBash,
    () => {
      const skipped = setUp("").run("No update metadata");
      expect(skipped.status).toBe(0);
      expect(skipped.out).toContain("::notice title=No update metadata::");
      const warned = setUp("RWQkey").run("No update metadata");
      expect(warned.status).toBe(0);
      expect(warned.out).toContain("::warning title=No update metadata::");
      expect(warned.out).not.toContain("::notice");
    },
  );

  test(
    "with the secret, an app without an update key stops the release; with one, the bundler is told to sign, keeping the code-signing settings",
    runsBash,
    () => {
      const stopped = setUp("").run("Sign the update for the updater");
      expect(stopped.status).not.toBe(0);
      expect(stopped.out).toContain("::error title=No update key in the app::");

      const codeSigning = { bundle: { windows: { certificateThumbprint: "AB12" } } };
      const { run, at } = setUp("RWQkey", {
        [`${shell}/tauri.windows.conf.json`]: JSON.stringify(codeSigning),
      });
      expect(run("Sign the update for the updater").status).toBe(0);
      expect(
        JSON.parse(readFileSync(at("checkout", shell, "tauri.windows.conf.json"), "utf8")),
      ).toEqual({ bundle: { ...codeSigning.bundle, createUpdaterArtifacts: true } });
    },
  );

  test(
    "latest.json names the version, where the installer is once the release is published, and the bundler's signature of it",
    runsBash,
    () => {
      const signature = Buffer.from("untrusted comment: signature\nRUQ...\n").toString("base64");
      const { run, at } = setUp("RWQkey", {
        [`${shell}/target/release/bundle/nsis/Course Suite_1.2.3_x64-setup.exe.sig`]: signature,
      });
      const result = run("Write the update information", {
        VERSION: "1.2.3",
        GH_REPO: "iteratecraft/studio",
      });
      expect(result.status).toBe(0);
      const releases = "https://github.com/iteratecraft/studio/releases";
      expect(JSON.parse(readFileSync(at("out", "latest.json"), "utf8"))).toEqual({
        version: "1.2.3",
        notes: `What changed: ${releases}/tag/v1.2.3`,
        platforms: {
          "windows-x86_64": {
            signature,
            url: `${releases}/download/v1.2.3/Course-Suite_1.2.3_x64-setup.exe`,
          },
        },
      });
      expect(readFileSync(at("out", "Course-Suite_1.2.3_x64-setup.exe.sig"), "utf8")).toBe(
        signature,
      );
    },
  );
});

describe("ADR-0004: the updater's outbound connections", () => {
  const adr = text("docs/adr/0004-outbound-connections.md");
  const row = adr.split("\n").find((line) => line.startsWith("| Update check and download"));

  test("M2-20: the update check and download have a row: GitHub only, when, and the off switch", () => {
    expect(row).toContain(
      "`https://github.com/iteratecraft/studio/releases/latest/download/latest.json`",
    );
    expect(row).toContain("GitHub only");
    expect(row).toContain("at most once a day");
    expect(row).toContain("never while offline");
    expect(row).toContain("Check for updates automatically");
  });
});
