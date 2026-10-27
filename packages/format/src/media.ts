// Which media files a course uses (BLK-05 "unused media is left out of exports"): every storage key
// a media reference names anywhere in the document, outside the media index itself. Keys inside
// `ext` data belong to whoever wrote them (ADR-0002) and are not counted.
import type { Course } from "./course.js";

/** Storage keys named by the media references in `value` (a block, a lesson, any part of a course). */
export function mediaKeysIn(value: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (part: unknown, name?: string): void => {
    if (typeof part === "string") {
      if (name === "key") keys.add(part);
    } else if (Array.isArray(part)) {
      for (const item of part) visit(item);
    } else if (part !== null && typeof part === "object") {
      for (const [field, item] of Object.entries(part)) {
        if (field !== "ext") visit(item, field);
      }
    }
  };
  visit(value);
  return keys;
}

/** Storage keys of every media file the course refers to: images, audio, video, captions, files. */
export function usedMediaKeys(course: Course): Set<string> {
  const { media: _, ...rest } = course;
  return mediaKeysIn(rest);
}
