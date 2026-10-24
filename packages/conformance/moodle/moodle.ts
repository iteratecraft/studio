// The Moodle that up.ts starts (M1-21), for the tests: its commands through `docker compose exec`
// (cli.php) and its pages through Playwright.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, type Frame, type Page } from "@playwright/test";

/** Where Moodle answers; the same address as its wwwroot (compose.yaml). */
export const MOODLE_URL = `http://localhost:${process.env.MOODLE_PORT ?? "8250"}`;

/** Runs a cli.php command in the web server container and returns the JSON it prints. */
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
      "webserver",
      "php",
      "/harness/cli.php",
      ...args,
    ],
    { encoding: "utf8", ...(input && { input }) },
  );
  // The JSON is the last line; anything before it is Moodle talking on the command line.
  return JSON.parse(output.trim().split("\n").at(-1) ?? "");
}

export interface Activity {
  cmid: number;
  scormid: number;
}

/** Uploads a SCORM package as an activity in a new course with the learner enrolled. */
export const upload = (zip: Uint8Array, name: string): Activity => cli(["upload", name], zip);

export interface Tracks {
  /** How many attempts Moodle has for the learner. */
  attempts: number;
  /** The learner's last attempt as Moodle keeps it, by data model element, such as `cmi.core.lesson_status`. */
  elements: Record<string, string>;
}

/** What Moodle recorded for the learner in the activity's SCORM tables. */
export const tracks = (scormid: number): Tracks => cli(["tracks", String(scormid)]);

/** Logs the learner in (cli.php creates the account). */
export async function logIn(page: Page): Promise<void> {
  await page.goto(`${MOODLE_URL}/login/index.php`);
  await page.locator("#username").fill("learner");
  await page.locator("#password").fill("Learner-pass-1");
  await page.locator("#loginbtn").click();
  await expect(page).not.toHaveURL(/\/login\//);
}

/**
 * Opens the activity as the learner. Moodle goes straight to its player, which loads the SCO in a
 * frame below the page that holds the SCORM 1.2 API; returns that frame once the SCO is in it.
 */
export async function launch(page: Page, { cmid }: Activity): Promise<Frame> {
  await page.goto(`${MOODLE_URL}/mod/scorm/view.php?id=${cmid}`);
  const frame = await (await page.waitForSelector("#scorm_object")).contentFrame();
  if (!frame) throw new Error("Moodle's player has no SCO frame");
  await frame.waitForURL(/\/mod_scorm\/content\//);
  return frame;
}

/** Leaves with the player's exit button: Moodle opens the course page and the SCO's frame unloads. */
export async function exitActivity(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Exit activity" }).click();
  await page.waitForURL(/\/course\/view\.php/);
}

/**
 * The learner's tracks once Moodle has stored the visit that just ended. The SCO's last calls go out
 * while its frame unloads (Moodle sends them as a beacon), so they can land a moment later; the
 * finish adds the session to the total time, which tells that they have.
 */
export async function trackedVisit(activity: Activity, before?: Tracks): Promise<Tracks> {
  const totalTime = (tracks: Tracks | undefined) => tracks?.elements["cmi.core.total_time"];
  let latest = tracks(activity.scormid);
  await expect
    .poll(
      () => {
        latest = tracks(activity.scormid);
        return totalTime(latest);
      },
      { timeout: 20_000 },
    )
    .not.toBe(totalTime(before));
  return latest;
}
