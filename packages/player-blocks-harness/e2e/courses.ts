// Small courses for the progress, quiz and lifecycle browser tests, written by hand.
import type {
  Block,
  Course,
  LessonEntry,
  QuizEntry,
  QuizQuestion,
  QuizSettings,
} from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";

export const paragraph = (id: string, text: string): Block => ({
  id,
  category: "text",
  variant: "paragraph",
  items: [{ id: `i${id.slice(1)}`, kind: "content", text: `<p>${text}</p>` }],
});

export const continueBlock = (id: string, completion?: "above" | "all-above"): Block => ({
  id,
  category: "divider",
  variant: "continue",
  ...(completion ? { variantSettings: { completion } } : {}),
});

/** A single-choice knowledge check whose right answer is "Yes". */
export const check = (id: string, prompt: string, requireCorrect = false): Block => ({
  id,
  category: "knowledge-check",
  variant: "single-choice",
  ...(requireCorrect ? { variantSettings: { requireCorrect } } : {}),
  question: {
    id: `q${id.slice(1)}`,
    kind: "single-choice",
    prompt: `<p>${prompt}</p>`,
    answers: [
      { id: `y${id.slice(1)}`, text: "Yes", correct: true },
      { id: `n${id.slice(1)}`, text: "No", correct: false },
    ],
  },
});

export const lesson = (id: string, title: string, ...blocks: Block[]): LessonEntry => ({
  id,
  kind: "lesson",
  title,
  blocks,
});

/** Three questions: single choice ("Brown"), fill-in ("on") and matching. */
export function quizQuestions(): QuizQuestion[] {
  return [
    {
      id: "qsingle001",
      kind: "single-choice",
      prompt: "<p>Is cardboard a green or a brown?</p>",
      correctFeedback: "<p>Cardboard is dry.</p>",
      incorrectFeedback: "<p>Cardboard is dry, so it is a brown.</p>",
      answers: [
        { id: "abrown0001", text: "Brown", correct: true },
        { id: "agreen0001", text: "Green", correct: false },
      ],
    },
    {
      id: "qfillin001",
      kind: "fill-in",
      prompt: "<p>Keep the lid ___ when it rains.</p>",
      acceptedAnswers: ["on", "closed"],
    },
    {
      id: "qmatch0001",
      kind: "matching",
      prompt: "<p>Match each material to its kind.</p>",
      pairs: [
        { id: "pgrass0001", prompt: "Grass cuttings", match: "Green" },
        { id: "pleaves001", prompt: "Dry leaves", match: "Brown" },
      ],
    },
  ];
}

export const quiz = (
  id: string,
  title: string,
  settings: QuizSettings = {},
  questions: QuizQuestion[] = quizQuestions(),
): QuizEntry => ({ id, kind: "quiz", title, settings, questions });

export const course = (entries: Course["entries"], extra: Partial<Course> = {}): Course => ({
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost check",
  entries,
  media: [],
  ...extra,
});
