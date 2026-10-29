// Starts a fresh ILIAS for the end-to-end job (M2-21) and installs it, ready for `test:ilias`:
// `pnpm --filter @course-suite/conformance ilias:up`. Needs Docker with Linux containers; see
// docs/ci.md. Any ILIAS this harness started before is removed first, with its data.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The ILIAS 11.5 release, the packaged one with its PHP and JavaScript dependencies, checked against
 * the SHA-256 that GitHub publishes beside it.
 */
const RELEASE = {
  url: "https://github.com/ILIAS-eLearning/ILIAS/releases/download/v11.5/ILIAS-11.5.tar.gz",
  sha256: "a11872f59962514dfa1224a998e6b57197e8fbbcea3a0b2d17fc33e66851240f",
};
const TARBALL = join(import.meta.dirname, ".cache", "ilias.tgz");
const ILIAS_URL = `http://localhost:${process.env.ILIAS_PORT ?? "8260"}`;

const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "-f", join(import.meta.dirname, "compose.yaml"), ...args], {
    stdio: "inherit",
  });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

if (!existsSync(TARBALL) || sha256(readFileSync(TARBALL)) !== RELEASE.sha256) {
  console.log(`Downloading ${RELEASE.url}`);
  const response = await fetch(RELEASE.url);
  if (!response.ok) throw new Error(`${RELEASE.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== RELEASE.sha256) throw new Error(`${RELEASE.url}: unexpected SHA-256`);
  mkdirSync(dirname(TARBALL), { recursive: true });
  writeFileSync(TARBALL, bytes);
}

compose("down", "--volumes", "--remove-orphans");
compose("up", "--detach", "--wait", "webserver");
// As the web server's user, so the files the setup writes stay writable for Apache.
const php = (...args: string[]) =>
  compose("exec", "-T", "-u", "www-data", "-w", "/var/www/ilias", "webserver", "php", ...args);
php(
  "cli/setup.php",
  "install",
  "--yes",
  "--no-legacy-plugins",
  `--config=http.path=${ILIAS_URL}`,
  "/harness/config.json",
);
php("/harness/cli.php", "site");

// Wait for the login page before the tests start.
for (let attempt = 1; ; attempt++) {
  const status = await fetch(`${ILIAS_URL}/login.php?client_id=coursesuite&lang=en`).then(
    (response) => response.status,
    () => 0,
  );
  if (status === 200) break;
  if (attempt === 60) throw new Error(`${ILIAS_URL}/login.php still answers ${status}`);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
console.log(`ILIAS is ready at ${ILIAS_URL}`);
