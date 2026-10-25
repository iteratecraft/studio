// The blocks editor's shell and dashboard in Chromium against the in-memory host (M2-08, BLK-01):
// every journey by pointer and by keyboard, and axe on every screen in both themes. The tests
// answer the file dialogs and read the in-memory disk through `window.editorTest` (src/editor.tsx).
import { writeZip } from "@course-suite/zip";
import { expect, test } from "@playwright/test";
import { violations } from "./axe.ts";
import {
  back,
  button,
  bytesOf,
  card,
  courseIn,
  create,
  files,
  heading,
  idsIn,
  launch,
  retitle,
  status,
  unzip,
} from "./helpers.ts";

test.describe("dashboard and course files", () => {
  test("BLK-01, blocks-editor H6: first launch shows an empty dashboard with the app name and version", async ({
    page,
  }) => {
    await launch(page);
    await expect(page).toHaveTitle("Course Suite");
    await expect(page.getByRole("banner")).toHaveText("Course Suite");
    await expect(page.getByRole("heading", { name: "No courses yet" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toHaveText("Version 0.0.0");
    await expect(page.getByRole("tab", { name: "Courses", selected: true })).toBeVisible();
  });

  test("blocks-editor W1, UI-BLOCKS-EDITOR-R13: a blank course gets a title, a file and opens empty in the editor", async ({
    page,
  }) => {
    await launch(page);
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "Blank course" }).click();
    const dialog = page.getByRole("dialog", { name: "New course" });
    const title = dialog.getByRole("textbox", { name: "Title" });
    await expect(title).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
    // Up to 100 characters.
    await title.fill("x".repeat(120));
    await expect(title).toHaveValue("x".repeat(100));
    await title.fill("Workshop safety: the basics");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(heading(page, "Workshop safety: the basics")).toBeVisible();
    await expect(status(page)).toHaveText("Saved");
    await expect(page).toHaveTitle("Workshop safety: the basics – Course Suite");
    // The suggested file name leaves out what Windows forbids (D-33).
    expect(await files(page)).toEqual(["Workshop safety- the basics.crs"]);
    const course = await courseIn(page, "Workshop safety- the basics.crs");
    expect(course).toMatchObject({
      title: "Workshop safety: the basics",
      kind: "course",
      entries: [],
    });
    await expect(page.getByRole("heading", { name: "Outline" })).toBeVisible();
    await back(page);
    await expect(card(page, "Workshop safety: the basics")).toContainText("Course · 0 lessons");
  });

  test("blocks-editor W2: a blank microlearning by keyboard alone has its one lesson", async ({
    page,
  }) => {
    await launch(page);
    await button(page, "New").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Blank course" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("Five-minute check");
    await page.keyboard.press("Enter");
    await expect(heading(page, "Five-minute check")).toBeVisible();
    expect((await courseIn(page, "Five-minute check.crs")).entries).toHaveLength(1);
    // Focus starts at the new screen's heading; the way back is just before it.
    await expect(heading(page, "Five-minute check")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(button(page, "Back to your courses")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(heading(page, "Your courses")).toBeFocused();
    await expect(card(page, "Five-minute check")).toContainText("Microlearning · 1 lesson");
  });

  test("a course file is opened through the open dialog, and cancelling the dialogs changes nothing", async ({
    page,
  }) => {
    await launch(page);
    await page.evaluate(() => {
      window.editorTest.save = null;
    });
    await button(page, "New").click();
    await page.getByRole("menuitem", { name: "Blank course" }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("Never saved");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(heading(page, "Your courses")).toBeVisible();
    expect(await files(page)).toEqual([]);

    await page.evaluate(() => {
      window.editorTest.save = undefined;
    });
    await create(page, "Ladders");
    await back(page);
    // Forget it, as on another computer, then open it from its file.
    await card(page, "Ladders").getByRole("button", { name: "Actions for Ladders" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("tab", { name: "Deleted" }).click();
    await card(page, "Ladders").getByRole("button", { name: "Actions for Ladders" }).click();
    await page.getByRole("menuitem", { name: "Remove from list" }).click();
    await page.getByRole("tab", { name: "Courses" }).click();
    await expect(page.getByRole("heading", { name: "No courses yet" })).toBeVisible();
    await button(page, "Open a course file").click();
    await expect(heading(page, "Your courses")).toBeVisible();
    await page.evaluate(() => {
      window.editorTest.open = ["Ladders.crs"];
    });
    await button(page, "Open a course file").click();
    await expect(heading(page, "Ladders")).toBeVisible();
    await back(page);
    await expect(card(page, "Ladders")).toBeVisible();
  });

  test("BLK-01: a file written by a newer version is refused with a clear message and left unchanged", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "From the future");
    await back(page);
    const zip = await unzip(page, "From the future.crs");
    const entries = await Promise.all(
      zip.names.map(async (name) => {
        const data = (await zip.read(name)) ?? new Uint8Array();
        if (name !== "project.json") return { name, data };
        const manifest = JSON.parse(new TextDecoder().decode(data));
        return {
          name,
          data: new TextEncoder().encode(JSON.stringify({ ...manifest, formatVersion: 99 })),
        };
      }),
    );
    const newer = await writeZip(entries);
    await page.evaluate(
      ([id, bytes]) =>
        window.editorTest.host.disk.set(id as string, new Uint8Array(bytes as number[])),
      ["From the future.crs", Array.from(newer)] as const,
    );
    await card(page, "From the future").click();
    const dialog = page.getByRole("alertdialog", { name: "The course could not be opened" });
    await expect(dialog).toContainText("was made by a newer version of this app");
    await dialog.getByText("Details").click();
    await expect(dialog).toContainText("project format 99");
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(heading(page, "Your courses")).toBeVisible();
    expect(await bytesOf(page, "From the future.crs")).toEqual(newer);
  });

  test("a course whose file is gone shows as not found and can be removed from the list", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Moved away");
    await back(page);
    await page.evaluate(() => {
      window.editorTest.host.disk.delete("Moved away.crs");
      window.editorTest.restart();
    });
    await expect(card(page, "Moved away")).toContainText("File not found");
    await card(page, "Moved away").click();
    await expect(heading(page, "Your courses")).toBeVisible();
    await card(page, "Moved away").getByRole("button", { name: "Actions for Moved away" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Remove from list"]);
    await page.getByRole("menuitem", { name: "Remove from list" }).click();
    await expect(page.getByRole("heading", { name: "No courses yet" })).toBeVisible();
  });

  test("blocks-publish-collab W10, BLK-01: duplicate asks for a name and makes a copy that shares no ids", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Forklift basics");
    await back(page);
    await card(page, "Forklift basics")
      .getByRole("button", { name: "Actions for Forklift basics" })
      .click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    const dialog = page.getByRole("dialog", { name: "Duplicate course" });
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Copy of Forklift basics",
    );
    await dialog.getByRole("button", { name: "Duplicate" }).click();
    // The copy is the newest change, so it comes first.
    await expect(page.getByRole("row").first()).toContainText("Copy of Forklift basics");
    const source = await idsIn(page, "Forklift basics.crs");
    const copy = await idsIn(page, "Copy of Forklift basics.crs");
    expect(copy.filter((id) => source.includes(id))).toEqual([]);
    expect((await courseIn(page, "Copy of Forklift basics.crs")).title).toBe(
      "Copy of Forklift basics",
    );
  });

  test("rename changes the course title inside its file", async ({ page }) => {
    await launch(page);
    await create(page, "Draft title");
    await back(page);
    await card(page, "Draft title")
      .getByRole("button", { name: "Actions for Draft title" })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename course" });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Final title");
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(card(page, "Final title")).toBeVisible();
    expect((await courseIn(page, "Draft title.crs")).title).toBe("Final title");
    await card(page, "Final title").click();
    await expect(heading(page, "Final title")).toBeVisible();
  });

  test("UI-BLOCKS-EDITOR-R5, blocks-editor W24: delete moves a course to Deleted, with undo, restore and empty", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Old induction");
    await back(page);
    const actions = () =>
      card(page, "Old induction").getByRole("button", { name: "Actions for Old induction" });
    await actions().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const toast = page.getByRole("alertdialog", { name: "Moved to Deleted: Old induction" });
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(card(page, "Old induction")).toBeVisible();

    await actions().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "No courses yet" })).toBeVisible();
    await page.getByRole("tab", { name: "Deleted" }).click();
    await expect(page.getByText("Their files stay on your computer.")).toBeVisible();
    await actions().click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await page.getByRole("tab", { name: "Courses" }).click();
    await expect(card(page, "Old induction")).toBeVisible();

    await actions().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("tab", { name: "Deleted" }).click();
    await button(page, "Empty Deleted").click();
    const confirm = page.getByRole("alertdialog", { name: "Empty Deleted" });
    await confirm.getByRole("button", { name: "Empty Deleted" }).click();
    await expect(page.getByRole("heading", { name: "Nothing deleted" })).toBeVisible();
    // The file itself stays.
    expect(await files(page)).toEqual(["Old induction.crs"]);
  });

  test("UI-BLOCKS-EDITOR-R2, blocks-editor 2.1: search by title, type filter, a remembered sort, grid or list", async ({
    page,
  }) => {
    await launch(page);
    for (const [title, kind] of [
      ["Bravo hazards", "course"],
      ["Alpha ladders", "microlearning"],
      ["Charlie cranes", "course"],
    ] as const) {
      await create(page, title, kind);
      await back(page);
    }
    const titles = () => page.locator(".be-card-title").allTextContents();
    // Last updated first, by default.
    expect(await titles()).toEqual(["Charlie cranes", "Alpha ladders", "Bravo hazards"]);
    await page.getByRole("searchbox", { name: "Search by title" }).fill("LADD");
    expect(await titles()).toEqual(["Alpha ladders"]);
    await page.getByRole("searchbox", { name: "Search by title" }).fill("zzz");
    await expect(page.getByRole("heading", { name: "No courses match" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: /Type/ }).click();
    await page.getByRole("option", { name: "Course" }).click();
    expect(await titles()).toEqual(["Charlie cranes", "Bravo hazards"]);
    await page.getByRole("button", { name: /Type/ }).click();
    await page.getByRole("option", { name: "All types" }).click();
    await page.getByRole("button", { name: /Sort by/ }).click();
    await page.getByRole("option", { name: "Title A–Z" }).click();
    expect(await titles()).toEqual(["Alpha ladders", "Bravo hazards", "Charlie cranes"]);
    await page.getByRole("radio", { name: "List" }).click();
    await expect(page.getByRole("grid", { name: "Courses" })).toHaveAttribute(
      "data-layout",
      "stack",
    );

    // The sort and the view stay after a restart.
    await page.evaluate(() => window.editorTest.restart());
    await expect(page.getByRole("button", { name: /Sort by/ })).toContainText("Title A–Z");
    await expect(page.getByRole("grid", { name: "Courses" })).toHaveAttribute(
      "data-layout",
      "stack",
    );
    expect(await titles()).toEqual(["Alpha ladders", "Bravo hazards", "Charlie cranes"]);
  });

  test("keyboard only: a card's actions, rename, open the course and go back", async ({ page }) => {
    await launch(page);
    await create(page, "Hand tools");
    await back(page);
    const row = card(page, "Hand tools");
    await row.focus();
    await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: "Actions for Hand tools" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Power tools");
    await page.keyboard.press("Enter");
    await expect(card(page, "Power tools")).toBeVisible();
    await card(page, "Power tools").focus();
    await page.keyboard.press("Enter");
    await expect(heading(page, "Power tools")).toBeVisible();
  });
});

test.describe("course editor", () => {
  test("UI-BLOCKS-EDITOR-R14, blocks-editor W25: undo and redo start disabled, follow edits and work from the keyboard", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "First title");
    const undo = button(page, "Undo");
    const redo = button(page, "Redo");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await retitle(page, "Second title");
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();
    await undo.click();
    await expect(heading(page, "First title")).toBeVisible();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(heading(page, "Second title")).toBeVisible();
    // Outside a text field: Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo.
    await heading(page, "Second title").click();
    await page.keyboard.press("Control+Z");
    await expect(heading(page, "First title")).toBeVisible();
    await page.keyboard.press("Control+Y");
    await expect(heading(page, "Second title")).toBeVisible();
    await page.keyboard.press("Control+Z");
    await page.keyboard.press("Control+Shift+Z");
    await expect(heading(page, "Second title")).toBeVisible();
  });

  test("BLK-01: edits autosave for recovery and the title bar shows the save state until Ctrl+S saves", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Gas cylinders");
    await retitle(page, "Gas cylinder storage");
    await expect(status(page)).toHaveText("Unsaved changes");
    await expect(page).toHaveTitle("*Gas cylinder storage – Course Suite");
    // The autosave comes a few seconds after the edit, next to the file (D-33).
    await expect
      .poll(() => files(page), { timeout: 10_000 })
      .toEqual([".Gas cylinders.crs.autosave/2.crs", "Gas cylinders.crs"]);
    expect((await courseIn(page, "Gas cylinders.crs")).title).toBe("Gas cylinders");
    await page.keyboard.press("Control+S");
    await expect(status(page)).toHaveText("Saved");
    await expect(page).toHaveTitle("Gas cylinder storage – Course Suite");
    expect(await files(page)).toEqual(["Gas cylinders.crs"]);
    expect((await courseIn(page, "Gas cylinders.crs")).title).toBe("Gas cylinder storage");
    // The save button does the same.
    await retitle(page, "Gas cylinders at work");
    await button(page, "Save").click();
    await expect(status(page)).toHaveText("Saved");
    expect((await courseIn(page, "Gas cylinders.crs")).title).toBe("Gas cylinders at work");
  });

  test("BLK-01: after a crash, opening the course offers the autosaved work, or the saved file", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Scaffolds");
    await retitle(page, "Scaffolds, revised");
    await expect
      .poll(() => files(page), { timeout: 10_000 })
      .toContain(".Scaffolds.crs.autosave/2.crs");
    // The app dies without asking anything.
    await page.evaluate(() => window.editorTest.restart());
    await expect(card(page, "Scaffolds")).toBeVisible();

    await card(page, "Scaffolds").click();
    const offer = page.getByRole("alertdialog", { name: "Recover unsaved changes?" });
    await expect(offer).toContainText("Scaffolds.crs was not closed properly last time.");
    await offer.getByRole("button", { name: "Recover changes" }).click();
    await expect(heading(page, "Scaffolds, revised")).toBeVisible();
    await expect(status(page)).toHaveText("Unsaved changes");

    // The list shows the work last opened.
    await page.evaluate(() => window.editorTest.restart());
    await card(page, "Scaffolds, revised").click();
    await offer.getByRole("button", { name: "Open the saved file" }).click();
    await expect(heading(page, "Scaffolds")).toBeVisible();
    await expect(status(page)).toHaveText("Saved");
    expect(await files(page)).toEqual(["Scaffolds.crs"]);
  });

  test("unsaved changes are guarded when leaving the course and when closing the window", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Ear protection");
    await retitle(page, "Hearing protection");
    await button(page, "Back to your courses").click();
    const guard = page.getByRole("alertdialog", { name: "Save changes to Hearing protection?" });
    await expect(guard.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await guard.getByRole("button", { name: "Cancel" }).click();
    await expect(heading(page, "Hearing protection")).toBeVisible();

    await button(page, "Back to your courses").click();
    await guard.getByRole("button", { name: "Don't save" }).click();
    await expect(card(page, "Ear protection")).toBeVisible();
    expect(await files(page)).toEqual(["Ear protection.crs"]);

    // Closing the window: Escape keeps it open, Save writes the file and lets it close.
    await card(page, "Ear protection").click();
    await retitle(page, "Hearing protection");
    const closing = page.evaluate(() => window.editorTest.host.requestClose());
    await expect(guard).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await closing).toBe(false);
    const closed = page.evaluate(() => window.editorTest.host.requestClose());
    await guard.getByRole("button", { name: "Save", exact: true }).click();
    expect(await closed).toBe(true);
    expect((await courseIn(page, "Ear protection.crs")).title).toBe("Hearing protection");
    // Nothing unsaved: the window closes without a question.
    expect(await page.evaluate(() => window.editorTest.host.requestClose())).toBe(true);
  });

  test("blocks-editor C1: settings entry points of later waves are shown but disabled", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Entry points");
    const tools = page.getByRole("toolbar", { name: "Course tools" });
    for (const name of ["Theme", "Preview", "Publish"]) {
      await expect(tools.getByRole("button", { name })).toBeDisabled();
    }
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on any screen in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);
    await launch(page, `?theme=${theme}`);
    await check("empty dashboard");
    await button(page, "New").click();
    await check("new menu");
    await page.getByRole("menuitem", { name: "Blank course" }).click();
    await check("new course dialog");
    await page.getByRole("textbox", { name: "Title" }).fill("Axe course");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(heading(page, "Axe course")).toBeVisible();
    await check("editor");
    await retitle(page, "Axe course, edited");
    await button(page, "Back to your courses").click();
    await check("unsaved changes dialog");
    await page.getByRole("alertdialog").getByRole("button", { name: "Save", exact: true }).click();
    await expect(heading(page, "Your courses")).toBeVisible();
    await check("dashboard with a course, grid");
    await page.getByRole("radio", { name: "List" }).click();
    await check("dashboard with a course, list");
    await card(page, "Axe course, edited")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await check("card actions menu");
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await check("duplicate dialog");
    await page.keyboard.press("Escape");
    await card(page, "Axe course, edited")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await check("deleted toast");
    await page.getByRole("tab", { name: "Deleted" }).click();
    await check("deleted list");
    await card(page, "Axe course, edited")
      .getByRole("button", { name: /Actions for/ })
      .click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await page.getByRole("tab", { name: "Courses" }).click();

    await card(page, "Axe course, edited").click();
    await retitle(page, "Axe course, crashed");
    await expect
      .poll(() => files(page), { timeout: 10_000 })
      .toContain(".Axe course.crs.autosave/3.crs");
    await page.evaluate(() => window.editorTest.restart());
    await card(page, "Axe course, edited").click();
    await check("recovery dialog");
    await page.getByRole("button", { name: "Open the saved file" }).click();
    await back(page);
    await page.evaluate(() => {
      window.editorTest.host.disk.set("Axe course.crs", new Uint8Array([1, 2, 3]));
    });
    await card(page, "Axe course, edited").click();
    await page.getByText("Details").click();
    await check("open error dialog");
  });
}
