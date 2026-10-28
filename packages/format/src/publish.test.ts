// M2-18 (BLK-10, STD-08): the publish settings a course is exported with, what makes them
// incoherent, and the checks before an export.
import { describe, expect, test } from "vitest";
import type { Course, LessonEntry, QuizEntry } from "./course.js";
import { activityIri } from "./ids.js";
import {
  activityIdOf,
  completionThreshold,
  courseChecks,
  exportCourseOf,
  isPackageIdentifier,
  manifestIdentifierOf,
  nextPackageVersion,
  PUBLISH_DEFAULTS,
  publishProblems,
  publishSettingsOf,
} from "./publish.js";
import { validateCourse } from "./validate.js";

const lesson = (id: string, blocks: LessonEntry["blocks"] = []): LessonEntry => ({
  id,
  kind: "lesson",
  title: id,
  blocks,
});
const quiz: QuizEntry = {
  id: "quizaaaaa1",
  kind: "quiz",
  title: "Check",
  settings: { passingScore: 70 },
  questions: [
    {
      id: "questiona1",
      kind: "single-choice",
      prompt: "<p>Pick one</p>",
      answers: [
        { id: "answeraaa1", text: "Yes", correct: true },
        { id: "answeraaa2", text: "No", correct: false },
      ],
    },
  ],
};
const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph",
  items: [{ id: `${id.slice(0, 9)}i`, kind: "content" as const, text }],
});
const course = (extra: Partial<Course> = {}): Course => ({
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Publish",
  entries: [lesson("lessonaaa1", [paragraph("blockaaaa1", "<p>Hello</p>")]), quiz],
  media: [],
  ...extra,
});

describe("publish settings", () => {
  test("[rise:3M] blocks-publish-collab 2.1, 2.2: a course without settings publishes as SCORM 1.2, by lessons viewed, passed/incomplete, LMS-only, with no exit link or reset", () => {
    const settings = publishSettingsOf(course());
    expect(settings).toEqual(PUBLISH_DEFAULTS);
    expect(validateCourse(course({ publish: settings }))).toEqual([]);
  });

  test("UI-PUBCOLLAB-R4: saved settings win over the defaults", () => {
    const settings = publishSettingsOf(
      course({ publish: { standard: "xapi", exitLink: true, lmsOnly: false } }),
    );
    expect(settings).toMatchObject({ standard: "xapi", exitLink: true, lmsOnly: false });
    expect(settings.statusWording).toEqual({ done: "passed", notDone: "incomplete" });
  });

  test("[rise:3M] a microlearning cannot be reported failed, and tracking falls back from a quiz that is gone", () => {
    const micro = course({
      kind: "microlearning",
      entries: [lesson("lessonaaa1")],
      publish: {
        standard: "scorm12",
        statusWording: { done: "completed", notDone: "failed" },
        tracking: { kind: "quiz", quiz: "quizaaaaa1" },
      },
    });
    expect(publishSettingsOf(micro)).toMatchObject({
      statusWording: { done: "completed", notDone: "incomplete" },
      tracking: { kind: "completion" },
    });
  });

  test("[standards:E-5] [standards:C-4] [rise:R12] an export takes the tracked quiz's passing score, and the version after the last export", () => {
    const tracked = course({
      packageVersion: 4,
      publish: {
        standard: "cmi5",
        tracking: { kind: "quiz", quiz: "quizaaaaa1" },
        passingScore: 10,
      },
    });
    expect(exportCourseOf(tracked).publish).toMatchObject({ passingScore: 70 });
    expect(nextPackageVersion(tracked)).toBe(5);
    const byLessons = course({ publish: { standard: "scorm12", passingScore: 10 } });
    expect(exportCourseOf(byLessons).publish?.passingScore).toBeUndefined();
    expect(nextPackageVersion(byLessons)).toBe(1);
    expect(validateCourse(exportCourseOf(tracked))).toEqual([]);
  });

  test("[rise:3M] [rise:R16] a microlearning completes at 100 % viewed, whatever threshold it holds", () => {
    const threshold = { kind: "completion", threshold: 40 } as const;
    const micro = course({
      kind: "microlearning",
      entries: [lesson("lessonaaa1")],
      publish: { standard: "scorm12", tracking: threshold },
    });
    expect(completionThreshold(micro)).toBe(100);
    expect(publishSettingsOf(micro).tracking).toEqual({ kind: "completion" });
    expect(exportCourseOf(micro).publish?.tracking).toEqual({ kind: "completion" });
    expect(
      completionThreshold(course({ publish: { standard: "scorm12", tracking: threshold } })),
    ).toBe(40);
  });

  test("blocks-publish-collab 2.3, UI-PUBCOLLAB-R4: a web package skips the cover by its own setting, LMS packages by the theme's", () => {
    const both = (theme: boolean, web: boolean) =>
      course({
        theme: theme ? { cover: { skip: true, author: false } } : { cover: { author: false } },
        publish: { standard: "web", webSkipCover: web },
      });
    expect(exportCourseOf(both(true, false)).theme?.cover).toEqual({ author: false });
    expect(exportCourseOf(both(false, true)).theme?.cover).toEqual({ author: false, skip: true });
    const lms = (theme: boolean) => ({
      ...both(theme, !theme),
      publish: { standard: "scorm12" as const, webSkipCover: !theme },
    });
    expect(exportCourseOf(lms(true)).theme?.cover?.skip).toBe(true);
    expect(exportCourseOf(lms(false)).theme?.cover?.skip).toBeUndefined();
    expect(validateCourse(exportCourseOf(both(false, true)))).toEqual([]);
  });

  test("[standards:E-6] [standards:E-16] the default identifiers have one owner, which the activity IRIs use", () => {
    const plain = course();
    expect(manifestIdentifierOf(plain)).toBe(`course-${plain.id}`);
    expect(activityIdOf(plain)).toBe(`urn:uuid:${plain.id}`);
    expect(activityIri(plain, "lessonaaa1")).toBe(`${activityIdOf(plain)}/lessonaaa1`);
    const named = course({
      publish: { standard: "xapi", activityId: "https://example.org/c", manifestIdentifier: "m" },
    });
    expect([activityIdOf(named), manifestIdentifierOf(named)]).toEqual([
      "https://example.org/c",
      "m",
    ]);
    expect(activityIri(named)).toBe("https://example.org/c");
  });

  test("[rise:R6] the completion threshold is a whole percent from 1 to 100", () => {
    const at = (threshold: number) =>
      validateCourse(
        course({ publish: { standard: "scorm12", tracking: { kind: "completion", threshold } } }),
      );
    expect(at(50)).toEqual([]);
    expect(at(0)).not.toEqual([]);
    expect(at(101)).not.toEqual([]);
  });
});

describe("incoherent settings", () => {
  test("[standards:E-16] BLK-10: an xAPI or cmi5 identifier is an absolute IRI without spaces or special characters", () => {
    expect(isPackageIdentifier("xapi", "https://example.org/courses/compost")).toBe(true);
    expect(isPackageIdentifier("cmi5", "urn:uuid:3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b")).toBe(true);
    for (const bad of [
      "compost",
      "https://example.org/a b",
      'https://example.org/"x"',
      "<x>:y",
      "",
    ]) {
      expect(isPackageIdentifier("xapi", bad)).toBe(false);
    }
    expect(isPackageIdentifier("scorm12", "course_compost-2")).toBe(true);
    expect(isPackageIdentifier("scorm12", "2-compost")).toBe(false);
    const invalid = course({ publish: { standard: "xapi", activityId: "https://x.org/a b" } });
    expect(publishProblems(invalid)).toEqual([{ setting: "identifier", code: "invalid" }]);
  });

  test("[standards:E-22] STD-08: cmi5 move-on Passed with no quiz deciding a pass is flagged", () => {
    const moveOn = (publish: NonNullable<Course["publish"]>) =>
      publishProblems(course({ publish }));
    expect(moveOn({ standard: "cmi5", moveOn: "Passed" })).toEqual([
      { setting: "moveOn", code: "no-quiz" },
    ]);
    expect(moveOn({ standard: "cmi5", moveOn: "CompletedAndPassed" })).toHaveLength(1);
    expect(moveOn({ standard: "cmi5", moveOn: "CompletedOrPassed" })).toEqual([]);
    expect(
      moveOn({
        standard: "cmi5",
        moveOn: "Passed",
        tracking: { kind: "quiz", quiz: "quizaaaaa1" },
      }),
    ).toEqual([]);
    // Another standard ignores move-on.
    expect(moveOn({ standard: "scorm12", moveOn: "Passed" })).toEqual([]);
  });
});

describe("checks before an export", () => {
  test("UI-PUBCOLLAB-R2, BLK-10: empty lessons and quizzes, links to lessons or blocks that are gone, and pictures without alt text", () => {
    const checked = course({
      media: [
        { id: "mediaaaaa1", key: "leaf.png", mimeType: "image/png", source: "upload" },
        { id: "mediaaaaa2", key: "song.mp3", mimeType: "audio/mpeg", source: "upload" },
      ],
      entries: [
        lesson("lessonaaa1", [
          paragraph(
            "blockaaaa1",
            '<p><a href="#/lessons/lessonaaa2">on</a> <a href="#/lessons/gone000001">gone</a></p>',
          ),
          paragraph(
            "blockaaaa2",
            '<p><a href="#/lessons/lessonaaa1/blockaaaa1">here</a> <a href="#/lessons/lessonaaa1/nothere001">x</a></p>',
          ),
          {
            id: "blockaaaa3",
            category: "image",
            variant: "centered",
            media: [{ key: "leaf.png" }],
          },
          {
            id: "blockaaaa4",
            category: "image",
            variant: "centered",
            media: [{ key: "leaf.png", alt: "" }],
          },
          {
            id: "blockaaaa5",
            category: "multimedia",
            variant: "audio",
            media: [{ key: "song.mp3" }],
          },
        ]),
        lesson("lessonaaa2"),
        { ...quiz, questions: [] },
      ],
    });
    expect(courseChecks(checked)).toEqual([
      { code: "broken-link", entry: "lessonaaa1", target: "#/lessons/gone000001" },
      { code: "broken-link", entry: "lessonaaa1", target: "#/lessons/lessonaaa1/nothere001" },
      { code: "no-alt", entry: "lessonaaa1", key: "leaf.png" },
      { code: "empty", entry: "lessonaaa2" },
      { code: "empty", entry: "quizaaaaa1" },
    ]);
    expect(courseChecks(course())).toEqual([]);
  });
});
