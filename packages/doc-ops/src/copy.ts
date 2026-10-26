// Duplicating a whole course (rise.md 3J, BLK-01 "a duplicated course shares no ids with its
// source"): a new project id and a new content id for every object, with references kept.
import type { Course } from "@course-suite/format";
import { newContentId, newProjectId } from "@course-suite/format";
import { indexDocument } from "./walk.js";

/**
 * A copy of the course that shares no id with it: a new project id, a new id for every object
 * with a content id, and every reference to one of them (a button's lesson, a quiz's skip-ahead,
 * course tracking, a sorting card's category, a block's custom-block document) pointing at its
 * copy. References into other containers (`{ containerId, id }`) are kept as they are.
 * shortcut: ids inside rich-text HTML are not rewritten; the format puts none there yet.
 */
export function copyCourse(course: Course): Course {
  const old = [...indexDocument(course).keys()];
  const taken = new Set(old);
  const renamed = new Map<string, string>();
  for (const id of old) {
    const fresh = newContentId(taken);
    taken.add(fresh);
    renamed.set(id, fresh);
  }
  const copy = (value: unknown): unknown => {
    if (typeof value === "string") return renamed.get(value) ?? value;
    if (Array.isArray(value)) return value.map(copy);
    if (value === null || typeof value !== "object") return value;
    // Documents are never changed in place, so the copy may share what it keeps as it is.
    if (Object.hasOwn(value, "containerId")) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  };
  return { ...(copy(course) as Course), id: newProjectId() };
}
