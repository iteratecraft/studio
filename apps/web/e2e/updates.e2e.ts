// Updates of the desktop app (M2-20; M0-09, D-29, ADR-0004; teams-collab.md 3R R12, R13) in
// Chromium against the in-memory host with a stand-in updater (`?updates`, src/editor.tsx): the
// check at start (on by default, at most once a day, never offline or turned off), Help > Check for
// updates, the offer, download with progress and cancel, saving or asking about open work before
// the restart, the settings switch, and every failure in plain words, by keyboard and by pointer,
// with axe on every new dialog in both themes. The real updater, its signature check and the
// installer are proven by apps/desktop/e2e/update.e2e.ts.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import { button, courseIn, create, heading, launch, retitle } from "./helpers.ts";

const calls = (page: Page) => page.evaluate(() => window.editorTest.updates.calls);
const menu = (page: Page) => page.evaluate(() => window.editorTest.updates.menu());
const restart = async (page: Page) => {
  await page.evaluate(() => window.editorTest.restart());
  await expect(heading(page, "Your courses")).toBeVisible();
};
const offer = (page: Page) =>
  page.getByRole("alertdialog", { name: "Course Suite 9.9.10 is available" });
const notice = (page: Page, name: string) => page.getByRole("alertdialog", { name });
/** Presses Tab until `target` has the focus, at most 20 times. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((element) => element === element.ownerDocument.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
const found = (page: Page) =>
  page.evaluate(() => {
    window.editorTest.updates.answer = { version: "9.9.10", notes: "Faster preview." };
  });

test.describe("M2-20 updates of the desktop app", () => {
  test("[teams-collab:3R] R13, M2-20: on by default, the app checks at start and offers what it found with its notes; Not now downloads nothing and leaves the app as it was", async ({
    page,
  }) => {
    await launch(page, "?updates=found");
    await expect(offer(page)).toContainText(
      "You have version 0.0.0. Installing takes about a minute, then Course Suite starts again. Your courses stay where they are.",
    );
    await expect(offer(page).getByRole("region", { name: "What changed" })).toHaveText(
      "Faster preview.\nClearer error messages.",
    );
    await offer(page).getByRole("button", { name: "Not now" }).click();
    await expect(offer(page)).toHaveCount(0);
    expect(await calls(page)).toEqual(["check"]);
    await expect(heading(page, "Your courses")).toBeVisible();
  });

  test("[teams-collab:3R] R12, M2-20: the start check runs at most once a day; Help > Check for updates checks at once and says when there is nothing new", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    // Started again the same day: no check at start. Help > Check for updates still checks.
    await restart(page);
    await menu(page);
    await expect(notice(page, "Updates")).toContainText(
      "You have the latest version of Course Suite, 0.0.0.",
    );
    expect(await calls(page)).toEqual(["check", "check"]);
    await notice(page, "Updates").getByRole("button", { name: "OK" }).click();
    // A day after the last check, the start checks again.
    await page.evaluate(() =>
      window.editorTest.host.storage.set("updates.lastCheck", String(Date.now() - 86_400_001)),
    );
    await restart(page);
    await expect.poll(() => calls(page)).toEqual(["check", "check", "check"]);
  });

  test("[teams-collab:3R] R12, ADR-0004: offline, nothing is checked, at start or from the menu, which says so", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    await page.evaluate(() =>
      window.editorTest.host.storage.set("updates.lastCheck", String(Date.now() - 86_400_001)),
    );
    await page.context().setOffline(true);
    await restart(page);
    await menu(page);
    await expect(notice(page, "Updates")).toContainText(
      "You are offline. Connect to the internet, then check again.",
    );
    expect(await calls(page)).toEqual(["check"]);
    await page.context().setOffline(false);
  });

  test("[teams-collab:3R] R12, M2-20: by keyboard alone, settings turn automatic checks off, which holds after a restart; Check now still checks", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    // Focus starts at the page heading; the settings button is before it, in the top bar.
    await page.keyboard.press("Shift+Tab");
    await expect(button(page, "Settings")).toBeFocused();
    await page.keyboard.press("Enter");
    const settings = page.getByRole("dialog", { name: "Settings" });
    const auto = settings.getByRole("switch", { name: "Check for updates automatically" });
    await expect(auto).toBeChecked();
    await expect(auto).toHaveAccessibleDescription(
      "Once a day when the app starts, and only while you are online. Nothing is downloaded or installed until you agree.",
    );
    await expect(settings).toContainText("You have version 0.0.0.");
    await tabTo(page, auto);
    await page.keyboard.press("Space");
    await expect(auto).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    // A day later, the start does not check: it is turned off.
    await page.evaluate(() =>
      window.editorTest.host.storage.set("updates.lastCheck", String(Date.now() - 86_400_001)),
    );
    await restart(page);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(auto).not.toBeChecked();
    await tabTo(page, settings.getByRole("button", { name: "Check now" }));
    await page.keyboard.press("Enter");
    await expect(notice(page, "Updates")).toContainText("You have the latest version");
    expect(await calls(page)).toEqual(["check", "check"]);
  });

  test("[teams-collab:3R] R13, M2-20: by keyboard alone, Install and restart downloads with progress, asks about unsaved work, saves it, then installs", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    await create(page, "Ladder safety");
    await retitle(page, "Ladder safety, revised");
    await expect(page).toHaveTitle("*Ladder safety, revised – Course Suite");

    await found(page);
    await menu(page);
    // The offer's primary button has the focus.
    await expect(offer(page).getByRole("button", { name: "Install and restart" })).toBeFocused();
    await page.keyboard.press("Enter");
    const download = page.getByRole("dialog", { name: "Downloading Course Suite 9.9.10" });
    await expect(download.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuetext",
      "6 MB of 12 MB",
    );
    await page.evaluate(() => window.editorTest.updates.finish());
    // Unsaved work: the same question as closing the course, Save first.
    const unsaved = notice(page, "Save changes to Ladder safety, revised?");
    await expect(unsaved.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Installing Course Suite 9.9.10" }),
    ).toBeVisible();
    expect(await calls(page)).toEqual(["check", "check", "download", "install"]);
    expect((await courseIn(page, "Ladder safety.crs")).title).toBe("Ladder safety, revised");
  });

  test("M2-20: a download can be cancelled, and Cancel on the unsaved-work question keeps the course open; neither installs anything", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    await create(page, "Forklift basics");
    await retitle(page, "Forklift basics, draft");
    await found(page);

    await menu(page);
    await offer(page).getByRole("button", { name: "Install and restart" }).click();
    const download = page.getByRole("dialog", { name: "Downloading Course Suite 9.9.10" });
    await download.getByRole("button", { name: "Cancel" }).click();
    await expect(download).toHaveCount(0);
    await expect(heading(page, "Forklift basics, draft")).toBeVisible();

    await menu(page);
    await offer(page).getByRole("button", { name: "Install and restart" }).click();
    await page.evaluate(() => window.editorTest.updates.finish());
    await notice(page, "Save changes to Forklift basics, draft?")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(notice(page, "The update was not installed")).toContainText(
      "Your course was not closed, so the app did not restart.",
    );
    await notice(page, "The update was not installed").getByRole("button", { name: "OK" }).click();
    await expect(heading(page, "Forklift basics, draft")).toBeVisible();
    await expect(page).toHaveTitle("*Forklift basics, draft – Course Suite");
    expect(await calls(page)).toEqual(["check", "check", "download", "check", "download"]);
  });

  test("M2-20, ADR-0004: failures say why in plain words and the app keeps working: no network, unreadable information, a bad signature", async ({
    page,
  }) => {
    await launch(page, "?updates");
    await expect.poll(() => calls(page)).toEqual(["check"]);
    const failed = notice(page, "Could not check for updates");
    for (const [reason, text] of [
      [
        "network",
        "The release site could not be reached. Check your internet connection and try again later.",
      ],
      ["invalid", "The release site's update information could not be read. Try again later."],
    ] as const) {
      await page.evaluate((reason) => {
        window.editorTest.updates.answer = reason;
      }, reason);
      await menu(page);
      await expect(failed).toHaveText(new RegExp(text.replace(/[.?']/g, "\\$&")));
      await failed.getByRole("button", { name: "OK" }).click();
    }

    // A download whose signature does not match is never installed.
    await found(page);
    await page.evaluate(() => {
      window.editorTest.updates.downloadFails = "signature";
    });
    await menu(page);
    await offer(page).getByRole("button", { name: "Install and restart" }).click();
    await page.evaluate(() => window.editorTest.updates.finish());
    const refused = notice(page, "The update was not installed");
    await expect(refused).toContainText(
      "The download does not carry a valid signature of Course Suite, so it was not installed.",
    );
    await expect(refused).toContainText("Your current version keeps working.");
    await refused.getByRole("button", { name: "OK" }).click();
    expect(await calls(page)).not.toContain("install");
    await expect(heading(page, "Your courses")).toBeVisible();
  });

  test("M2-20: a build without an update key checks nothing and says so, in settings and from the menu", async ({
    page,
  }) => {
    await launch(page, "?updates=unavailable");
    await button(page, "Settings").click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const auto = settings.getByRole("switch", { name: "Check for updates automatically" });
    await expect(auto).toBeDisabled();
    await expect(auto).not.toBeChecked();
    await expect(auto).toHaveAccessibleDescription(
      "This build cannot update itself. New versions are on the project's releases page.",
    );
    await expect(settings.getByRole("button", { name: "Check now" })).toBeDisabled();
    await settings.getByRole("button", { name: "Done" }).click();
    await menu(page);
    await expect(notice(page, "Updates")).toContainText(
      "This build of Course Suite has no update key, so it cannot check for updates or update itself.",
    );
    expect(await calls(page)).toEqual([]);
  });

  test("M2-20: a host that cannot update the app (the browser) shows no settings and checks nothing", async ({
    page,
  }) => {
    await launch(page);
    await expect(button(page, "Settings")).toHaveCount(0);
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY, M2-20: no axe violation in the settings and update dialogs in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);
    await launch(page, `?theme=${theme}&updates=found`);
    await expect(offer(page)).toBeVisible();
    await check("update offer with its notes");
    await offer(page).getByRole("button", { name: "Install and restart" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "6 MB of 12 MB");
    await check("download progress");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await button(page, "Settings").click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await check("settings");
    await page.getByText("Check for updates automatically").click();
    await expect(page.getByRole("switch")).not.toBeChecked();
    await check("settings with automatic checks off");
    await page.getByRole("button", { name: "Done" }).click();
    await page.evaluate(() => {
      window.editorTest.updates.answer = "network";
    });
    await menu(page);
    await expect(notice(page, "Could not check for updates")).toBeVisible();
    await check("failure notice");
  });
}
