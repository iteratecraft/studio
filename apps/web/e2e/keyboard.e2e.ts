// Keyboard journeys through every component of the kit gallery (M2-05, ENG-12): focus order,
// arrow keys, Home and End, Escape and typeahead where the WAI-ARIA pattern of the component has
// them. Overlays must give focus back to the control that opened them.
import { expect, type Locator, type Page, test } from "@playwright/test";

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "UI kit" })).toBeVisible();
});

/** Presses `key` and expects focus on `target`. */
async function press(page: Page, key: string, target: Locator): Promise<void> {
  await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

test("Tab walks the page in reading order, one stop per composite control", async ({ page }) => {
  const buttons = region(page, "Buttons");
  // .first(): the text button; the icon button after it is also called Delete.
  const button = (name: string) => buttons.getByRole("button", { name, exact: true }).first();
  await button("Publish").focus();
  // The disabled button is skipped.
  for (const name of ["Preview", "Cancel", "Delete", "Add a lesson", "Rename"]) {
    await press(page, "Tab", button(name));
  }
  await press(page, "Tab", buttons.getByRole("button", { name: "Delete" }).last());
  await press(page, "Tab", page.getByRole("button", { name: "Undo" }));
  // The toolbar is one stop.
  await press(page, "Tab", page.getByRole("textbox", { name: "Course title" }));
  await press(page, "Tab", page.getByRole("textbox", { name: "Lesson title" }));
  await press(page, "Tab", page.getByRole("textbox", { name: "Description" }));
  // The search field's clear button is not a stop; a group of toggle buttons is one stop, on the
  // one that is on.
  await press(page, "Tab", page.getByRole("searchbox", { name: "Search by title" }));
  // Formatted text: its tools show once it has focus, before it, so Tab goes into the text.
  await press(page, "Tab", page.getByRole("textbox", { name: "Lesson summary" }));
  await press(page, "Tab", page.getByRole("slider", { name: "Top padding" }));
  await press(page, "Tab", page.getByRole("spinbutton", { name: "Top padding (pixels)" }));
  await press(page, "Tab", page.getByRole("radio", { name: "Computer" }));
  await press(page, "Tab", page.getByRole("checkbox", { name: "Show lesson numbers" }));
  await press(page, "Tab", page.getByRole("checkbox", { name: "Some lessons are required" }));
  // The disabled switch is skipped.
  await press(page, "Tab", page.getByRole("switch", { name: "Autosave" }));
  await press(page, "Tab", page.getByRole("button", { name: /Block width/ }));
  await press(page, "Tab", page.getByRole("button", { name: "Lesson actions" }));
  await press(page, "Tab", page.getByRole("tab", { name: "Content" }));
  await press(page, "Tab", page.getByRole("tabpanel", { name: "Content" }));
  await press(page, "Tab", page.getByRole("button", { name: "Rename lesson" }));
  await press(page, "Tab", page.getByRole("button", { name: "Lesson details" }));
  await press(page, "Tab", page.getByRole("button", { name: "Delete a lesson" }));
  await press(page, "Tab", page.getByRole("button", { name: "Show a notice" }));
  // A list box is one stop, on its selected option.
  await press(page, "Tab", page.getByRole("option", { name: "English" }));
  await press(page, "Tab", page.getByRole("grid", { name: "Lessons" }).getByRole("row").first());
  await press(page, "Tab", page.getByRole("row", { name: "Basics" }));
  await press(page, "Tab", page.getByRole("separator", { name: "Resize the outline" }));
  await press(page, "Tab", page.getByRole("button", { name: "Add a lesson" }).last());
  // Progress bars and icons are not stops; Tab leaves the page.
  await page.keyboard.press("Tab");
  await expect(page.locator("main :focus")).toHaveCount(0);
});

test("search field: Escape clears the search", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search by title" });
  await search.focus();
  await expect(search).toHaveValue("Safety");
  await press(page, "Escape", search);
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear search" })).toBeHidden();
});

test("toggle buttons: arrow keys move along a group, Space turns one on", async ({ page }) => {
  const group = page.getByRole("radiogroup", { name: "Device" });
  await group.getByRole("radio", { name: "Computer" }).focus();
  await press(page, "ArrowRight", group.getByRole("radio", { name: "Tablet" }));
  await press(page, "ArrowRight", group.getByRole("radio", { name: "Phone" }));
  await expect(group.getByRole("radio", { name: "Computer" })).toBeChecked();
  await page.keyboard.press("Space");
  await expect(group.getByRole("radio", { name: "Phone" })).toBeChecked();
  await expect(group.getByRole("radio", { name: "Computer" })).not.toBeChecked();
  await press(page, "ArrowLeft", group.getByRole("radio", { name: "Tablet" }));
});

test("buttons: an icon button shows its name as a tooltip on focus, Escape hides it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Delete", exact: true }).first().focus();
  await press(page, "Tab", page.getByRole("button", { name: "Add a lesson" }).first());
  await expect(page.getByRole("tooltip")).toHaveText("Add a lesson");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("toolbar: arrows move between its controls, Tab leaves and comes back", async ({ page }) => {
  const undo = page.getByRole("button", { name: "Undo" });
  const find = page.getByRole("button", { name: "Find" });
  await undo.focus();
  await press(page, "ArrowRight", page.getByRole("button", { name: "Redo" }));
  // The separator is not a stop.
  await press(page, "ArrowRight", page.getByRole("button", { name: "Add a block" }));
  await press(page, "ArrowRight", find);
  await press(page, "ArrowRight", find);
  await press(page, "Tab", page.getByRole("textbox", { name: "Course title" }));
  // Shift+Tab comes back to the last control used.
  await press(page, "Shift+Tab", find);
});

test("text fields: typing, and the error and help linked to the field", async ({ page }) => {
  const title = page.getByRole("textbox", { name: "Lesson title" });
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription("Give the lesson a title.");
  await expect(page.getByRole("textbox", { name: "Course title" })).toHaveAccessibleDescription(
    "Shown on the cover page.",
  );
  const description = page.getByRole("textbox", { name: "Description" });
  await description.focus();
  await page.keyboard.type("Line one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line two");
  await expect(description).toHaveValue("Line one\nLine two");
});

test("checkbox and switch: Space toggles them", async ({ page }) => {
  const numbers = page.getByRole("checkbox", { name: "Show lesson numbers" });
  const required = page.getByRole("checkbox", { name: "Some lessons are required" });
  const autosave = page.getByRole("switch", { name: "Autosave" });
  await numbers.focus();
  await page.keyboard.press("Space");
  await expect(numbers).not.toBeChecked();
  await press(page, "Tab", required);
  await page.keyboard.press("Space");
  await expect(required).toBeChecked();
  await press(page, "Tab", autosave);
  await page.keyboard.press("Space");
  await expect(autosave).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Sync with a server" })).toBeDisabled();
});

test("select: arrows open it, typeahead finds an option, Enter picks, Escape cancels", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: /Block width/ });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const listbox = page.getByRole("listbox", { name: "Block width" });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "Medium" })).toBeFocused();
  await page.keyboard.type("l");
  await expect(listbox.getByRole("option", { name: "Large" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Large");
  // Escape closes without a change and gives focus back.
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Large");
  // Typing on the closed select picks too.
  await page.keyboard.type("s");
  await expect(trigger).toContainText("Small");
});

test("menu: Enter opens on the first item, arrows and typeahead move, Escape returns focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "Lesson actions" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await press(page, "ArrowDown", menu.getByRole("menuitem", { name: "Copy to another course" }));
  await page.keyboard.type("ch");
  await expect(menu.getByRole("menuitem", { name: "Change icon" })).toBeFocused();
  // The separator is not a stop; End reaches the last item.
  await press(page, "ArrowDown", menu.getByRole("menuitem", { name: "Delete" }));
  await press(page, "Home", menu.getByRole("menuitem", { name: "Duplicate" }));
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Enter on an item runs it and closes the menu.
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("tabs: arrows choose a tab, Home and End jump, Tab moves into the panel", async ({ page }) => {
  const tab = (name: string) => page.getByRole("tab", { name });
  await tab("Content").focus();
  await press(page, "ArrowRight", tab("Format"));
  await expect(tab("Format")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Format" })).toHaveText(
    "Colours, spacing and width.",
  );
  await press(page, "End", tab("Labels"));
  await press(page, "ArrowRight", tab("Content"));
  await press(page, "ArrowLeft", tab("Labels"));
  await press(page, "Home", tab("Content"));
  await press(page, "Tab", page.getByRole("tabpanel", { name: "Content" }));
});

test("dialog: focus stays inside, Escape closes it and focus goes back", async ({ page }) => {
  const opener = page.getByRole("button", { name: "Rename lesson" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Rename lesson" });
  const field = dialog.getByRole("textbox", { name: "Lesson title" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Healthy soil");
  await press(page, "Tab", dialog.getByRole("button", { name: "Cancel" }));
  await press(page, "Tab", dialog.getByRole("button", { name: "Save" }));
  // Focus wraps round to the close button, never behind the dialog.
  await press(page, "Tab", dialog.getByRole("button", { name: "Close" }));
  await press(page, "Tab", field);
  await press(page, "Shift+Tab", dialog.getByRole("button", { name: "Close" }));
  // On the close button the first Escape hides its tooltip; from the field it closes the dialog.
  await press(page, "Tab", field);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  // A button in the dialog closes it too.
  await page.keyboard.press("Enter");
  await press(page, "Tab", dialog.getByRole("button", { name: "Cancel" }));
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("popover: Tab reaches its content, Escape closes it and focus goes back", async ({ page }) => {
  const opener = page.getByRole("button", { name: "Lesson details" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const popover = page.getByRole("dialog", { name: "Lesson details" });
  await expect(popover).toBeVisible();
  await press(page, "Tab", popover.getByRole("checkbox", { name: "Required for completion" }));
  await page.keyboard.press("Space");
  await expect(popover.getByRole("checkbox")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("toast: an undo notice after a delete is reached with F6, acts with Enter and times out (UI-BLOCKS-EDITOR-R12)", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();
  const opener = page.getByRole("button", { name: "Delete a lesson" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const deleted = page.getByRole("alertdialog", { name: /Lesson deleted/ });
  await expect(deleted).toBeVisible();
  // F6 jumps to the notifications landmark and back, without hunting for it with Tab.
  await page.keyboard.press("F6");
  await expect(page.getByRole("region", { name: /notification/ })).toBeFocused();
  await press(page, "Tab", deleted);
  await press(page, "Tab", deleted.getByRole("button", { name: "Undo" }));
  await press(page, "Tab", deleted.getByRole("button", { name: "Dismiss" }));
  await press(page, "Shift+Tab", deleted.getByRole("button", { name: "Undo" }));
  await page.keyboard.press("Enter");
  await expect(deleted).toHaveCount(0);
  // Focus is never lost: it moves to the next toast, and back to the page when none is left.
  const restored = page.getByRole("alertdialog", { name: /Lesson restored/ });
  await expect(restored).toBeFocused();
  await press(page, "Tab", restored.getByRole("button", { name: "Dismiss" }));
  await page.keyboard.press("Enter");
  await expect(restored).toHaveCount(0);
  await expect(opener).toBeFocused();
  // A toast closes by itself, but not while the pointer rests on it.
  await page.keyboard.press("Enter");
  await expect(deleted).toBeVisible();
  await deleted.hover();
  await page.clock.runFor(10_000);
  await expect(deleted).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(10_000);
  await expect(deleted).toHaveCount(0);
});

test("toast: the dismiss button closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Show a notice" }).click();
  const saved = page.getByRole("alertdialog", { name: /Saved/ });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("All changes are on disk.");
  await page.keyboard.press("F6");
  await press(page, "Tab", saved);
  await press(page, "Tab", saved.getByRole("button", { name: "Dismiss" }));
  await page.keyboard.press("Enter");
  await expect(saved).toHaveCount(0);
});

test("list box: arrows move, Space selects, typeahead finds an option", async ({ page }) => {
  const option = (name: string) => region(page, "List box").getByRole("option", { name });
  await option("English").focus();
  await press(page, "ArrowDown", option("Spanish"));
  await page.keyboard.press("Space");
  await expect(option("Spanish")).toHaveAttribute("aria-selected", "true");
  await expect(option("English")).toHaveAttribute("aria-selected", "false");
  await press(page, "End", option("Portuguese"));
  await press(page, "Home", option("German"));
  await page.keyboard.type("fr");
  await expect(option("French")).toBeFocused();
  // Space right after typing would join the search, so Enter picks here.
  await page.keyboard.press("Enter");
  await expect(option("French")).toHaveAttribute("aria-selected", "true");
});

test("reorderable list: rows reorder by keyboard alone (UI-ACCESSIBILITY-R32)", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Lessons" });
  const names = () => grid.getByRole("row").allTextContents();
  await grid.getByRole("row", { name: "Welcome" }).focus();
  await press(page, "ArrowDown", grid.getByRole("row", { name: "Healthy soil" }));
  await page.keyboard.type("m");
  await expect(grid.getByRole("row", { name: "Making compost" })).toBeFocused();
  await press(page, "Home", grid.getByRole("row", { name: "Welcome" }));
  // Into the row to its drag handle, Enter to pick up, arrows to the place, Enter to drop.
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("button", { name: /Drag Welcome/ })).toBeFocused();
  // Each step waits for the drop target it lands on: keys sent before the drag has started
  // were lost on a loaded CI runner.
  const dropTargets = grid.getByRole("row", { name: /^Insert / });
  await page.keyboard.press("Enter");
  await expect(dropTargets.first()).toBeAttached();
  // The drop target is marked, not focused (focus stays on the drag handle).
  const dropOn = async (key: string, name: string) => {
    await page.keyboard.press(key);
    await expect(grid.getByRole("row", { name })).toHaveAttribute("data-drop-target", "true");
  };
  await dropOn("ArrowDown", "Insert between Healthy soil and Making compost");
  await dropOn("ArrowDown", "Insert between Making compost and Final quiz");
  await page.keyboard.press("Enter");
  await expect(dropTargets).toHaveCount(0);
  await expect.poll(names).toEqual(["Healthy soil", "Making compost", "Welcome", "Final quiz"]);
  // Escape while dragging puts the row back.
  await grid.getByRole("row", { name: "Final quiz" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("button", { name: /Drag Final quiz/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dropTargets.first()).toBeAttached();
  await dropOn("ArrowUp", "Insert between Welcome and Final quiz");
  await page.keyboard.press("Escape");
  await expect(dropTargets).toHaveCount(0);
  await expect.poll(names).toEqual(["Healthy soil", "Making compost", "Welcome", "Final quiz"]);
});

test("tree: arrows move, open and close rows, typeahead finds a row", async ({ page }) => {
  const tree = page.getByRole("treegrid", { name: "Course outline" });
  const row = (name: string) => tree.getByRole("row", { name, exact: true });
  await row("Basics").focus();
  await expect(row("Basics")).toHaveAttribute("aria-expanded", "true");
  await press(page, "ArrowDown", row("Welcome"));
  // Left on a child goes to its parent; left on an open parent closes it.
  await press(page, "ArrowLeft", row("Basics"));
  await page.keyboard.press("ArrowLeft");
  await expect(row("Basics")).toHaveAttribute("aria-expanded", "false");
  await expect(row("Welcome")).toHaveCount(0);
  await press(page, "ArrowDown", row("Practice"));
  await page.keyboard.press("ArrowRight");
  await expect(row("Practice")).toHaveAttribute("aria-expanded", "true");
  await press(page, "ArrowDown", row("Making compost"));
  await page.keyboard.type("f");
  await expect(row("Final quiz")).toBeFocused();
  await press(page, "Home", row("Basics"));
  await press(page, "End", row("Final quiz"));
});

test("splitter: arrows resize, Home and End go to the limits, Enter collapses and restores", async ({
  page,
}) => {
  const handle = page.getByRole("separator", { name: "Resize the outline" });
  const size = () => handle.getAttribute("aria-valuenow");
  await handle.focus();
  expect(await size()).toBe("30");
  await page.keyboard.press("ArrowRight");
  expect(await size()).toBe("32");
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await size()).toBe("22");
  await page.keyboard.press("Home");
  expect(await size()).toBe("10");
  await page.keyboard.press("End");
  expect(await size()).toBe("90");
  await page.keyboard.press("ArrowRight");
  expect(await size()).toBe("90");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Enter");
  expect(await size()).toBe("10");
  await page.keyboard.press("Enter");
  expect(await size()).toBe("80");
});

test("splitter: the arrows follow the reading direction right to left", async ({ page }) => {
  await page.goto("/?lang=ar-XB");
  const handle = page.getByRole("separator", { name: "Resize the outline" });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "32");
});

test("empty state, progress bars and icons are not keyboard stops", async ({ page }) => {
  await expect(page.getByRole("progressbar", { name: "Exporting the course" })).toHaveAttribute(
    "aria-valuenow",
    "40",
  );
  const stops = await page
    .locator("#empty-state ~ *, #progress ~ *, #icons ~ *")
    .locator("[tabindex], button, a[href], input")
    .count();
  // Only the empty state's own action button.
  expect(stops).toBe(1);
});
