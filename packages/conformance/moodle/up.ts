// Starts a fresh Moodle for the end-to-end job (M1-21) and installs it, ready for `test:moodle`:
// `pnpm --filter @course-suite/conformance moodle:up`. Needs Docker with Linux containers; see
// docs/ci.md. Any Moodle this harness started before is removed first, with its data.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The Moodle 5.3 release (LTS), checked against the SHA-256 that moodle.org publishes beside it. */
const RELEASE = {
  url: "https://download.moodle.org/download.php/direct/stable503/moodle-5.3.tgz",
  sha256: "7e5edf110555956571f40e42acffde0eb23681ebebd212a2fec0fe7d795dd511",
};
const TARBALL = join(import.meta.dirname, ".cache", "moodle.tgz");
const MOODLE_URL = `http://localhost:${process.env.MOODLE_PORT ?? "8250"}`;

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
// As the web server's user, so the files it writes to moodledata stay writable for Apache.
const php = (...args: string[]) =>
  compose("exec", "-T", "-u", "www-data", "-w", "/var/www/html", "webserver", "php", ...args);
php(
  "admin/cli/install_database.php",
  "--agree-license",
  "--fullname=Course Suite test LMS",
  "--shortname=coursesuite",
  "--adminpass=Admin-pass-1",
  "--adminemail=admin@example.com",
);
php("admin/cli/build_theme_css.php", "--themes=boost");
php("/harness/cli.php", "site");

// The first pages Moodle serves fill its caches; wait for the login page before the tests start.
for (let attempt = 1; ; attempt++) {
  const status = await fetch(`${MOODLE_URL}/login/index.php`).then(
    (response) => response.status,
    () => 0,
  );
  if (status === 200) break;
  if (attempt === 60) throw new Error(`${MOODLE_URL}/login/index.php still answers ${status}`);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
console.log(`Moodle is ready at ${MOODLE_URL}`);
