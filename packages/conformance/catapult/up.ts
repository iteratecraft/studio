// Starts a fresh CATAPULT (its CTS, cmi5 player and their LRS) for the cmi5 end-to-end job (M2-21)
// and signs up the CTS's first user, ready for `test:catapult`:
// `pnpm --filter @course-suite/conformance catapult:up`. Needs Docker with Linux containers and git;
// see docs/ci.md. Any CATAPULT this harness started before is removed first, with its data.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CATAPULT_URL, CTS_USER } from "./catapult.js";

/** CATAPULT 1.0.8, by its commit: git checks out exactly the files of that commit. */
const RELEASE = {
  repository: "https://github.com/adlnet/CATAPULT.git",
  commit: "806c0baaa0fa99c9cb4f398ad7eb21fc5461c6e4",
};
const SOURCE = join(import.meta.dirname, ".cache", "CATAPULT");
// The images built from that commit carry it as their tag (compose.yaml), so a new commit builds
// new images and an unchanged one reuses them.
process.env.CATAPULT_COMMIT = RELEASE.commit;

const git = (...args: string[]) =>
  execFileSync("git", ["-C", SOURCE, ...args], { encoding: "utf8" }).trim();
const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "-f", join(import.meta.dirname, "compose.yaml"), ...args], {
    stdio: "inherit",
  });

const checkedOut = () => {
  try {
    return git("rev-parse", "HEAD") === RELEASE.commit && git("status", "--porcelain") === "";
  } catch {
    return false;
  }
};
if (!existsSync(SOURCE) || !checkedOut()) {
  console.log(`Fetching CATAPULT ${RELEASE.commit}`);
  rmSync(SOURCE, { recursive: true, force: true });
  execFileSync("git", ["init", "--quiet", SOURCE]);
  git("fetch", "--quiet", "--depth", "1", RELEASE.repository, RELEASE.commit);
  git("-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD");
  if (!checkedOut()) throw new Error(`CATAPULT is not at ${RELEASE.commit}`);
}

compose("down", "--volumes", "--remove-orphans");
compose("up", "--detach", "--wait", "proxy");

// The CTS answers once it has run its migrations; its first user is made through its bootstrap
// route, which also gives that user a tenant in the player, so it waits for the player too.
const auth = `Basic ${Buffer.from(`${CTS_USER.username}:${CTS_USER.password}`).toString("base64")}`;
for (let attempt = 1; ; attempt++) {
  const login = await fetch(`${CATAPULT_URL}/api/v1/login`, { headers: { Authorization: auth } })
    .then(async (response) => ({ status: response.status, body: await response.json() }))
    .catch(() => undefined);
  if (login?.status === 200) break;
  if (login?.status === 401 && login.body?.isBootstrapped === false) {
    const bootstrap = await fetch(`${CATAPULT_URL}/api/v1/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstUser: CTS_USER }),
    });
    if (bootstrap.ok) continue;
  }
  if (attempt === 90)
    throw new Error(`The CTS at ${CATAPULT_URL} is not ready: ${JSON.stringify(login)}`);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
console.log(`CATAPULT is ready at ${CATAPULT_URL}`);
