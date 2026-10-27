// Quiz lesson runtime (ENG-05, M1-12; rise.md §3 I, rules 8 and 15; blocks-interactions.md L13 to
// L16, W12, UI-BLOCKS-R29 to R39 and R41): a start screen, one question per screen with immediate
// feedback, results with retakes, require-passing, skip-ahead, a timer that submits at zero, and
// random draws from question banks. Scoring and the saved attempt live in the progress engine.
import type { Question, QuizEntry, QuizSettings } from "@course-suite/format";
import { DEFAULT_PASSING_SCORE, isCorrect, isPassed } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { h, uid } from "./dom.js";
import { answerColors, feedback, type Marks, onAnswer, questionView } from "./question.js";
import { type Page, pageHash } from "./route.js";
import type { Runtime } from "./runtime.js";

export interface QuizContext {
  labels: Labels;
  runtime: Runtime;
  /** The page after the quiz, for the continue-style finish button. */
  next: Page | undefined;
  /** Called after every progress change, so the outline and links follow. */
  refresh(): void;
  /** A question's picture, audio or video, and its audio (media.ts questionMedia). */
  media?: (question: Question) => HTMLElement | undefined;
  /** Says something to screen readers through the page's polite status. */
  announce?: (text: string) => void;
}

export interface QuizView {
  element: HTMLElement;
  /** Stops the timer when the learner leaves the page. */
  stop(): void;
}

export function quizView(
  quiz: QuizEntry,
  { labels, runtime, next, refresh, media, announce }: QuizContext,
): QuizView {
  const { progress } = runtime;
  const settings: QuizSettings = quiz.settings ?? {};
  const element = h("div", { class: "quiz" });
  answerColors(element, settings.correctColor, settings.incorrectColor);
  let timer: Timer | undefined;

  const changed = () => {
    runtime.changed();
    refresh();
  };

  /** A heading for the screen that takes focus, so screen readers hear each new screen. */
  const screen = (text: string, ...content: (Node | undefined)[]) => {
    const heading = h("h2", { class: "quiz-heading", tabindex: -1 }, text);
    element.replaceChildren(heading, ...content.filter((node): node is Node => node !== undefined));
    return heading;
  };

  function show(focus: boolean): void {
    const state = progress.quiz(quiz);
    if (state.attempt) {
      const index = state.attempt.questions.findIndex(
        (q) => !Object.hasOwn(state.attempt?.answers ?? {}, q.id),
      );
      question(Math.max(0, index), focus);
    } else if (state.scores.length > 0 && !state.reset) {
      results(state.scores.at(-1) ?? 0, focus);
    } else start(focus);
  }

  /** The start screen; after an attempt the button says retake (L13, UI-BLOCKS-R35). */
  function start(focus: boolean): void {
    // A quiz with no questions has no attempt to start.
    if (quiz.questions.length === 0) return;
    const retake = progress.quiz(quiz).scores.length > 0;
    const begin = h(
      "button",
      { type: "button", class: "button" },
      labels[retake ? "quiz.retake" : "quiz.begin"],
    );
    // Before the start the intro shows the whole time limit; the clock starts on this button, and
    // screen readers hear the limit once then, not every second (UI-BLOCKS-R59, GL1, GL2).
    const minutes = settings.timer?.minutes;
    begin.addEventListener("click", () => {
      progress.startAttempt(quiz);
      changed();
      question(0, true);
      if (minutes) announce?.(formatLabel(labels, "sr.timerStarted", { minutes }));
    });
    element.replaceChildren(
      ...(minutes
        ? [h("p", { class: "quiz-limit" }, formatLabel(labels, "timer.limit", { minutes }))]
        : []),
      h("div", { class: "actions" }, begin),
    );
    if (focus) begin.focus();
  }

  /** One question per screen with a counter; submit, marks and feedback, then next (UI-BLOCKS-R29, R30). */
  function question(index: number, focus: boolean): void {
    const attempt = progress.quiz(quiz).attempt;
    const current = attempt?.questions[index];
    if (!attempt || !current) {
      show(focus);
      return;
    }
    startTimer(); // a new or resumed attempt
    const total = attempt.questions.length;
    const last = index === total - 1;
    const view = questionView(current, labels, {
      shuffleChoices: settings.shuffleAnswers === true,
      media: media?.(current),
    });
    const result = h("div", { class: "feedback", tabindex: -1, hidden: true });
    const submit = h("button", { type: "submit", class: "button" }, labels["quiz.submit"]);
    const onward = h(
      "button",
      { type: "button", class: "button", hidden: true },
      labels[last ? "quiz.showResults" : "quiz.next"],
    );
    const form = h(
      "form",
      { class: "check", novalidate: true },
      view.element,
      result,
      h("div", { class: "actions" }, submit, onward),
    );
    const heading = screen(
      formatLabel(labels, "quiz.position", { current: index + 1, total }),
      timer?.element,
      form,
    );
    if (focus) heading.focus();

    onAnswer(form, () => {
      if (submit.hidden) return;
      const response = view.response();
      if (response === undefined) {
        view.needAnswer(); // not scored (UI-BLOCKS-R29)
        return;
      }
      const correct = isCorrect(current, response);
      const reveal = settings.revealAnswers ?? "all";
      const marks: Marks =
        reveal === "all" || (reveal === "incorrect" && !correct) ? "all" : "none";
      view.lock(marks);
      if (marks === "all") {
        result.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
        result.replaceChildren(...feedback(current, response, correct, labels));
        result.hidden = false;
      }
      submit.hidden = true;
      onward.hidden = false;
      progress.answerQuestion(quiz, current, response);
      runtime.answered(quiz, current, response);
      if (last)
        finish(); // pass or fail is set now, before the results (UI-BLOCKS-R33)
      else changed(); // the lesson's share rises by one question (UI-BLOCKS-R31)
      (marks === "all" ? result : onward).focus();
    });

    onward.addEventListener("click", () => {
      if (last) show(true);
      else question(index + 1, true);
    });
  }

  function finish(): void {
    timer?.stop();
    timer = undefined;
    const score = progress.submitAttempt(quiz);
    runtime.quizSubmitted(quiz, score.percent);
    refresh();
  }

  /** Passing score, score, pass or fail, retake and the configured controls (L15, UI-BLOCKS-R34, R38, R41). */
  function results(score: number, focus: boolean): void {
    const state = progress.quiz(quiz);
    const passing = settings.passingScore ?? DEFAULT_PASSING_SCORE;
    const passed = isPassed(score, settings);
    const retake = h("button", { type: "button", class: "button" }, labels["quiz.retake"]);
    retake.addEventListener("click", () => {
      progress.resetQuiz(quiz);
      runtime.quizRetried(quiz);
      refresh();
      start(true);
    });
    const target = progress.pages.find((page) => page.id === settings.skipAhead?.entry);
    let skip: HTMLElement | undefined;
    if (state.passed && target && settings.skipAhead?.learnerChooses) {
      skip = h(
        "a",
        { class: "button", href: pageHash(target.id) },
        settings.skipAhead.buttonLabel ??
          formatLabel(labels, "quiz.skipAhead", { lesson: target.title }),
      );
      skip.addEventListener("click", () => {
        progress.skipAhead(quiz);
        changed();
      });
    }
    const onward = state.passed && target && !settings.skipAhead?.learnerChooses ? target : next;
    const heading = screen(
      labels["quiz.results"],
      h("p", {}, formatLabel(labels, "quiz.passingScore", { score: passing })),
      h("p", { class: "quiz-score" }, formatLabel(labels, "quiz.score", { score })),
      h(
        "p",
        { class: `quiz-outcome ${passed ? "is-correct" : "is-wrong"}` },
        labels[passed ? "quiz.passed" : "quiz.failed"],
      ),
      settings.retries === undefined
        ? undefined
        : h(
            "p",
            {},
            state.attemptsLeft > 0
              ? formatLabel(labels, "quiz.attemptsLeft", { count: state.attemptsLeft })
              : labels["quiz.noAttemptsLeft"],
          ),
      settings.requirePassing && !state.passed
        ? h("p", { class: "quiz-must-pass" }, labels["quiz.mustPass"])
        : undefined,
      h(
        "div",
        { class: "actions" },
        state.attemptsLeft > 0 ? retake : undefined, // even after a pass (UI-BLOCKS-R34)
        skip,
        settings.finishButton === "continue" && onward && !progress.lockedBy(onward)
          ? h("a", { class: "continue", href: pageHash(onward.id) }, labels["lesson.continue"])
          : undefined,
      ),
    );
    if (focus) heading.focus();
  }

  // A timed attempt starts its clock with the attempt, or carries on from the saved time (UI-BLOCKS-R39).
  const startTimer = () => {
    const limit = settings.timer && settings.timer.minutes * 60_000;
    if (!limit || timer || !progress.quiz(quiz).attempt) return;
    timer = createTimer(quiz, limit, labels, runtime, () => {
      // Unanswered questions count wrong, and the LMS hears them so (rise.md rule 15).
      const attempt = progress.quiz(quiz).attempt;
      for (const left of attempt?.questions ?? []) {
        if (!Object.hasOwn(attempt?.answers ?? {}, left.id))
          runtime.answered(quiz, left, undefined);
      }
      finish();
      timeUp();
    });
  };

  /** Time is up: the attempt was submitted with unanswered questions wrong (rule 15). */
  function timeUp(): void {
    const ok = h("button", { type: "button", class: "button" }, labels["quiz.showResults"]);
    const textId = uid("time-up");
    const dialog = h(
      "dialog",
      { class: "time-up", "aria-labelledby": textId },
      h("p", { id: textId }, labels["sr.timeUp"]),
      ok,
    );
    ok.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      show(true);
    });
    element.append(dialog);
    dialog.showModal();
  }

  show(false);
  return {
    element,
    stop() {
      timer?.stop();
      timer = undefined;
    },
  };
}

interface Timer {
  element: HTMLElement;
  stop(): void;
}

/** The quiz timer: remaining, elapsed or elapsed-of-total time, which the learner may hide (L16). */
function createTimer(
  quiz: QuizEntry,
  limit: number,
  labels: Labels,
  runtime: Runtime,
  expire: () => void,
): Timer {
  const { progress } = runtime;
  const display = quiz.settings?.timer?.display ?? "remaining";
  const startedAt = Date.now() - progress.elapsed(quiz);
  const time = h("span", { class: "timer-time" });
  const toggle = h(
    "button",
    { type: "button", class: "timer-toggle", "aria-expanded": "true" },
    labels["timer.hide"],
  );
  const element = h(
    "div",
    { class: "timer", role: "timer", "aria-label": labels["timer.title"] },
    time,
    quiz.settings?.timer?.learnerCanHide ? toggle : undefined,
  );
  toggle.addEventListener("click", () => {
    const hide = !time.hidden;
    time.hidden = hide;
    toggle.setAttribute("aria-expanded", String(!hide));
    toggle.textContent = labels[hide ? "timer.show" : "timer.hide"];
  });

  const tick = (expiry: boolean) => {
    const used = Math.min(limit, Date.now() - startedAt);
    progress.setElapsed(quiz, used);
    time.textContent =
      display === "elapsed"
        ? formatLabel(labels, "timer.elapsed", { time: clock(used) })
        : display === "elapsed-of-total"
          ? formatLabel(labels, "timer.elapsedOfTotal", {
              elapsed: clock(used),
              total: clock(limit),
            })
          : formatLabel(labels, "timer.remaining", { time: clock(limit - used) });
    if (expiry && used >= limit) {
      clearInterval(interval);
      expire();
    }
  };
  const interval = setInterval(() => tick(true), 1000);
  tick(false); // the first check is a tick later, once the screen is in place
  return {
    element,
    stop: () => clearInterval(interval),
  };
}

/** Minutes and seconds, as m:ss. */
const clock = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
