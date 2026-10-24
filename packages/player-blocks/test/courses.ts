// Course builders for the player's unit tests (not part of the build).
import type {
  Block,
  Course,
  LessonEntry,
  QuizEntry,
  QuizSettings,
  SingleChoiceQuestion,
} from "@course-suite/format";

let next = 0;
/** A fresh content id with a readable prefix of one letter. */
export const newId = (prefix: string) => `${prefix}${String(++next).padStart(9, "0")}`;

export const text = (): Block => ({ id: newId("t"), category: "text", variant: "paragraph" });

export const continueBlock = (completionType?: "block-above" | "all-above"): Block => ({
  id: newId("c"),
  category: "divider",
  variant: "continue",
  ...(completionType ? { variantSettings: { completionType } } : {}),
});

export function question(): SingleChoiceQuestion {
  return {
    id: newId("q"),
    kind: "single-choice",
    prompt: `<p>Question ${next}</p>`,
    answers: [
      { id: newId("a"), text: "Right", correct: true },
      { id: newId("a"), text: "Wrong", correct: false },
    ],
  };
}

export const check = (requireCorrect = false): Block => ({
  id: newId("k"),
  category: "knowledge-check",
  variant: "single-choice",
  question: question(),
  ...(requireCorrect ? { variantSettings: { requireCorrect } } : {}),
});

export const lesson = (...blocks: Block[]): LessonEntry => ({
  id: newId("l"),
  kind: "lesson",
  title: `Lesson ${next}`,
  blocks,
});

export const quiz = (count: number, settings?: QuizSettings): QuizEntry => ({
  id: newId("z"),
  kind: "quiz",
  title: `Quiz ${next}`,
  questions: Array.from({ length: count }, question),
  ...(settings ? { settings } : {}),
});

export const course = (entries: Course["entries"], extra: Partial<Course> = {}): Course => ({
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Test course",
  entries,
  media: [],
  ...extra,
});

/** The right and the wrong answer id of a test question. */
export const answersOf = (q: { answers: { id: string }[] }) => ({
  right: q.answers[0]?.id as string,
  wrong: q.answers[1]?.id as string,
});
