// The Windows installer and its release (M2-19; M0-08, D-2, D-29, D-30, D-49) are configuration
// and workflows that never run on pull requests, so these tests pin them there: a change to how a
// release is built or published must change this file too, in a reviewed pull request.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(text(path));
const config = json("apps/desktop/src-tauri/tauri.conf.json");
const release = text(".github/workflows/release.yml");
const mirror = text(".github/workflows/mirror-media-tool.yml");

/** A workflow's `on:` block, as written. */
const triggers = (workflow: string) => /^on:\n(?:(?: .*)?\n)*/m.exec(workflow)?.[0].trimEnd();

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

  test("the app downloads the pinned build from this repository's release named for it", () => {
    expect(pin.upstream).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//);
    expect(pin.url).toBe(
      `https://github.com/iteratecraft/studio/releases/download/${pin.folder}/${basename(pin.upstream)}`,
    );
    // The release is never taken for an app release (v*), which the release workflow builds.
    expect(pin.folder).not.toMatch(/^v/);
  });

  test("the mirror workflow runs only when started by hand and checks the pinned SHA-256", () => {
    expect(triggers(mirror)).toBe("on:\n  workflow_dispatch:");
    expect(mirror).toContain("require('./apps/desktop/src-tauri/media-tool.json')");
    expect(mirror).toContain("sha256sum --check --strict");
    expect(mirror).toContain("--prerelease --latest=false");
  });
});
