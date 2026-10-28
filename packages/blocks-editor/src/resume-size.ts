// The live estimate of learner progress for the publish panel (STD-08, M2-07; standards.md 4.2):
// the largest state the player can save for the course, measured as the player stores it, against
// what the output keeps. It brings the player's progress code and the resume codec, so the panel
// loads it on its own, when it opens.
import type { Course, Standard } from "@course-suite/format";
import { largestResume } from "@course-suite/player-blocks";
import { checkResume, encodeResume, resumeCapFor } from "@course-suite/tracking";

/** Characters the largest progress of `course` needs, and the cap of `standard`; none for web. */
export function resumeSize(
  course: Course,
  standard: Standard,
): { size: number; cap: number } | undefined {
  const cap = resumeCapFor(standard);
  if (cap === undefined) return undefined;
  const state = largestResume(course);
  // The package version is kept with the state (rise.md rule 12): count the next one's digits.
  const options = { packageVersion: String((course.publish?.packageVersion ?? 0) + 1), cap };
  const over = checkResume(state, options)[0];
  if (over) return { size: over.size, cap };
  const encoded = encodeResume(state, options);
  return { size: encoded.ok ? encoded.payload.length : cap, cap };
}
