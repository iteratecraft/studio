// Shared quiz and result model (ENG-05): checking responses, scoring, pass or fail, attempts, draws
// from question banks, and the standard-neutral interaction records an LMS adapter writes out
// (rise.md §3 I, rules 8, 10, 11 and 15; standards.md §4.1).
import type { Answer, Question, QuestionDraw, QuizEntry, QuizSettings } from "./course.js";

/** Passing score in percent when a quiz does not set one. */
export const DEFAULT_PASSING_SCORE = 80;

/**
 * A learner's response: the chosen answer id (single choice), the chosen answer ids (multiple
 * response), the typed text (fill-in), or for matching, the pair id whose match the learner put
 * against each pair's prompt, keyed by that pair's id.
 */
export type Response = string | readonly string[] | Readonly<Record<string, string>>;

/** Whether a response is right. No response, or one of the wrong shape, is wrong (rule 15). */
export function isCorrect(question: Question, response: Response | undefined): boolean {
  switch (question.kind) {
    case "single-choice":
      return (
        typeof response === "string" &&
        question.answers.some((answer) => answer.correct && answer.id === response)
      );
    case "multiple-response": {
      if (!Array.isArray(response)) return false;
      const chosen = new Set<string>(response);
      const correct = question.answers.filter((answer) => answer.correct);
      // A question with no correct answer is invalid (validateCourse); it can never be answered right.
      return (
        correct.length > 0 &&
        chosen.size === correct.length &&
        correct.every((answer) => chosen.has(answer.id))
      );
    }
    case "fill-in": {
      // UI-BLOCKS-R22: capitals are ignored unless the author asks for them.
      const same = (text: string) => typed(text, question.caseSensitive === true);
      return (
        typeof response === "string" &&
        question.acceptedAnswers.some((accepted) => same(accepted) === same(response))
      );
    }
    case "matching":
      return (
        isRecord(response) &&
        question.pairs.every(
          (pair) => Object.hasOwn(response, pair.id) && response[pair.id] === pair.id,
        )
      );
  }
}

/** Typed answers match ignoring surrounding and repeated spaces, and case unless `exact`. */
const typed = (text: string, exact = false) => {
  const spaced = text.normalize("NFC").trim().replace(/\s+/gu, " ");
  return exact ? spaced : spaced.toLowerCase();
};

const isRecord = (value: unknown): value is Readonly<Record<string, string>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface Score {
  correct: number;
  total: number;
  /** 0 to 100, rounded to the nearest whole percent; 0 when there are no questions. */
  percent: number;
}

/** Scores one attempt. `responses` is keyed by question id; a question without one is wrong. */
export function scoreAttempt(
  questions: readonly Question[],
  responses: Readonly<Record<string, Response>>,
): Score {
  const correct = questions.filter((question) =>
    isCorrect(question, Object.hasOwn(responses, question.id) ? responses[question.id] : undefined),
  ).length;
  const total = questions.length;
  return { correct, total, percent: total === 0 ? 0 : Math.round((correct * 100) / total) };
}

/** Whether a score in percent passes the quiz. The rounded percent is compared, as the LMS sees it. */
export function isPassed(percent: number, settings?: QuizSettings): boolean {
  return percent >= (settings?.passingScore ?? DEFAULT_PASSING_SCORE);
}

export interface QuizResult {
  /** The best score so far, 0 to 100 (rule 8): a later, lower score never replaces it. */
  best: number;
  /** Passed on any attempt so far; a later failed attempt never undoes it. */
  passed: boolean;
  /** Attempts the learner may still start; Infinity when retries are unlimited. */
  attemptsLeft: number;
}

/** The result of a quiz from the percent scores of its attempts so far, oldest first. */
export function quizResult(percents: readonly number[], settings?: QuizSettings): QuizResult {
  const best = Math.min(100, Math.max(0, ...percents));
  const allowed = settings?.retries === undefined ? Infinity : 1 + settings.retries;
  return {
    best,
    passed: percents.length > 0 && isPassed(best, settings),
    attemptsLeft: Math.max(0, allowed - percents.length),
  };
}

/**
 * The questions of a new attempt, in order: each draw replaced by its drawn questions, then all of
 * them shuffled when the quiz asks for it. Save their ids with the attempt, so that resuming shows
 * the same questions in the same order.
 */
export function drawAttempt(quiz: QuizEntry, random: () => number = Math.random): Question[] {
  const questions = quiz.questions.flatMap((question) =>
    question.kind === "draw" ? drawFrom(question, random) : [question],
  );
  return quiz.settings?.shuffleQuestions ? shuffle(questions, random) : questions;
}

/** `count` questions from the pool (all of them when unset), in random order. A knowledge check shows the first. */
export function drawFrom(draw: QuestionDraw, random: () => number = Math.random): Question[] {
  const pool = draw.pool.map((copy) => copy.question);
  return shuffle(pool, random).slice(0, draw.count ?? pool.length);
}

/** A shuffled copy (Fisher-Yates). `random` returns a number in [0, 1), like Math.random. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** One answered question as an LMS records it, in no standard's wire format (standards.md §4.1). */
export type Interaction = {
  /** Built by interactionId (rule 11). */
  id: string;
  /** Every question counts the same (rule 10). */
  weighting: 1;
  result: "correct" | "incorrect";
} & (
  | { type: "choice"; response: string[]; correctResponse: string[] }
  | { type: "fill-in"; response: string; correctResponse: string[] }
  | { type: "matching"; response: [string, string][]; correctResponse: [string, string][] }
);

export interface AnswerIdOptions {
  /** Build answer ids for an AICC package, with its fallback for text that is mostly symbols. */
  aicc?: boolean;
}

/**
 * The interaction for a question of a quiz attempt (rules 10 and 11). Choice answers and matching
 * sides are named by answerId of their text; a fill-in response is the text as typed.
 */
export function toInteraction(
  quizTitle: string,
  question: Question,
  response: Response | undefined,
  attempt: number,
  options: AnswerIdOptions = {},
): Interaction {
  const common = {
    id: interactionId(quizTitle, plainText(question.prompt), attempt),
    weighting: 1 as const,
    result: isCorrect(question, response) ? ("correct" as const) : ("incorrect" as const),
  };
  const name = (html: string) => answerId(plainText(html), options);
  switch (question.kind) {
    case "single-choice":
    case "multiple-response": {
      const chosen = new Set<string>(
        typeof response === "string" ? [response] : Array.isArray(response) ? response : [],
      );
      const named = (keep: (answer: Answer) => boolean) =>
        question.answers.filter(keep).map((answer) => name(answer.text));
      return {
        ...common,
        type: "choice",
        response: named((answer) => chosen.has(answer.id)),
        correctResponse: named((answer) => answer.correct),
      };
    }
    case "fill-in":
      return {
        ...common,
        type: "fill-in",
        response: typeof response === "string" ? response : "",
        correctResponse: [...question.acceptedAnswers],
      };
    case "matching": {
      const matches = isRecord(response) ? response : {};
      const byId = new Map(question.pairs.map((pair) => [pair.id, pair]));
      return {
        ...common,
        type: "matching",
        response: question.pairs.flatMap((pair) => {
          const chosen = Object.hasOwn(matches, pair.id)
            ? byId.get(matches[pair.id] ?? "")
            : undefined;
          return chosen ? [[name(pair.prompt), name(chosen.match)] as [string, string]] : [];
        }),
        correctResponse: question.pairs.map((pair) => [name(pair.prompt), name(pair.match)]),
      };
    }
  }
}

/**
 * The start of the text, at most `count` UTF-16 units, never splitting a surrogate pair. An LMS
 * measures ids by JavaScript string length, so a character outside the BMP counts twice.
 */
function take(text: string, count: number): string {
  let taken = "";
  for (const char of text) {
    if (taken.length + char.length > count) break;
    taken += char;
  }
  return taken;
}

/**
 * Interaction id (rule 11): the first 20 characters of the quiz title, "_", the first 230 of the
 * question text, "_", and the attempt number, with spaces turned into underscores. Characters are
 * counted in UTF-16 units, as the LMS counts them. It depends on nothing but the text and the
 * attempt, so it is the same in every publish of the same content, and at most 255 UTF-16 units,
 * the SCORM 1.2 limit (standards.md §4.2). Attempts above 999 use 999.
 */
export function interactionId(quizTitle: string, questionText: string, attempt: number): string {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`attempt must be a whole number from 1, not ${attempt}`);
  }
  const number = Math.min(attempt, 999);
  return `${take(quizTitle, 20)}_${take(questionText, 230)}_${number}`.replace(/\s/gu, "_");
}

/**
 * Answer id (rule 11): the text with every character other than an ASCII letter, a digit or "-_.~"
 * turned into "-". For AICC, text that is empty or had over a quarter of its characters replaced
 * becomes "id-" and the base64 of its UTF-8 bytes.
 */
export function answerId(text: string, options: AnswerIdOptions = {}): string {
  const chars = Array.from(text);
  const kept = chars.map((char) => (/^[A-Za-z0-9._~-]$/.test(char) ? char : "-"));
  const replaced = kept.filter((char, i) => char !== chars[i]).length;
  if (options.aicc && (chars.length === 0 || replaced / chars.length > 0.25)) {
    return `id-${base64(text)}`;
  }
  return kept.join("");
}

// The format package has no DOM or Node typings; both have btoa and TextEncoder as globals.
const web = globalThis as unknown as {
  btoa(binary: string): string;
  TextEncoder: new () => { encode(text: string): Uint8Array };
};

function base64(text: string): string {
  let binary = "";
  for (const byte of new web.TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return web.btoa(binary);
}

const BLOCK_TAG = /^<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|table|tr|td|th)\b/i;
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * The text of a rich-text HTML fragment, with whitespace collapsed: what rule 11 calls the question
 * or answer text. Block tags separate words; inline tags do not.
 */
// shortcut: a regular-expression reader, enough for the fragments our editor writes; switch to an
// HTML parser if rich text starts carrying comments with ">", CDATA or other named entities.
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, (tag) => (BLOCK_TAG.test(tag) ? " " : ""))
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, dec, hex, name) => {
      if (name !== undefined) return (Object.hasOwn(ENTITIES, name) && ENTITIES[name]) || entity;
      const code = Number.parseInt(dec ?? hex, dec ? 10 : 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/gu, " ")
    .trim();
}
