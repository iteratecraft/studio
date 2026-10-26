import { validateCourse } from "@course-suite/format";
import { createMemoryHost, type FileRef } from "@course-suite/host";
import { createProject, saveProject } from "@course-suite/project";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { blankCourse, fileNameFor, languageCode } from "./course.js";
import { AUTOSAVE_DELAY_MS, CourseSession, openCourseFile } from "./session.js";

const FILE = "Courses/Safety.crs";

/** A host with a saved blank course the user picked, and that course's session. */
async function opened() {
  const host = createMemoryHost({ onPickOpen: () => [FILE] });
  const [file] = (await host.files.pickOpen()) as [FileRef];
  const project = createProject(blankCourse("course", "Safety"));
  await saveProject(host.files.projectFiles(file), file.name, project);
  return { host, file, session: new CourseSession(host, file, project) };
}

const names = (host: { disk: Map<string, unknown> }) => [...host.disk.keys()].sort();
const AUTOSAVE = "Courses/.Safety.crs.autosave/2.crs";
/** Waits for the first autosave to be on the disk; writing it is real work, not a timer. */
const autosaved = (host: { disk: Map<string, unknown> }) =>
  vi.waitFor(() => expect(host.disk.has(AUTOSAVE)).toBe(true));
const retitle = (session: CourseSession, title: string) =>
  session.editor.dispatch({ type: "updateCourse", set: { title } });

describe("course session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("BLK-01: edits autosave once, a few seconds after the first, well inside 10 seconds", async () => {
    const { host, session } = await opened();
    expect(session.state).toEqual({ kind: "saved" });
    retitle(session, "Safety 1");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1000);
    retitle(session, "Safety 2");
    expect(session.state).toEqual({ kind: "unsaved" });
    expect(names(host)).toEqual([FILE]);
    await vi.advanceTimersByTimeAsync(1000);
    await autosaved(host);
    expect(names(host)).toEqual([AUTOSAVE, FILE]);
    expect(AUTOSAVE_DELAY_MS).toBeLessThanOrEqual(10_000);
    // Nothing new: no new autosave.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(names(host)).toHaveLength(2);
  });

  test("save writes the file, drops the autosaves and marks the course saved", async () => {
    const { host, file, session } = await opened();
    retitle(session, "Safety at work");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await autosaved(host);
    await session.save();
    expect(session.dirty).toBe(false);
    expect(names(host)).toEqual([FILE]);
    const reopened = await openCourseFile(host, file);
    expect(reopened.kind === "ok" && reopened.project.course.title).toBe("Safety at work");
  });

  test("a failed save keeps the old file, reports the failure and stays unsaved", async () => {
    const { host, file } = await opened();
    const before = host.disk.get(FILE);
    const projectFiles = host.files.projectFiles;
    let full = true;
    host.files.projectFiles = (picked) => {
      const folder = projectFiles(picked);
      return {
        ...folder,
        write: async (path, data) => {
          if (full) throw new Error("The disk is full");
          return folder.write(path, data);
        },
      };
    };
    const reopened = await openCourseFile(host, file);
    const session = new CourseSession(
      host,
      file,
      (reopened.kind === "ok" && reopened.project) as never,
    );
    retitle(session, "Safety at work");
    await expect(session.save()).rejects.toThrow("The disk is full");
    expect(host.disk.get(FILE)).toEqual(before);
    expect(session.state).toEqual({ kind: "failed", message: "The disk is full" });
    expect(session.dirty).toBe(true);
    full = false;
    await session.save();
    expect(session.state).toEqual({ kind: "saved" });
  });

  test("discard throws the unsaved work away, so the next open offers nothing", async () => {
    const { host, file, session } = await opened();
    retitle(session, "Safety at work");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await autosaved(host);
    await session.discard();
    expect(names(host)).toEqual([FILE]);
    const reopened = await openCourseFile(host, file);
    expect(reopened).toMatchObject({ kind: "ok" });
    expect(reopened.kind === "ok" && reopened.recovered).toBeUndefined();
  });

  test("BLK-01: after a crash the autosaved work is offered on open, and is the newest work", async () => {
    const { host, file, session } = await opened();
    retitle(session, "Safety, unsaved");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await autosaved(host);
    session.close();
    const reopened = await openCourseFile(host, file);
    expect(reopened.kind).toBe("ok");
    expect(reopened.kind === "ok" && reopened.project.course.title).toBe("Safety");
    expect(reopened.kind === "ok" && reopened.recovered?.course.title).toBe("Safety, unsaved");
    // A recovered session starts unsaved.
    const recovered = new CourseSession(
      host,
      file,
      (reopened.kind === "ok" && reopened.recovered) as never,
      true,
    );
    expect(recovered.dirty).toBe(true);
  });

  test("UI-BLOCKS-EDITOR-R13: saving first puts what the fields hold into the document", async () => {
    const { host, file, session } = await opened();
    let typed = "Safety, typed";
    const release = session.holdDraft(() => retitle(session, typed));
    session.commitDrafts();
    expect(session.dirty).toBe(true);
    typed = "Safety, typed more";
    await session.save();
    const reopened = await openCourseFile(host, file);
    expect(reopened.kind === "ok" && reopened.project.course.title).toBe("Safety, typed more");
    release();
    typed = "Not held";
    session.commitDrafts();
    expect(session.editor.document.title).toBe("Safety, typed more");
  });

  test("BLK-01 save as: the work goes on in a new file with the same ids; the old file keeps its last save", async () => {
    const { host, file, session } = await opened();
    retitle(session, "Safety, second edition");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await autosaved(host);
    const target = (await host.files.pickSave({
      suggestedName: "Courses/Safety 2.crs",
    })) as FileRef;
    await session.saveAs(target);
    expect(session.file).toEqual(target);
    expect(session.state).toEqual({ kind: "saved" });
    // The old file's autosaves held this work, which now lives in the new file.
    expect(names(host)).toEqual([target.id, FILE]);
    const old = await openCourseFile(host, file);
    const saved = await openCourseFile(host, target);
    expect(old.kind === "ok" && old.project.course.title).toBe("Safety");
    expect(saved.kind === "ok" && saved.project.course).toEqual(session.editor.document);
    // Edits now autosave next to the new file.
    retitle(session, "Safety, third edition");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await vi.waitFor(() =>
      expect(names(host)).toEqual(["Courses/.Safety 2.crs.autosave/4.crs", target.id, FILE]),
    );
  });

  test("closing stops a pending autosave, as a crash would", async () => {
    const { host, session } = await opened();
    retitle(session, "Never autosaved");
    session.close();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(names(host)).toEqual([FILE]);
  });
});

describe("opening", () => {
  test("a missing or unreachable file is missing; a damaged one lists its problems", async () => {
    const host = createMemoryHost({ onPickOpen: () => ["a.crs"] });
    const unpicked = { id: "b.crs", name: "b.crs" };
    expect(await openCourseFile(host, unpicked)).toEqual({ kind: "missing" });
    const [file] = (await host.files.pickOpen()) as [FileRef];
    expect(await openCourseFile(host, file)).toEqual({ kind: "missing" });
    host.disk.set("a.crs", new Uint8Array([1, 2, 3]));
    const damaged = await openCourseFile(host, file);
    expect(damaged.kind).toBe("damaged");
    expect(damaged.kind === "damaged" && damaged.problems.length).toBeGreaterThan(0);
    expect(damaged.kind === "damaged" && damaged.recovered).toBeUndefined();
  });
});

describe("new courses", () => {
  test("blocks-editor W1, W2: a blank course has an empty outline, a blank microlearning one lesson", () => {
    const course = blankCourse("course", "Safety", new Date("2026-10-25T10:00:00Z"));
    expect(validateCourse(course)).toEqual([]);
    expect(course).toMatchObject({ entries: [], sourceLanguage: "en-US" });
    expect(course.createdAt).toBe("2026-10-25T10:00:00.000Z");
    const micro = blankCourse("microlearning", "Five minutes");
    expect(validateCourse(micro)).toEqual([]);
    expect(micro.entries).toMatchObject([{ kind: "lesson", title: "Five minutes", blocks: [] }]);
  });

  test("D-33: the suggested file name is the title without what Windows forbids, then .crs", () => {
    expect(fileNameFor("Safety: part 1/2?", "Course")).toBe("Safety- part 1-2-.crs");
    expect(fileNameFor("  Trailing dots... ", "Course")).toBe("Trailing dots.crs");
    expect(fileNameFor('<>:"|', "Course")).toBe("-----.crs");
    expect(fileNameFor("   ", "Course")).toBe("Course.crs");
  });

  test("rise.md 3L, BLK-01: a source language code is taken in its canonical form, as the format takes it", () => {
    expect(languageCode(" fr-ca ")).toBe("fr-CA");
    expect(languageCode("EN-us")).toBe("en-US");
    expect(languageCode("zh-hant-tw")).toBe("zh-Hant-TW");
    for (const wrong of ["", "english", "e", "en-", "en_US", "123"]) {
      expect(languageCode(wrong), wrong).toBeUndefined();
    }
  });
});
