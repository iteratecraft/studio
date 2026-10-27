// Question editing rules shared by knowledge checks and quiz lessons (M2-15, BLK-07;
// blocks-interactions.md 2.12, A6, A15, W10, W11): new questions with sample content, switching a
// question to another type, and the limits of answer and pair lists. No React, so unit tests run
// them in Node.js.
import type { Answer, Question } from "@course-suite/format";
import { plainText } from "@course-suite/format";
import type { StringKey, Translate } from "@course-suite/ui";
import { inlineHtml } from "./fields.js";

export type QuestionKind = Question["kind"];

/** The four question types, in the order their menus list them. */
export const QUESTION_KINDS: readonly QuestionKind[] = [
  "single-choice",
  "multiple-response",
  "fill-in",
  "matching",
];

/** What each type is called: the knowledge-check block's name. */
export const KIND_LABEL: Record<QuestionKind, StringKey> = {
  "single-choice": "variant.knowledge-check.single-choice",
  "multiple-response": "variant.knowledge-check.multiple-response",
  "fill-in": "variant.knowledge-check.fill-in",
  matching: "variant.knowledge-check.matching",
};

/** Up to 10 accepted answers and 10 pairs (blocks-interactions.md 2.12); choices need 2. */
export const MAX_ACCEPTED = 10;
export const MAX_PAIRS = 10;
export const MIN_ANSWERS = 2;
export const MIN_PAIRS = 2;

const prompt = (t: Translate, key: StringKey) => `<p>${inlineHtml(t(key))}</p>`;
const answer = (id: () => string, text: string, correct: boolean): Answer => ({
  id: id(),
  text,
  correct,
});

/** Sample matching pairs: words and their opposites, from the string catalogue. */
const samplePairs = (id: () => string, t: Translate) =>
  (
    [
      ["sample.match1", "sample.match1b"],
      ["sample.match2", "sample.match2b"],
      ["sample.match3", "sample.match3b"],
    ] as const
  ).map(([item, match]) => ({
    id: id(),
    prompt: inlineHtml(t(item)),
    match: inlineHtml(t(match)),
  }));

/**
 * A new question of `kind` with sample content (W7, W11 step 3), its feedback one message for any
 * answer (2.12 default).
 */
export function newQuestion(kind: QuestionKind, id: () => string, t: Translate): Question {
  const right = inlineHtml(t("sample.right"));
  const wrong = inlineHtml(t("sample.wrong"));
  const feedbackMode = "any";
  switch (kind) {
    case "single-choice":
      return {
        id: id(),
        kind,
        feedbackMode,
        prompt: prompt(t, "sample.choicePrompt"),
        answers: [answer(id, right, true), answer(id, wrong, false)],
      };
    case "multiple-response":
      return {
        id: id(),
        kind,
        feedbackMode,
        prompt: prompt(t, "sample.responsePrompt"),
        answers: [answer(id, right, true), answer(id, right, true), answer(id, wrong, false)],
      };
    case "fill-in":
      return {
        id: id(),
        kind,
        feedbackMode,
        prompt: prompt(t, "sample.fillPrompt"),
        acceptedAnswers: [t("sample.fillAnswer")],
      };
    case "matching":
      return {
        id: id(),
        kind,
        feedbackMode,
        prompt: prompt(t, "sample.matchPrompt"),
        pairs: samplePairs(id, t),
      };
  }
}

/** What every type has: its id, prompt, media, feedback and extension data. */
function common(question: Question) {
  const { id, prompt, media, feedbackMode, feedback, correctFeedback, incorrectFeedback, ext } =
    question;
  return {
    id,
    prompt,
    ...(media && { media }),
    // Feedback per answer choice is for single choice only (2.12).
    ...(feedbackMode && feedbackMode !== "perAnswer" && { feedbackMode }),
    ...(feedback !== undefined && { feedback }),
    ...(correctFeedback !== undefined && { correctFeedback }),
    ...(incorrectFeedback !== undefined && { incorrectFeedback }),
    ...(ext && { ext }),
  };
}

/** The texts a question offers as answers: choices, accepted answers or the items of its pairs. */
function texts(question: Question): { text: string; correct: boolean }[] {
  switch (question.kind) {
    case "single-choice":
    case "multiple-response":
      return question.answers.map(({ text, correct }) => ({ text, correct }));
    case "fill-in":
      return question.acceptedAnswers.map((text) => ({ text: inlineHtml(text), correct: true }));
    case "matching":
      return question.pairs.map(({ prompt }, i) => ({ text: prompt, correct: i === 0 }));
  }
}

/**
 * The question as type `kind` (blocks-interactions.md 2.12 "switching keeps the answers"): the
 * prompt, media and feedback stay; choices keep their texts and right answers (single choice keeps
 * the first right one), padded with a sample wrong answer to two; a fill-in accepts the right
 * answers' texts; a matching question starts from sample pairs the author then replaces (2.12
 * "matching then needs its pairs added"). Per-answer feedback is single choice's only.
 */
export function convertQuestion(
  question: Question,
  kind: QuestionKind,
  id: () => string,
  t: Translate,
): Question {
  if (kind === question.kind) return question;
  const base = common(question);
  const offered = texts(question);
  switch (kind) {
    case "single-choice":
    case "multiple-response": {
      const answers: Answer[] = (
        question.kind === "single-choice" || question.kind === "multiple-response"
          ? question.answers
          : offered.map(({ text, correct }) => answer(id, text, correct))
      ).map((one) => ({ ...one }));
      while (answers.length < MIN_ANSWERS) {
        answers.push(answer(id, inlineHtml(t("sample.wrong")), false));
      }
      if (kind === "single-choice") {
        const first = Math.max(
          0,
          answers.findIndex((one) => one.correct),
        );
        for (const [i, one] of answers.entries()) one.correct = i === first;
      } else if (!answers.some((one) => one.correct)) (answers[0] as Answer).correct = true;
      return { ...base, kind, answers };
    }
    case "fill-in": {
      const accepted = [
        ...new Set(
          offered
            .filter((one) => one.correct)
            .map((one) => plainText(one.text))
            .filter(Boolean),
        ),
      ].slice(0, MAX_ACCEPTED);
      return {
        ...base,
        kind,
        acceptedAnswers: accepted.length > 0 ? accepted : [t("sample.fillAnswer")],
      };
    }
    case "matching":
      return { ...base, kind, pairs: samplePairs(id, t) };
  }
}
