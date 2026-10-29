// The ILIAS that up.ts starts (M2-21), for the tests: its commands through `docker compose exec`
// (cli.php) and its pages through Playwright.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, type Frame, type Page } from "@playwright/test";

/** Where ILIAS answers; the same address as its http.path (up.ts). */
export const ILIAS_URL = `http://localhost:${process.env.ILIAS_PORT ?? "8260"}`;

/** Runs a cli.php command in the web server container and returns the JSON it prints last. */
function cli<T>(args: string[], input?: Uint8Array): T {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "-f",
      join(import.meta.dirname, "compose.yaml"),
      "exec",
      "-T",
      "-u",
      "www-data",
      "-w",
      "/var/www/ilias",
      "webserver",
      "php",
      "/harness/cli.php",
      ...args,
    ],
    { encoding: "utf8", ...(input && { input }) },
  );
  // The JSON is the last line; anything before it is ILIAS talking on the command line.
  try {
    return JSON.parse(output.trim().split("\n").at(-1) ?? "");
  } catch {
    throw new Error(`cli.php ${args[0]} printed no JSON:\n${output}`);
  }
}

export interface Module {
  refId: number;
  objId: number;
}

/** Uploads a SCORM package as a learning module in the repository, online and readable by the learner. */
export const upload = (zip: Uint8Array, name: string, version: "scorm12" | "scorm2004"): Module =>
  cli(["upload", name, version === "scorm2004" ? "scorm2004" : "scorm"], zip);

export interface Tracks {
  /**
   * What ILIAS keeps for the learner. SCORM 1.2: by data model element, such as
   * `cmi.core.lesson_status`. SCORM 2004: by column of its `cmi_node` table, such as
   * `completion_status`, `success_status`, `c_raw`, `scaled`, `location`, `suspend_data`.
   */
  elements: Record<string, string>;
}

/** What ILIAS recorded for the learner in the module's tracking tables. */
export const tracks = (module: Module): Tracks => cli(["tracks", String(module.objId)]);

/** Logs the learner in (cli.php creates the account). */
export async function logIn(page: Page): Promise<void> {
  await page.goto(`${ILIAS_URL}/login.php?client_id=coursesuite&lang=en`);
  await page.getByLabel(/^(user ?name|login)/i).fill("learner");
  await page.getByLabel(/^password/i).fill("Learner-pass-1");
  await page.getByRole("button", { name: /^(log ?in|sign in)$/i }).click();
  await expect(page).not.toHaveURL(/\/login\.php/);
  // Not held on the form that asks for a new password.
  await expect(page).not.toHaveURL(/showPassword/);
}

/** The frame our launch page runs in, inside the module's data folder. */
const LAUNCH = /\/lm_data\/lm_\d+\/index\.html/;

/**
 * Opens the module's player as the learner: ILIAS's SCORM 1.2 player puts the SCO in a frame of
 * its frameset and its SCORM 2004 player in an iframe; returns that frame once the SCO is in it.
 */
export async function launch(page: Page, { refId }: Module): Promise<Frame> {
  await page.goto(`${ILIAS_URL}/ilias.php?baseClass=ilSAHSPresentationGUI&ref_id=${refId}`);
  let sco: Frame | undefined;
  await expect
    .poll(() => (sco = page.frames().find((frame) => LAUNCH.test(frame.url()))), {
      timeout: 60_000,
    })
    .toBeTruthy();
  if (!sco) throw new Error("ILIAS's player has no SCO frame");
  await sco.waitForLoadState("domcontentloaded");
  return sco;
}

/**
 * Leaves the player for the learner's dashboard, as a learner who goes elsewhere in ILIAS does: the
 * player's window unloads and ILIAS sends what the SCO reported as a beacon.
 */
export async function leave(page: Page): Promise<void> {
  await page.goto(`${ILIAS_URL}/ilias.php?baseClass=ilDashboardGUI`, {
    waitUntil: "domcontentloaded",
  });
}

/**
 * The learner's tracks once ILIAS has stored the visit that just ended: they differ from `before`
 * and have stopped changing. The SCO's last calls go out while its frame unloads, so they can land
 * a moment later.
 */
export async function trackedVisit(module: Module, before?: Tracks): Promise<Tracks> {
  const text = (value: Tracks | undefined) => JSON.stringify(value ?? null);
  let latest = tracks(module);
  let previous = "";
  await expect
    .poll(
      () => {
        previous = text(latest);
        latest = tracks(module);
        return text(latest) !== text(before) && text(latest) === previous;
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toBe(true);
  return latest;
}
