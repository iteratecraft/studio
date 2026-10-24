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

export const continueBlock = (
  id: string,
  completionType?: "block-above" | "all-above",
  text: { buttonLabel?: string; hintText?: string } = {},
): Block => ({
  id,
  category: "divider",
  variant: "continue",
  ...(completionType || text.buttonLabel || text.hintText
    ? { variantSettings: { ...(completionType ? { completionType } : {}), ...text } }
    : {}),
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

const svg = (id: string, key: string) => ({
  id,
  key,
  source: "upload" as const,
  mimeType: "image/svg+xml",
  width: 640,
  height: 360,
});

/** One lesson with every block kind the player renders, then a short second lesson. */
export function everyBlockCourse(extra: Partial<Course> = {}): Course {
  const [, fillIn, matching] = quizQuestions();
  const text = (id: string, variant: string, item: { title?: string; text?: string }): Block => ({
    id,
    category: "text",
    variant,
    items: [{ id: `i${id.slice(1)}`, kind: "content", ...item }],
  });
  const asCheck = (id: string, question: QuizQuestion): Block => ({
    id,
    category: "knowledge-check",
    variant: question.kind,
    question: { ...question, id: `q${id.slice(1)}` } as never,
  });
  return course(
    [
      lesson(
        "lessonall1",
        "Every block",
        text("theading01", "heading", { title: "Before you start" }),
        text("tsubhead01", "subheading", { title: "What you need" }),
        paragraph("tparagra01", 'A bin, a <a href="https://example.com/">guide</a> and scraps.'),
        text("tparahead1", "paragraph-with-heading", {
          title: "Greens",
          text: "<p>Wet, fresh scraps.</p>",
        }),
        text("tparasub01", "paragraph-with-subheading", {
          title: "Browns",
          text: "<p>Dry, woody scraps.</p>",
        }),
        {
          id: "mcentred01",
          category: "image",
          variant: "centered",
          media: [{ key: "bin.svg", alt: "A compost bin with its lid open" }],
        },
        {
          id: "mfullwid01",
          category: "image",
          variant: "full-width",
          media: [{ key: "leaf.svg" }],
        },
        check("kchoice001", "Is a heap alive?"),
        {
          id: "kmulti0001",
          category: "knowledge-check",
          variant: "multiple-response",
          question: {
            id: "qmulti0001",
            kind: "multiple-response",
            prompt: "<p>Which are greens?</p>",
            answers: [
              { id: "apeel00001", text: "Peelings", correct: true },
              { id: "agrass0001", text: "Grass", correct: true },
              { id: "acard00001", text: "Cardboard", correct: false },
            ],
          },
        },
        asCheck("kfillin001", fillIn as QuizQuestion),
        asCheck("kmatch0001", matching as QuizQuestion),
        continueBlock("cgateall01", "all-above"),
        paragraph("tafter0001", "You have seen every block."),
      ),
      lesson("lessonnext", "After every block", paragraph("tnext00001", "The end")),
      quiz("quizall001", "Every question", { timer: { minutes: 5, learnerCanHide: true } }),
    ],
    {
      media: [svg("mediabin01", "bin.svg"), svg("medialeaf1", "leaf.svg")],
      publish: { standard: "web", exitLink: true },
      ...extra,
    },
  );
}
