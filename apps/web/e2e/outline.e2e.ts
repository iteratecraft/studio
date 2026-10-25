// The course outline and lessons in Chromium against the in-memory host (M2-09, BLK-02): adding,
// renaming, reordering, folding, duplicating, copying and deleting outline entries, and opening a
// lesson, by pointer and by keyboard, with axe on every screen in both themes.
import { type Course, type LessonEntry, SCHEMA_VERSION } from "@course-suite/format";
import { expect, type Page, test } from "@playwright/test";
import { violations } from "./axe.ts";
import {
  back,
  button,
  card,
  courseIn,
  create,
  heading,
  launch,
  openFixture,
  status,
} from "./helpers.ts";

const FILE = "Workshop basics.crs";
const SAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 4h8"/></svg>';

/**
 * A course with two sections, three lessons and a quiz: Welcome has a button to Tools, Tools
 * shows an image, Notes is empty.
 */
function workshop(): Course {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "0b6f3e2a-5c41-4d7e-9a28-6f1d3c5b7e90",
    kind: "course",
    title: "Workshop basics",
    entries: [
      { id: "sectprep01", kind: "section", title: "Preparing" },
      {
        id: "lesswelcom",
        kind: "lesson",
        title: "Welcome",
        blocks: [
          {
            id: "blkwelcome",
            category: "text",
            variant: "heading",
            items: [{ id: "itmwelcome", kind: "content", title: "Hello" }],
          },
          {
            id: "blkbuttons",
            category: "interactive",
            variant: "buttons",
            items: [
              {
                id: "btntotools",
                kind: "button",
                label: "See the tools",
                destination: { kind: "lesson", entry: "lesstools1" },
              },
            ],
          },
        ],
      },
      {
        id: "lesstools1",
        kind: "lesson",
        title: "Tools",
        blocks: [
          {
            id: "blkimage01",
            category: "image",
            variant: "centered",
            media: [{ key: "saw.svg", alt: "A hand saw" }],
          },
        ],
      },
      { id: "lessnotes1", kind: "lesson", title: "Notes", blocks: [] },
      { id: "sectcheck1", kind: "section", title: "Checking" },
      { id: "quizfinal1", kind: "quiz", title: "Final check", questions: [] },
    ],
    media: [{ id: "mediasaw01", key: "saw.svg", source: "upload", mimeType: "image/svg+xml" }],
  };
}

const outline = (page: Page) => page.getByRole("grid", { name: "Outline" });
const row = (page: Page, title: string) =>
  outline(page).getByRole("row", { name: title, exact: true });
const newField = (page: Page) => page.getByRole("textbox", { name: "New lesson or section" });
const announced = (page: Page) => page.locator(".be-outline [aria-live]");

/** Titles of the outline rows, as shown. */
const titles = (page: Page) =>
  outline(page)
    .getByRole("row")
    .evaluateAll((rows) => rows.map((row) => row.querySelector("input")?.value ?? ""));

async function saved(page: Page): Promise<Course> {
  await page.keyboard.press("Control+S");
  await expect(status(page)).toHaveText("Saved");
  return courseIn(page, FILE);
}

const outlineOf = (course: Course) => course.entries.map((entry) => `${entry.kind} ${entry.title}`);

async function rowAction(page: Page, title: string, action: string): Promise<void> {
  await row(page, title)
    .getByRole("button", { name: `Actions for ${title}` })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

test.describe("course outline", () => {
  test("[rise:3B] blocks-editor W4, UI-BLOCKS-EDITOR-R9: by keyboard alone, Enter adds a lesson, Shift+Enter a section header and the Add menu a quiz", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Garden tools");
    await expect(page.getByRole("heading", { name: "No lessons yet" })).toBeVisible();
    await newField(page).focus();
    await page.keyboard.type("Before you dig");
    await page.keyboard.press("Shift+Enter");
    await expect(announced(page)).toHaveText("Added Before you dig");
    await expect(newField(page)).toBeFocused();
    await expect(newField(page)).toHaveValue("");
    await page.keyboard.type("Spades");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Forks");
    await page.keyboard.press("Enter");
    // An empty title adds nothing on Enter.
    await page.keyboard.press("Enter");
    await page.keyboard.type("Tool check");
    await page.keyboard.press("Tab");
    await expect(button(page, "Add")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Lesson" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Quiz" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(row(page, "Tool check")).toBeVisible();
    expect(await titles(page)).toEqual(["Before you dig", "Spades", "Forks", "Tool check"]);
    // Every add is one undo step.
    await expect(button(page, "Undo")).toBeEnabled();
    const course = await courseIn(page, "Garden tools.crs");
    expect(course.entries).toEqual([]);
    await page.keyboard.press("Control+S");
    await expect(status(page)).toHaveText("Saved");
    expect(outlineOf(await courseIn(page, "Garden tools.crs"))).toEqual([
      "section Before you dig",
      "lesson Spades",
      "lesson Forks",
      "quiz Tool check",
    ]);
    await back(page);
    await expect(card(page, "Garden tools")).toContainText("Course · 3 lessons");
  });

  test("[rise:3B] blocks-editor W5, UI-BLOCKS-EDITOR-R12: rows are renamed in place, and lessons under a section sit in from it", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    const field = row(page, "Notes").getByRole("textbox", { name: "Lesson title" });
    // A click, as focus put into a row by script goes to the list's current row instead.
    await field.click();
    await field.fill("Shop notes");
    await field.press("Enter");
    await expect(row(page, "Shop notes")).toBeVisible();
    await expect(status(page)).toHaveText("Unsaved changes");
    // Escape puts back the kept title.
    const section = row(page, "Checking").getByRole("textbox", { name: "Section header title" });
    await section.click();
    await section.fill("Typo");
    await section.press("Escape");
    await expect(section).toHaveValue("Checking");
    await expect(row(page, "Welcome").locator(".be-row")).toHaveAttribute(
      "data-in-section",
      "true",
    );
    await expect(row(page, "Preparing").locator(".be-row")).not.toHaveAttribute("data-in-section");
    const course = await saved(page);
    // Renaming keeps the id (BLK-02: stable entry ids).
    expect(course.entries.map((entry) => entry.id)).toEqual(workshop().entries.map((e) => e.id));
    expect(course.entries[3]?.title).toBe("Shop notes");
  });

  test("UI-BLOCKS-EDITOR-R11, R12, blocks-editor C10, D-36: delete offers undo in one step, and buttons to a deleted lesson go with it", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    // Only lessons with content show an icon; a header or an empty lesson has a one-click bin.
    await expect(row(page, "Welcome").locator(".be-row-icon svg")).toHaveCount(1);
    await expect(row(page, "Notes").locator(".be-row-icon svg")).toHaveCount(0);
    await expect(row(page, "Final check").locator(".be-row-icon svg")).toHaveCount(0);
    await expect(row(page, "Tools").getByRole("button", { name: "Delete Tools" })).toHaveCount(0);
    await row(page, "Notes").getByRole("button", { name: "Delete Notes" }).click();
    await expect(row(page, "Notes")).toHaveCount(0);
    await row(page, "Checking").getByRole("button", { name: "Delete Checking" }).click();

    // A lesson with content is deleted from its menu; the notice undoes only the latest delete.
    await rowAction(page, "Tools", "Delete");
    const notice = page.getByRole("alertdialog", { name: "Deleted Tools" });
    await notice.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Tools")).toBeVisible();
    await expect(notice).toHaveCount(0);
    let course = await saved(page);
    expect(JSON.stringify(course)).toContain('"entry":"lesstools1"');

    await rowAction(page, "Tools", "Delete");
    course = await saved(page);
    expect(outlineOf(course)).toEqual(["section Preparing", "lesson Welcome", "quiz Final check"]);
    const welcome = course.entries[1] as LessonEntry;
    expect(welcome.blocks.map((block) => block.items?.length ?? 0)).toEqual([1, 0]);

    // Ctrl+Z outside a text field brings back the lesson and its button together.
    await heading(page, "Workshop basics").click();
    await page.keyboard.press("Control+Z");
    await expect(row(page, "Tools")).toBeVisible();
    course = await saved(page);
    expect(JSON.stringify(course)).toContain('"entry":"lesstools1"');
    await page.keyboard.press("Control+Z");
    await expect(row(page, "Checking")).toBeVisible();
  });

  test("BLK-02, UI-ACCESSIBILITY-R32: rows are reordered by keyboard drag, by the menu and by pointer drag; each move is announced and ids stay", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    // Keyboard drag: the row's drag handle, Enter, arrows to the place, Enter to drop.
    // Arrow keys move between rows; Tab moves through a row's controls.
    await row(page, "Welcome").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "Notes")).toBeFocused();
    await page.keyboard.press("Tab");
    const handle = row(page, "Notes").getByRole("button", { name: /drag/i });
    await expect(handle).toBeFocused();
    // Each key waits for the drag state it needs: keys sent before the drag has started are lost.
    const dropTargets = outline(page).getByRole("row", { name: /^Insert / });
    await page.keyboard.press("Enter");
    await expect(dropTargets.first()).toBeAttached();
    await page.keyboard.press("ArrowUp");
    await expect(dropTargets.and(page.locator("[data-drop-target]"))).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await expect(
      outline(page).getByRole("row", { name: "Insert between Welcome and Tools" }),
    ).toHaveAttribute("data-drop-target", "true");
    await page.keyboard.press("Enter");
    await expect(dropTargets).toHaveCount(0);
    await expect(announced(page)).toHaveText("Moved Notes to place 3 of 6");
    expect(await titles(page)).toEqual([
      "Preparing",
      "Welcome",
      "Notes",
      "Tools",
      "Checking",
      "Final check",
    ]);

    // The row menu moves one place.
    await rowAction(page, "Final check", "Move up");
    await expect(announced(page)).toHaveText("Moved Final check to place 5 of 6");
    await expect(
      row(page, "Preparing").getByRole("button", { name: "Actions for Preparing" }),
    ).toBeVisible();
    await row(page, "Preparing").getByRole("button", { name: "Actions for Preparing" }).click();
    await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // Pointer drag by the handle onto the top edge of a row drops before it.
    const box = await row(page, "Tools").getByRole("button", { name: /drag/i }).boundingBox();
    const start = await row(page, "Tools").boundingBox();
    if (!box || !start) throw new Error("the Tools row is not shown");
    await row(page, "Tools").dragTo(row(page, "Welcome"), {
      sourcePosition: { x: box.x - start.x + box.width / 2, y: box.y - start.y + box.height / 2 },
      targetPosition: { x: 40, y: 3 },
    });
    await expect
      .poll(() => titles(page))
      .toEqual(["Preparing", "Tools", "Welcome", "Notes", "Final check", "Checking"]);
    const course = await saved(page);
    expect(course.entries.map((entry) => entry.id)).toEqual([
      "sectprep01",
      "lesstools1",
      "lesswelcom",
      "lessnotes1",
      "quizfinal1",
      "sectcheck1",
    ]);
    // The whole reorder is undone a move at a time.
    await heading(page, "Workshop basics").click();
    await page.keyboard.press("Control+Z");
    expect(await titles(page)).toEqual([
      "Preparing",
      "Welcome",
      "Notes",
      "Tools",
      "Final check",
      "Checking",
    ]);
  });

  test("blocks-editor W4, W5: a section folds its lessons away and moves with them; rows are added below a row", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    const toggle = row(page, "Preparing").getByRole("button", { name: "Lessons under Preparing" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await titles(page)).toEqual(["Preparing", "Checking", "Final check"]);
    await expect(row(page, "Preparing")).toContainText("3 lessons");
    // The outline is one list: a folded section moves past the next row with its lessons.
    await rowAction(page, "Preparing", "Move down");
    await expect(announced(page)).toHaveText("Moved Preparing to place 2 of 6");
    let course = await saved(page);
    expect(outlineOf(course)).toEqual([
      "section Checking",
      "section Preparing",
      "lesson Welcome",
      "lesson Tools",
      "lesson Notes",
      "quiz Final check",
    ]);
    // The undo of the move is one step.
    await heading(page, "Workshop basics").click();
    await page.keyboard.press("Control+Z");
    course = await saved(page);
    expect(course.entries.map((entry) => entry.id)).toEqual(workshop().entries.map((e) => e.id));
    await toggle.click();
    expect(await titles(page)).toHaveLength(6);

    // Add below: the new row comes right under, with its title field focused.
    await rowAction(page, "Welcome", "Add section header below");
    const fresh = outline(page).getByRole("textbox", { name: "Section header title" }).nth(1);
    await expect(fresh).toBeFocused();
    await page.keyboard.type("Safety first");
    await page.keyboard.press("Enter");
    expect(outlineOf(await saved(page)).slice(1, 4)).toEqual([
      "lesson Welcome",
      "section Safety first",
      "lesson Tools",
    ]);
  });

  test("[rise:3B] UI-BLOCKS-EDITOR-R10: a duplicated lesson lands directly below the original, with new ids", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    await rowAction(page, "Welcome", "Duplicate");
    await expect(announced(page)).toHaveText("Added a copy of Welcome below it");
    expect(await titles(page)).toEqual([
      "Preparing",
      "Welcome",
      "Welcome",
      "Tools",
      "Notes",
      "Checking",
      "Final check",
    ]);
    const course = await saved(page);
    const [original, copy] = course.entries.slice(1, 3) as LessonEntry[];
    expect(original?.id).toBe("lesswelcom");
    expect(copy?.id).not.toBe("lesswelcom");
    expect(copy?.blocks.map((block) => block.id)).not.toContain("blkwelcome");
    // The copy's button still goes to the same lesson.
    expect(JSON.stringify(copy)).toContain('"entry":"lesstools1"');
  });

  test("[rise:3B] blocks-editor W5, C8, UI-BLOCKS-EDITOR-R10: a lesson copied to another course lands last there, with new ids and its media", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Garden tools");
    await newField(page).fill("Spades");
    await newField(page).press("Enter");
    await page.keyboard.press("Control+S");
    await back(page);
    await create(page, "Quick tips", "microlearning");
    await back(page);
    await openFixture(page, FILE, workshop(), { "saw.svg": SAW });

    await rowAction(page, "Tools", "Copy to another course…");
    const dialog = page.getByRole("dialog", { name: "Copy Tools to another course" });
    // Only other courses: not this one, and not a microlearning, which holds one lesson.
    const courses = dialog.getByRole("listbox", { name: "Courses" });
    await expect(courses.getByRole("option")).toHaveText(["Garden tools"]);
    await courses.getByRole("option", { name: "Garden tools" }).click();
    await dialog.getByRole("button", { name: "Copy" }).click();
    const notice = page.getByRole("alertdialog", {
      name: "Copied Tools to the end of Garden tools",
    });
    await expect(notice).toBeVisible();
    // This course is unchanged.
    await expect(status(page)).toHaveText("Saved");

    const target = await courseIn(page, "Garden tools.crs");
    expect(outlineOf(target)).toEqual(["lesson Spades", "lesson Tools"]);
    const copy = target.entries[1] as LessonEntry;
    expect(copy.id).not.toBe("lesstools1");
    expect(copy.blocks[0]?.id).not.toBe("blkimage01");
    expect(target.media.map((media) => media.key)).toEqual(["saw.svg"]);

    // The notice opens the other course.
    await notice.getByRole("button", { name: "Open that course" }).click();
    await expect(heading(page, "Garden tools")).toBeVisible();
    await row(page, "Tools").getByRole("button", { name: "Open Tools" }).click();
    await expect(page.getByRole("grid", { name: "Blocks of Tools" }).getByRole("row")).toHaveText([
      /Centred image/,
    ]);
  });

  test("blocks-editor W5, BLK-02: a lesson with a buttons block that leads elsewhere is copied without that button", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Garden tools");
    await back(page);
    await openFixture(page, FILE, workshop());
    // By keyboard: the row menu, the course list and Enter on a course.
    await row(page, "Welcome").focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
    await expect(
      row(page, "Welcome").getByRole("button", { name: "Actions for Welcome" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Copy to another course…" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Garden tools" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("alertdialog", { name: "Copied Welcome to the end of Garden tools" }),
    ).toBeVisible();
    const copy = (await courseIn(page, "Garden tools.crs")).entries[0] as LessonEntry;
    expect(copy.blocks.map((block) => block.items?.length ?? 0)).toEqual([1, 0]);
  });
});

test.describe("lessons", () => {
  test("blocks-editor L1, C11, UI-BLOCKS-EDITOR-R15: a lesson opens with its blocks; the switcher goes to another lesson or back to its row", async ({
    page,
  }) => {
    await launch(page);
    await openFixture(page, FILE, workshop());
    await row(page, "Welcome").getByRole("button", { name: "Open Welcome" }).click();
    const lessonHeading = page.getByRole("heading", { level: 2, name: "Welcome" });
    await expect(lessonHeading).toBeFocused();
    const blocks = page.getByRole("grid", { name: "Blocks of Welcome" });
    await expect(blocks.getByRole("row")).toHaveCount(2);
    await expect(blocks.getByRole("row", { name: "Heading: Hello" })).toBeVisible();
    await expect(blocks.getByRole("row", { name: "Button stack" })).toBeVisible();
    await expect(button(page, "Undo")).toBeDisabled();

    const title = page.getByRole("textbox", { name: "Lesson title" });
    await title.fill("Welcome aboard");
    await title.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Welcome aboard" })).toBeVisible();
    const description = page.getByRole("textbox", { name: "Description" });
    await description.fill("Who this is for.\nWhat you need.");
    const author = page.getByRole("textbox", { name: "Author shown on this lesson" });
    await author.fill("Ana Example");
    await author.press("Enter");
    let lesson = (await saved(page)).entries[1] as LessonEntry;
    expect(lesson).toMatchObject({
      title: "Welcome aboard",
      description: "<p>Who this is for.</p><p>What you need.</p>",
      author: { name: "Ana Example" },
    });
    await author.fill("");
    await author.press("Enter");
    lesson = (await saved(page)).entries[1] as LessonEntry;
    expect(lesson.author).toBeUndefined();

    // A quiz shows where its questions will go.
    await page.getByRole("button", { name: /Go to/ }).click();
    await page.getByRole("option", { name: "Final check" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Final check" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Quiz questions" })).toBeVisible();
    // Leaving the lesson clears its undo history (R15).
    await expect(button(page, "Undo")).toBeDisabled();

    // Back to the overview, by keyboard; focus returns to the row of the quiz.
    await page.getByRole("button", { name: /Go to/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option", { name: "Final check" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("option", { name: "Course overview" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      row(page, "Final check").getByRole("button", { name: "Open Final check" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Final check" })).toBeFocused();
  });

  test("blocks-editor C2, 2.2, W6: the course author and description are kept in the file; an empty author hides it", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Ladders");
    const author = page.getByRole("textbox", { name: "Author shown to learners" });
    await author.fill("Sam Example");
    await author.press("Enter");
    const description = page.getByRole("textbox", { name: "Description" });
    await description.fill("Pick, place & climb <safely>.");
    await author.focus();
    await page.keyboard.press("Control+S");
    await expect(status(page)).toHaveText("Saved");
    let course = await courseIn(page, "Ladders.crs");
    expect(course.authors).toEqual([{ name: "Sam Example" }]);
    expect(course.description).toBe("<p>Pick, place &amp; climb &lt;safely&gt;.</p>");
    await author.fill("");
    await author.press("Enter");
    await description.fill("");
    await author.focus();
    await page.keyboard.press("Control+S");
    await expect(status(page)).toHaveText("Saved");
    course = await courseIn(page, "Ladders.crs");
    expect(course.authors).toBeUndefined();
    expect(course.description).toBeUndefined();
  });

  test("[rise:3A] blocks-editor 2.2, W2: a microlearning shows its one lesson and no outline", async ({
    page,
  }) => {
    await launch(page);
    await create(page, "Quick tips", "microlearning");
    await expect(page.getByRole("heading", { name: "No blocks yet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outline" })).toHaveCount(0);
    await expect(newField(page)).toHaveCount(0);
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`UI-ACCESSIBILITY: no axe violation on the outline and lesson screens in the ${theme} theme`, async ({
    page,
  }) => {
    const check = async (state: string) =>
      expect(await violations(page), `${theme}: ${state}`).toEqual([]);
    await launch(page, `?theme=${theme}`);
    await create(page, "Garden tools");
    await check("empty outline");
    await back(page);
    await openFixture(page, FILE, workshop());
    await check("outline");
    await row(page, "Tools").getByRole("button", { name: "Actions for Tools" }).click();
    await check("row menu");
    await page.getByRole("menuitem", { name: "Copy to another course…" }).click();
    await check("copy dialog");
    await page.keyboard.press("Escape");
    await row(page, "Preparing").getByRole("button", { name: "Lessons under Preparing" }).click();
    await check("folded section");
    await row(page, "Preparing").getByRole("button", { name: "Lessons under Preparing" }).click();
    await rowAction(page, "Tools", "Delete");
    await check("delete notice");
    await button(page, "Add").click();
    await check("add menu");
    await page.keyboard.press("Escape");
    await row(page, "Welcome").getByRole("button", { name: "Open Welcome" }).click();
    await check("lesson");
    await page.getByRole("button", { name: /Go to/ }).click();
    await check("lesson switcher");
    await page.getByRole("option", { name: "Final check" }).click();
    await check("quiz");
    await button(page, "Back to your courses").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Don't save" }).click();
    await expect(heading(page, "Your courses")).toBeVisible();
    await create(page, "Quick tips", "microlearning");
    await check("microlearning");
  });
}
