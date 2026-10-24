// Progress engine (ENG-05, M1-11; rise.md §3 F, G and I, rules 5, 6, 13, 14 and 16;
// blocks-interactions.md UI-BLOCKS-R25 to R27, R31, R35 to R38, R41, R43 and R44). No DOM, so the
// preview, the web and every LMS compute progress the same way. Its state is keyed by stable ids and
// is what the resume codec stores.
import type {
  Block,
  Course,
  LessonEntry,
  Question,
  QuizEntry,
  QuizResult,
  Response,
  Score,
} from "@course-suite/format";
import { drawAttempt, quizResult, scoreAttempt } from "@course-suite/format";
import type { ResumeState } from "@course-suite/tracking";
import { type Page, pagesOf } from "./route.js";

/**
 * What a continue block waits for before it can be pressed (UI-BLOCKS-R44): nothing, the block
 * directly above, or every block since the previous continue block.
 */
export type Requirement = "none" | "block-above" | "all-above";

export const isContinue = (block: Block) =>
  block.category === "divider" && block.variant === "continue";

/** `variantSettings.completionType` of a continue block; empty or unknown is none. */
export function requirement(block: Block): Requirement {
  const value = block.variantSettings?.completionType;
  return value === "block-above" || value === "all-above" ? value : "none";
}

/** A knowledge check that must be answered right before anything below it shows (UI-BLOCKS-R25). */
export const requiresCorrect = (block: Block) =>
  block.category === "knowledge-check" && block.variantSettings?.requireCorrect === true;

/** Holds back every block below it until it is done (rule 13, UI-BLOCKS-R25 and R43). */
const isGate = (block: Block) => isContinue(block) || requiresCorrect(block);

/**
 * Blocks a continue block can wait for, by `category/variant`: each is finished by an interaction,
 * not by being seen (UI-BLOCKS-R45). Buttons and attachments never are (UI-BLOCKS-R19). Audio,
 * video and slide-app blocks join when their blocks and settings exist.
 */
const REQUIRABLE = new Set([
  "interactive/accordion",
  "interactive/tabs",
  "interactive/labeled-graphic",
  "interactive/process",
  "interactive/sorting",
  "interactive/scenario",
  "interactive/flashcard-grid",
  "interactive/flashcard-stack",
  "list/checkbox",
  "gallery/carousel",
]);

/** Finished by an action (pressing, answering, opening every part), not by being seen. */
const needsAction = (block: Block) =>
  isContinue(block) ||
  block.category === "knowledge-check" ||
  REQUIRABLE.has(`${block.category}/${block.variant}`);

/** How a page shows in the outline. */
export type PageStatus = "not-started" | "in-progress" | "done" | "failed" | "locked";

export interface Attempt {
  /** The questions of the attempt in the order shown (draws and shuffling applied). */
  questions: Question[];
  answers: Readonly<Record<string, Response>>;
}

export interface QuizState extends QuizResult {
  /** Percent scores of the finished attempts, oldest first. */
  scores: readonly number[];
  /** The attempt in progress. */
  attempt?: Attempt;
  /** Retake pressed and the new attempt not started yet: the quiz shows its start screen. */
  reset: boolean;
}

export interface Progress {
  readonly pages: readonly Page[];
  /** Lessons open only in order (rule 14). */
  readonly restricted: boolean;

  /** How many blocks of a lesson show: up to and including the first gate not yet passed. */
  shownBlocks(lesson: LessonEntry): number;
  /** The learner sees the page: its shown blocks count as viewed (UI-BLOCKS-R46). */
  view(page: Page): void;
  /** A continue block was pressed. */
  pressContinue(lesson: LessonEntry, block: Block): void;
  /** A knowledge check was answered; a required one is done only when the answer is right. */
  answerCheck(lesson: LessonEntry, block: Block, response: Response, correct: boolean): void;
  /** Whether a continue block's requirement is met (UI-BLOCKS-R44). */
  continueReady(lesson: LessonEntry, block: Block): boolean;
  /** The saved response to a question: knowledge checks and the quiz attempt in progress. */
  response(questionId: string): Response | undefined;
  isDone(id: string): boolean;

  /** Completed blocks ÷ blocks, or answered ÷ questions in a quiz attempt, in whole percent (rule 5). */
  percent(page: Page): number;
  /** Completed lessons ÷ lessons, in whole percent (rule 5). */
  coursePercent(): number;
  /** Every lesson and quiz is done (rule 6 with the default threshold of 100, rule 16). */
  courseDone(): boolean;
  status(page: Page): PageStatus;
  /** The earlier page the learner must finish before this one opens. */
  lockedBy(page: Page): Page | undefined;
  /** Learner mark-done: free navigation, allowed by the author, lessons only (rise.md §3 F). */
  canMarkDone(page: Page): boolean;
  markDone(page: Page): void;

  quiz(quiz: QuizEntry): QuizState;
  /** Starts a new attempt: draws from banks and shuffles once; the order is saved (ENG-05). */
  startAttempt(quiz: QuizEntry, random?: () => number): Attempt;
  answerQuestion(quiz: QuizEntry, question: Question, response: Response): void;
  /** Ends the attempt: unanswered questions are wrong (rule 15); pass or fail is set now (UI-BLOCKS-R33). */
  submitAttempt(quiz: QuizEntry): Score;
  /** Retake pressed: the quiz goes back to not started (UI-BLOCKS-R35). */
  resetQuiz(quiz: QuizEntry): void;
  /** Skip ahead after a pass: the pages between count as done (UI-BLOCKS-R41). */
  skipAhead(quiz: QuizEntry): Page | undefined;
  /** Time used in the attempt in progress, in milliseconds. */
  elapsed(quiz: QuizEntry): number;
  setElapsed(quiz: QuizEntry, ms: number): void;

  /** The state to save, without the location. */
  snapshot(): ResumeState;
}

/** A progress engine for `course`, resumed from `state` (pruned of ids the course no longer has). */
export function createProgress(course: Course, state: ResumeState = {}): Progress {
  const pages = pagesOf(course);
  const restricted =
    course.navigation?.restricted === true ||
    pages.some((page) => page.kind === "quiz" && page.settings?.skipAhead !== undefined);
  const done = new Set(state.done);
  const viewed = new Map(
    Object.entries(state.visited ?? {}).map(([id, ids]) => [id, new Set(ids)]),
  );
  const answers = new Map(Object.entries(state.answers ?? {}));
  const draws = new Map(Object.entries(state.draws ?? {}).map(([id, ids]) => [id, [...ids]]));
  const scores = new Map(Object.entries(state.attempts ?? {}).map(([id, s]) => [id, [...s]]));
  // The quiz timer's time used, in whole seconds by quiz id.
  const elapsed = new Map(
    Object.entries(state.variables ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );

  const questionsById = new Map<string, Question>();
  for (const page of pages) {
    if (page.kind !== "quiz") continue;
    for (const question of page.questions) {
      if (question.kind !== "draw") questionsById.set(question.id, question);
      else for (const { question: copy } of question.pool) questionsById.set(copy.id, copy);
    }
  }

  const seen = (lesson: LessonEntry, block: Block) => viewed.get(lesson.id)?.has(block.id) === true;
  const counts = (lesson: LessonEntry, block: Block) =>
    done.has(block.id) || (seen(lesson, block) && !isGate(block));
  const finished = (lesson: LessonEntry, block: Block) =>
    done.has(block.id) || (seen(lesson, block) && !needsAction(block));

  function shownBlocks(lesson: LessonEntry): number {
    const gate = lesson.blocks.findIndex((block) => isGate(block) && !done.has(block.id));
    return gate === -1 ? lesson.blocks.length : gate + 1;
  }

  function view(page: Page): void {
    if (page.kind !== "lesson") return;
    const ids = viewed.get(page.id) ?? new Set<string>();
    for (const block of page.blocks.slice(0, shownBlocks(page))) ids.add(block.id);
    viewed.set(page.id, ids);
    // A lesson without gates is done as soon as it is seen (rise.md §3 G).
    if (page.blocks.every((block) => counts(page, block))) done.add(page.id);
  }

  const attemptOf = (quiz: QuizEntry): Attempt | undefined => {
    const ids = draws.get(quiz.id);
    if (!ids?.length) return undefined;
    const questions = ids.map((id) => questionsById.get(id));
    // A draw that names a question this course no longer has is drawn again.
    if (questions.some((question) => question === undefined)) return undefined;
    return {
      questions: questions as Question[],
      answers: Object.fromEntries(ids.flatMap((id) => answerEntry(id))),
    };
  };
  const answerEntry = (id: string): [string, Response][] => {
    const response = answers.get(id);
    return response === undefined ? [] : [[id, response]];
  };

  function quiz(entry: QuizEntry): QuizState {
    const list = scores.get(entry.id) ?? [];
    const attempt = attemptOf(entry);
    return {
      ...quizResult(list, entry.settings),
      scores: list,
      reset: draws.get(entry.id)?.length === 0,
      ...(attempt ? { attempt } : {}),
    };
  }

  /** A quiz is done once finished, and once passed when passing is required (UI-BLOCKS-R36, R37). */
  function quizDone(entry: QuizEntry): boolean {
    const state = quiz(entry);
    if (state.scores.length === 0 || state.attempt || state.reset) return false;
    return state.passed || entry.settings?.requirePassing !== true;
  }

  const pageDone = (page: Page) => done.has(page.id);

  /** Holds back the pages after it even under free navigation (UI-BLOCKS-R26, R38). */
  const holdsBack = (page: Page) =>
    page.kind === "lesson"
      ? !done.has(page.id) &&
        page.blocks.some((block) => requiresCorrect(block) && !done.has(block.id))
      : page.settings?.requirePassing === true && !quiz(page).passed;

  function lockedBy(page: Page): Page | undefined {
    if (pageDone(page)) return undefined;
    const earlier = pages.slice(0, pages.indexOf(page));
    return earlier.find((other) => (restricted ? !pageDone(other) : holdsBack(other)));
  }

  function percent(page: Page): number {
    if (pageDone(page)) return 100;
    if (page.kind === "quiz") {
      const attempt = attemptOf(page);
      if (!attempt) return 0;
      const answered = attempt.questions.filter((question) =>
        Object.hasOwn(attempt.answers, question.id),
      ).length;
      return Math.round((answered * 100) / attempt.questions.length);
    }
    if (page.blocks.length === 0) return 0;
    const count = page.blocks.filter((block) => counts(page, block)).length;
    return Math.round((count * 100) / page.blocks.length);
  }

  const updateQuiz = (entry: QuizEntry) => {
    if (quizDone(entry)) done.add(entry.id);
    else done.delete(entry.id);
  };

  function skipAhead(entry: QuizEntry): Page | undefined {
    const target = pages.find((page) => page.id === entry.settings?.skipAhead?.entry);
    const from = pages.indexOf(entry);
    const to = target ? pages.indexOf(target) : -1;
    if (!target || to <= from || !quiz(entry).passed) return undefined;
    for (const page of pages.slice(from + 1, to)) done.add(page.id);
    return target;
  }

  return {
    pages,
    restricted,
    shownBlocks,
    view,

    pressContinue(lesson, block) {
      done.add(block.id);
      view(lesson);
    },

    answerCheck(lesson, block, response, correct) {
      if (block.question) answers.set(block.question.id, response);
      if (correct || !requiresCorrect(block)) done.add(block.id);
      view(lesson);
    },

    continueReady(lesson, block) {
      const index = lesson.blocks.indexOf(block);
      const kind = requirement(block);
      if (kind === "none" || index <= 0) return true;
      if (kind === "block-above") return finished(lesson, lesson.blocks[index - 1] as Block);
      const before = lesson.blocks.slice(0, index);
      const start = before.findLastIndex(isContinue) + 1;
      return before.slice(start).every((other) => finished(lesson, other));
    },

    response: (id) => answers.get(id),
    isDone: (id) => done.has(id),
    percent,

    coursePercent() {
      if (pages.length === 0) return 0;
      return Math.round((pages.filter(pageDone).length * 100) / pages.length);
    },

    courseDone: () => pages.length > 0 && pages.every(pageDone),

    status(page) {
      if (page.kind === "quiz") {
        const state = quiz(page);
        if (!state.attempt && !state.reset && state.scores.length > 0 && !state.passed) {
          return "failed";
        }
      }
      if (pageDone(page)) return "done";
      if (lockedBy(page)) return "locked";
      return percent(page) > 0 || (page.kind === "quiz" && quiz(page).attempt)
        ? "in-progress"
        : "not-started";
    },

    lockedBy,

    canMarkDone: (page) =>
      page.kind === "lesson" &&
      !restricted &&
      course.navigation?.learnerMarkDone === true &&
      !pageDone(page),

    markDone(page) {
      done.add(page.id);
    },

    quiz,

    startAttempt(entry, random) {
      const questions = drawAttempt(entry, random);
      for (const question of questions) answers.delete(question.id);
      draws.set(
        entry.id,
        questions.map((question) => question.id),
      );
      elapsed.delete(entry.id);
      updateQuiz(entry);
      return { questions, answers: {} };
    },

    answerQuestion(entry, question, response) {
      if (draws.get(entry.id)?.includes(question.id)) answers.set(question.id, response);
    },

    submitAttempt(entry) {
      const attempt = attemptOf(entry);
      const score = scoreAttempt(attempt?.questions ?? [], attempt?.answers ?? {});
      scores.set(entry.id, [...(scores.get(entry.id) ?? []), score.percent]);
      for (const question of attempt?.questions ?? []) answers.delete(question.id);
      draws.delete(entry.id);
      elapsed.delete(entry.id);
      updateQuiz(entry);
      const skip = entry.settings?.skipAhead;
      if (skip && !skip.learnerChooses) skipAhead(entry);
      return score;
    },

    resetQuiz(entry) {
      draws.set(entry.id, []);
      elapsed.delete(entry.id);
      updateQuiz(entry);
    },

    skipAhead,

    elapsed: (entry) => (elapsed.get(entry.id) ?? 0) * 1000,
    setElapsed(entry, ms) {
      if (draws.get(entry.id)?.length) elapsed.set(entry.id, Math.floor(ms / 1000));
    },

    snapshot() {
      return {
        done: [...done],
        visited: Object.fromEntries([...viewed].map(([id, ids]) => [id, [...ids]])),
        answers: Object.fromEntries(answers),
        draws: Object.fromEntries(draws),
        attempts: Object.fromEntries(scores),
        // shortcut: the quiz timer's seconds ride in `variables`, keyed by quiz id; give them their
        // own field when the resume format next changes.
        variables: Object.fromEntries(elapsed),
      };
    },
  };
}
