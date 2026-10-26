// A stub player bundle and a small course for tests, written by hand for this package. The real
// player bundle comes from the player package (M1-09); it implements the same PlayerBundle contract.
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import type { BuildInput, PlayerBundle } from "../src/index.js";
import { scorm12Exporter } from "../src/index.js";

const bytes = (text: string) => new TextEncoder().encode(text);

export function stubPlayer(): PlayerBundle {
  return {
    launchPage: "index.html",
    files: new Map([
      [
        "index.html",
        bytes(
          '<!doctype html><html lang="en"><title>Course</title>' +
            '<script src="course/data.js"></script><script src="player/boot.js"></script></html>\n',
        ),
      ],
      ["player/boot.js", bytes('document.title = "Course";\n')],
    ]),
    courseDataScript: (data) => ({
      path: "course/data.js",
      data: bytes(`window.stubCourseData = ${JSON.stringify(data)};\n`),
    }),
  };
}

export function stubCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    kind: "course",
    title: "Workshop safety & you",
    description: "<p>What to check <b>before</b> you start.</p>",
    cover: { key: "cover.jpg", alt: "A tidy bench" },
    sourceLanguage: "en-GB",
    publish: {
      standard: "scorm12",
      passingScore: 80,
      manifestIdentifier: "workshop_safety",
      lom: { keywords: ["safety", "workshop"] },
    },
    entries: [
      {
        id: "lesson0001",
        kind: "lesson",
        title: "Before you start",
        blocks: [
          {
            id: "block00001",
            category: "text",
            variant: "paragraph",
            items: [
              {
                id: "item000001",
                kind: "content",
                text: '<p>Read <a href="https://example.org/guide">the guide</a>.</p>',
              },
            ],
            ext: { "org.example.plugin": { note: "stays out of the package" } },
          },
        ],
      },
    ],
    media: [
      { id: "media00001", key: "cover.jpg", variantKey: "cover-small.jpg", source: "upload" },
      { id: "media00002", key: "diagram.svg", source: "upload" },
    ],
    ext: { "org.example.plugin": { secret: "author-only" } },
  };
}

export const stubMedia: Record<string, Uint8Array> = {
  "cover-small.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
  "diagram.svg": bytes(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n',
  ),
};

export function stubInput(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    course: stubCourse(),
    player: stubPlayer(),
    exporter: scorm12Exporter({ typicalLearningTime: "PT20M" }),
    media: (key) => stubMedia[key],
    fonts: nodeFonts,
    packageVersion: 3,
    ...overrides,
  };
}
