import { applyCommands, createEditor } from "@course-suite/doc-ops";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { sampleCourse } from "@course-suite/format/test/courses";
import {
  DATA_FILE,
  decodeCourseData,
  pageHash,
  pagesOf,
  parseRoute,
  REGISTRY_GLOBAL,
} from "@course-suite/player-blocks";
import { readZip } from "@course-suite/zip";
import { expect, test } from "vitest";
import { movesBetween } from "./outline.js";

test("BLK-02: moveEntry commands turn one outline order into another, as one list", () => {
  const course = sampleCourse();
  const from = course.entries.map((entry) => entry.id);
  const to = [...from.slice(1, 3), from[0] as string, ...from.slice(3)].reverse();
  const result = applyCommands(course, movesBetween(from, to));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.document.entries.map((entry) => entry.id)).toEqual(to);
  expect(movesBetween(from, from)).toEqual([]);
});

/** The course a web package of `course` hands its player, read back from the package's zip. */
async function exported(course: Course): Promise<Course> {
  const built = await buildPackage({
    course,
    player: blocksPlayer(),
    exporter: webExporter(),
    media: () => new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    packageVersion: 1,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  const zip = await readZip(built.value.zip);
  if (!zip.ok) throw new Error("the package is not a readable zip");
  const script = new TextDecoder().decode(await zip.value.read(DATA_FILE));
  // The data file registers the course on the player's registry, as the page would run it.
  let registered: unknown;
  const registry = {
    register: (_: string, value: unknown) => {
      registered = value;
    },
  };
  new Function(REGISTRY_GLOBAL, script)(registry);
  const data = decodeCourseData(registered);
  if (!data) throw new Error(`${DATA_FILE} holds no course data`);
  return data.course;
}

test("BLK-02, [rise:3B]: lesson ids stay through reorder, rename and re-export, so a lesson link from one export opens the same lesson in the next", async () => {
  const editor = createEditor(sampleCourse());
  const first = await exported(editor.document);
  const links = pagesOf(first).map((page) => ({ hash: pageHash(page.id), id: page.id }));
  expect(links.length).toBeGreaterThan(2);

  // Edits of the outline as the editor makes them: a reorder, a rename, an added and a duplicated
  // lesson.
  const order = editor.document.entries.map((entry) => entry.id);
  editor.dispatch(movesBetween(order, [...order].reverse()));
  const [renamed] = links;
  if (!renamed) throw new Error("no lesson");
  editor.dispatch({ type: "updateEntry", id: renamed.id, set: { title: "Renamed lesson" } });
  editor.dispatch({ type: "duplicateEntry", id: renamed.id });
  editor.dispatch({
    type: "insertEntry",
    value: { id: "lessonnew1", kind: "lesson", title: "Added", blocks: [] },
    index: 0,
  });

  const next = pagesOf(await exported(editor.document));
  for (const link of links) {
    const route = parseRoute(link.hash, next);
    expect(route.kind === "page" && route.page.id).toBe(link.id);
  }
  const reopened = parseRoute(renamed.hash, next);
  expect(reopened.kind === "page" && reopened.page.title).toBe("Renamed lesson");
});
