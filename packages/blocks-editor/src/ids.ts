// New content ids for blocks, items and entries the editor adds.
import { contentIds } from "@course-suite/doc-ops";
import type { Course } from "@course-suite/format";
import { newContentId } from "@course-suite/format";

/** Makes new content ids, unused in `course` and by each other. */
export function idMaker(course: Course): () => string {
  const taken = contentIds(course);
  return () => {
    const id = newContentId(taken);
    taken.add(id);
    return id;
  };
}
