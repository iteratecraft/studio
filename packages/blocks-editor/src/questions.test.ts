// Question editing rules (M2-15): new questions and switching types keep the course valid.
import { applyCommands } from "@course-suite/doc-ops";
import type { Course, LessonEntry, Question } from "@course-suite/format";
import { quizCourse } from "@course-suite/format/test/courses";
import { createTranslator } from "@course-suite/ui";
import { describe, expect, test } from "vitest";
import { idMaker } from "./ids.js";
import { convertQuestion, newQuestion, QUESTION_KINDS } from "./questions.js";

const t = createTranslator("en");

/** The quiz course with its quiz's first question replaced by `question`. */
function withQuestion(course: Course, question: Question) {
  return applyCommands(course, [
    { type: "deleteQuestion", id: "qqzsingle1" },
    { type: "insertQuestion", parent: "quizpond01", index: 0, value: question },
  ]);
}

describe("question types (M2-15)", () => {
  test.each(QUESTION_KINDS)(
    "[rise:3I] blocks-interactions W11: a new %s question is valid in a quiz",
    (kind) => {
      const course = quizCourse();
      const question = { ...newQuestion(kind, idMaker(course), t), id: "qqzsingle1" };
      expect(withQuestion(course, question).ok).toBe(true);
      // blocks-interactions 2.12: feedback starts as one message for any response.
      expect(question.feedbackMode).toBe("any");
    },
  );

  const checks = () => (quizCourse().entries[0] as LessonEntry).blocks.filter((b) => b.question);
  const pairs = QUESTION_KINDS.flatMap((from) => QUESTION_KINDS.map((to) => [from, to] as const));

  test.each(pairs)(
    "blocks-interactions 2.12, A6: a %s check switched to %s stays valid and keeps its prompt, media and id",
    (from, to) => {
      const course = quizCourse();
      const block = checks().find((one) => one.question?.kind === from);
      if (!block?.question) throw new Error(from);
      const next = convertQuestion(block.question, to, idMaker(course), t);
      const result = applyCommands(course, [
        { type: "updateBlock", id: block.id, set: { variant: to, question: next } },
      ]);
      expect(result.ok ? [] : result.errors).toEqual([]);
      expect(next).toMatchObject({
        id: block.question.id,
        kind: to,
        prompt: block.question.prompt,
      });
      expect(next.media).toEqual(block.question.media);
    },
  );

  test("blocks-interactions 2.12: switching keeps the answers and the right ones", () => {
    const course = quizCourse();
    const multiple = checks()[1]?.question as Question;
    const single = convertQuestion(multiple, "single-choice", idMaker(course), t);
    expect(
      single.kind === "single-choice" && single.answers.map((a) => [a.text, a.correct]),
    ).toEqual([
      ["A stickleback", true],
      ["A dragonfly larva", false],
      ["A heron", false],
    ]);
    const fill = convertQuestion(multiple, "fill-in", idMaker(course), t);
    expect(fill.kind === "fill-in" && fill.acceptedAnswers).toEqual([
      "A stickleback",
      "A dragonfly larva",
    ]);
    const back = convertQuestion(fill, "single-choice", idMaker(course), t);
    expect(back.kind === "single-choice" && back.answers.map((a) => a.correct)).toEqual([
      true,
      false,
    ]);
  });

  test("blocks-interactions 2.12: a switch keeps the audio beside the picture; the matching column order goes with matching", () => {
    const course = quizCourse();
    const matching = {
      ...(checks()[3]?.question as Question),
      audio: { key: "croak.mp3" },
      freezeColumn: "matches",
    } as Question;
    const single = convertQuestion(matching, "single-choice", idMaker(course), t);
    expect(single.audio).toEqual({ key: "croak.mp3" });
    expect(single).not.toHaveProperty("freezeColumn");
    expect(withQuestion(course, { ...single, id: "qqzsingle1" }).ok).toBe(true);
  });

  test("per-answer feedback belongs to single choice and is dropped on a switch to another type", () => {
    const course = quizCourse();
    const single = checks()[0]?.question as Question;
    expect(single.feedbackMode).toBe("perAnswer");
    expect(
      convertQuestion(single, "multiple-response", idMaker(course), t).feedbackMode,
    ).toBeUndefined();
  });
});
