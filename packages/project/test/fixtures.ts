// Projects for the tests: the format's test courses with stand-in media, and every course of the
// Blocks conformance corpus with its real media when a test-courses checkout is present.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "@course-suite/format";
import { fullCourse, sampleCourse } from "@course-suite/format/test/courses";
import { addAsset, createProject, type Project, readAsset } from "../src/index.js";
import { loadBlocksCorpus, TEST_COURSES_DIR } from "./corpus.ts";

export interface Fixture {
  name: string;
  course: Course;
  media(key: string): Uint8Array | undefined;
}

const standIn = (key: string) => new TextEncoder().encode(`stand-in bytes for ${key}`);

export const sample = (): Fixture => ({
  name: "fixtures/sample",
  course: sampleCourse(),
  media: standIn,
});
export const full = (): Fixture => ({
  name: "fixtures/full",
  course: fullCourse(),
  media: standIn,
});

export function fixtures(): Fixture[] {
  const corpus = (loadBlocksCorpus() ?? []).map(({ name, text }) => ({
    name: `corpus/${name}`,
    course: JSON.parse(text) as Course,
    media: (key: string) => {
      const file = join(TEST_COURSES_DIR, "blocks", name, "media", key);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : undefined;
    },
  }));
  return [sample(), full(), ...corpus];
}

/** A new project holding the course and every media file it lists, under the course's keys. */
export async function projectOf({ course, media }: Fixture): Promise<Project> {
  const project = createProject(course);
  for (const entry of course.media) {
    for (const key of [entry.key, entry.variantKey]) {
      if (key === undefined) continue;
      const data = media(key);
      if (!data) throw new Error(`No bytes for media ${key}`);
      const { source, licence, attribution } = entry;
      const info = {
        name: key,
        type: entry.mimeType ?? "application/octet-stream",
        source,
        ...(licence !== undefined && { licence }),
        ...(attribution !== undefined && { attribution }),
      };
      await addAsset(project, data, info, key);
    }
  }
  return project;
}

/** Every asset's bytes, by storage key. */
export async function assetBytes(project: Project): Promise<Record<string, Uint8Array>> {
  const bytes: Record<string, Uint8Array> = {};
  for (const key of Object.keys(project.assets)) {
    const data = await readAsset(project, key);
    if (data) bytes[key] = data;
  }
  return bytes;
}
