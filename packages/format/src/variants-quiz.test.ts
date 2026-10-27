// Knowledge-check settings and quiz rules of the format (M2-15, BLK-07; blocks-interactions.md
// 2.12, 2.13; rise.md 3C, 3I, rule 16).
import { describe, expect, test } from "vitest";
import { minimalCourse, quizCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import type { Block, LessonEntry } from "./course.js";
import { validateCourse } from "./validate.js";
import { variantSettings } from "./variants.js";

const CHECK = "/entries/0/blocks/0";
const checks = () => (quizCourse().entries[0] as LessonEntry).blocks;

describe("knowledge checks and quizzes (M2-15)", () => {
  test("[rise:3C] [rise:3I] the quiz course, with every question type as a check and in a quiz, is valid", () => {
    const course = quizCourse();
    expect(validateCourse(course)).toEqual([]);
    const kinds = checks().flatMap((block) => (block.question ? [block.question.kind] : []));
    expect(kinds).toEqual(["single-choice", "multiple-response", "fill-in", "matching"]);
  });

  test("UI-BLOCKS-R24 UI-BLOCKS-R25: a check's settings default to not required, unlimited retries and reveal on", () => {
    const plain = checks()[4] as Block;
    expect(variantSettings(plain)).toEqual({ requireCorrect: false, reveal: true });
    expect(variantSettings(checks()[0] as Block)).toEqual({
      requireCorrect: true,
      retries: 1,
      reveal: false,
    });
  });

  test.each([
    ["an unknown setting", `${CHECK}/variantSettings/shuffle`, true, "/variantSettings/shuffle"],
    ["a negative retry limit", `${CHECK}/variantSettings/retries`, -1, "/variantSettings/retries"],
    [
      "a colour that is not hex",
      `${CHECK}/variantSettings/correctColor`,
      "green",
      "/variantSettings/correctColor",
    ],
    ["a question of another type", `${CHECK}/question/kind`, "multiple-response", "/question/kind"],
  ])("%s is refused", (_name, path, value, at) => {
    const errors = validateCourse(edit(quizCourse(), path, value));
    expect(errors.map((error) => error.path)).toContain(`${CHECK}${at}`);
  });

  test("a check of a question type without its question is refused", () => {
    const course = quizCourse();
    delete (course.entries[0] as LessonEntry).blocks[0]?.question;
    expect(validateCourse(course)).toEqual([{ path: `${CHECK}/question`, message: "is required" }]);
  });

  test("[rise:R16] a microlearning holds no quiz", () => {
    const quiz = quizCourse().entries[1];
    const course = { ...minimalCourse(), kind: "microlearning" as const, entries: [quiz] };
    expect(validateCourse(course)).toContainEqual({
      path: "/entries/0/kind",
      message: "must not be a quiz in a microlearning",
    });
  });

  test("[rise:3I] a skip button label is text of 1 to 100 characters", () => {
    const path = "/entries/1/settings/skipAhead";
    const course = (label: string) =>
      edit(quizCourse(), path, { entry: "lessafter1", learnerChooses: true, buttonLabel: label });
    expect(validateCourse(course("Skip to the end"))).toEqual([]);
    expect(validateCourse(course("")).map((error) => error.path)).toEqual([`${path}/buttonLabel`]);
  });
});
