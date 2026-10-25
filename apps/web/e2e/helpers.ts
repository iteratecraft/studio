// Steps and checks the blocks editor's browser tests share (editor.e2e.ts, outline.e2e.ts). The
// tests answer the file dialogs and read the in-memory disk through `window.editorTest`
// (src/editor.tsx).
import type { Course } from "@course-suite/format";
import { addAsset, createProject, memoryProjectFiles, saveProject } from "@course-suite/project";
import { readZip } from "@course-suite/zip";
import { expect, type Page } from "@playwright/test";

export const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
export const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
export const card = (page: Page, title: string) =>
  page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
export const status = (page: Page) => page.getByRole("status");

export async function launch(page: Page, query = ""): Promise<void> {
  await page.goto(`/editor.html${query}`);
  await expect(heading(page, "Your courses")).toBeVisible();
}

/** New → blank course or microlearning → title → the empty course opens in the editor. */
export async function create(
  page: Page,
  title: string,
  kind: "course" | "microlearning" = "course",
) {
  await button(page, "New").click();
  await page
    .getByRole("menuitem", { name: kind === "course" ? "Blank course" : "Blank microlearning" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: kind === "course" ? "New course" : "New microlearning",
  });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(heading(page, title)).toBeVisible();
  await expect(status(page)).toHaveText("Saved");
}

export async function back(page: Page): Promise<void> {
  await button(page, "Back to your courses").click();
  await expect(heading(page, "Your courses")).toBeVisible();
}

/** Types a new course title on the overview and keeps it (Enter): one undo step. */
export async function retitle(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Course title" });
  await field.fill(title);
  await field.press("Enter");
  await expect(heading(page, title)).toBeVisible();
}

export const files = (page: Page) =>
  page.evaluate(() =>
    [...window.editorTest.host.disk.keys()].filter((id) => !id.startsWith("appdata/")).sort(),
  );

export async function bytesOf(page: Page, id: string): Promise<Uint8Array> {
  const bytes = await page.evaluate(
    (id) => Array.from(window.editorTest.host.disk.get(id) ?? []),
    id,
  );
  return new Uint8Array(bytes);
}

/** The file's archive, which must read cleanly. */
export async function unzip(page: Page, id: string) {
  const zip = await readZip(await bytesOf(page, id));
  if (!zip.ok) throw new Error(`${id} is not a readable zip`);
  return zip.value;
}

export async function courseIn(page: Page, id: string) {
  const zip = await unzip(page, id);
  const text = new TextDecoder().decode(await zip.read("course.json"));
  return JSON.parse(text) as Course;
}

/** Every `"id"` value in the file's course document. */
export async function idsIn(page: Page, file: string): Promise<string[]> {
  const zip = await unzip(page, file);
  const text = new TextDecoder().decode(await zip.read("course.json"));
  return [...text.matchAll(/"id": "([^"]+)"/g)].map((m) => m[1] as string);
}

/**
 * Puts a course file made from `course`, with the media files in `assets` by storage key, on the
 * in-memory disk and opens it in the editor.
 */
export async function openFixture(
  page: Page,
  name: string,
  course: Course,
  assets: Record<string, string> = {},
): Promise<void> {
  const disk = memoryProjectFiles();
  const project = createProject(course);
  for (const [key, text] of Object.entries(assets)) {
    const data = new TextEncoder().encode(text);
    await addAsset(project, data, { name: key, type: "image/svg+xml", source: "upload" }, key);
  }
  await saveProject(disk, name, project);
  const bytes = disk.files.get(name);
  if (!bytes) throw new Error(`${name} was not written`);
  await page.evaluate(
    ([id, data]) => {
      window.editorTest.host.disk.set(id as string, new Uint8Array(data as number[]));
      window.editorTest.open = [id as string];
    },
    [name, Array.from(bytes)] as const,
  );
  await button(page, "Open a course file").click();
  await expect(heading(page, course.title)).toBeVisible();
}
