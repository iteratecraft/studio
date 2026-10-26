// M2-07 on the long-resume corpus course (M1-28): the publish-time resume estimate keeps it under
// SCORM 1.2's 4,096 characters, and a longer course built from its lessons gets the author warning.

import {
  blocksPlayer,
  buildPackage,
  type Exporter,
  scorm12Exporter,
  scorm2004Exporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import { corpusCourses } from "./blocks.js";

const longResume = corpusCourses()?.find((course) => course.name === "corpus/long-resume");

async function warnings(course: Course, exporter: Exporter) {
  const result = await buildPackage({
    course,
    player: blocksPlayer(),
    exporter,
    media: longResume?.media ?? (() => undefined),
    fonts: nodeFonts,
    packageVersion: 1,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  return result.value.warnings;
}

/** The course with its lessons and sections repeated twice, the copy with ids of its own. */
function doubled(course: Course): Course {
  const taken = new Set([...JSON.stringify(course).matchAll(/"id":"([^"]*)"/g)].map((m) => m[1]));
  // Ids are ten characters, a letter first: the copy's differ from the original's in the last one.
  const fresh = (id: string) => {
    for (const last of "abcdefghijklmnopqrstuvwxyz0123456789") {
      const copy = `${id.slice(0, 9)}${last}`;
      if (!taken.has(copy)) {
        taken.add(copy);
        return copy;
      }
    }
    throw new Error(`no free id like ${id}`);
  };
  const quiz = course.entries.filter((entry) => entry.kind === "quiz");
  const lessons = course.entries.filter((entry) => entry.kind !== "quiz");
  const copy = JSON.parse(JSON.stringify(lessons), (key, value) =>
    key === "id" ? fresh(value) : value,
  ) as Course["entries"];
  return { ...course, entries: [...lessons, ...copy, ...quiz] };
}

describe.skipIf(!longResume)("long-resume corpus course (M2-07)", () => {
  const course = longResume?.course as Course;

  test("[rise:R3] standards.md §4.2: its largest progress fits SCORM 1.2's 4,096 characters, so publishing warns of nothing", async () => {
    expect(await warnings(course, scorm12Exporter())).toEqual([]);
  });

  test("[rise:R3] standards.md §4.2: twice as long, SCORM 1.2 publishing warns that visits of finished lessons are dropped first, and SCORM 2004 does not", async () => {
    const longer = doubled(course);
    expect(await warnings(longer, scorm12Exporter())).toEqual([
      expect.objectContaining({
        code: "resume-parts-dropped",
        cap: 4_096,
        size: expect.any(Number),
        dropped: ["finished-visits"],
        message: expect.stringContaining("visited pages of finished sections"),
      }),
    ]);
    expect(await warnings(longer, scorm2004Exporter())).toEqual([]);
  });
});
