// Question views shared by knowledge checks and quiz lessons (ENG-05): single choice, multiple
// response, fill-in and matching, answered locally and marked after submit (blocks-interactions.md
// UI-BLOCKS-R20 to R23, R28 and R29).
import type { Question, Response } from "@course-suite/format";
import { isCorrect, shuffle } from "@course-suite/format";
import type { Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";

/** After submit: mark every answer, only the learner's own, or nothing (UI-BLOCKS-R20). */
export type Marks = "all" | "own" | "none";

export interface QuestionView {
  /** The prompt, the instruction and the answer controls. */
  element: HTMLFieldSetElement;
  /** What the learner entered, or undefined when nothing is entered. */
  response(): Response | undefined;
  /** Puts a saved response back in the controls. */
  fill(response: Response): void;
  /** Locks the controls and marks them. */
  lock(marks: Marks): void;
  /** Unlocks and clears the controls for another try. */
  reset(): void;
  /** Submitted with nothing entered: the instruction is stressed and focus goes to the controls. */
  needAnswer(): void;
}

interface Control {
  row: HTMLElement;
  input: HTMLInputElement | HTMLSelectElement;
  marks: HTMLElement;
  /** The learner entered something in this row. */
  entered(): boolean;
  /** What the learner entered in this row is right. */
  right(): boolean;
  /** This row is a right answer the learner may have missed (choices). */
  isAnswer: boolean;
  /** What "show every answer" adds to this row. */
  revealed(): Node[];
}

export function questionView(
  question: Question,
  labels: Labels,
  options: { shuffleChoices?: boolean } = {},
): QuestionView {
  const promptId = uid("prompt");
  const hintId = uid("hint");
  const mark = (key: "quiz.yourAnswer" | "quiz.correctAnswer", kind: string, ...more: Node[]) =>
    h("span", { class: `mark mark-${kind}` }, labels[key], ...more);
  const marksSpan = () => h("span", { class: "marks" });
  const accepted = h("div", { class: "accepted", hidden: true });
  let controls: Control[];
  let instruction: string;
  let response: () => Response | undefined;
  let fill: (value: Response) => void;

  if (question.kind === "single-choice" || question.kind === "multiple-response") {
    const multiple = question.kind === "multiple-response";
    instruction = labels[multiple ? "question.chooseAll" : "question.chooseOne"];
    const answers = options.shuffleChoices ? shuffle(question.answers) : question.answers;
    const inputs = answers.map((answer) =>
      h("input", {
        type: multiple ? "checkbox" : "radio",
        name: promptId,
        value: answer.id,
        id: uid("choice"),
      }),
    );
    controls = answers.map((answer, i) => {
      const input = inputs[i] as HTMLInputElement;
      const marks = marksSpan();
      return {
        row: h(
          "div",
          { class: "choice" },
          input,
          h("label", { for: input.id }, richText(answer.text, labels), marks),
        ),
        input,
        marks,
        entered: () => input.checked,
        right: () => answer.correct,
        isAnswer: answer.correct,
        revealed: () => (answer.correct ? [mark("quiz.correctAnswer", "correct")] : []),
      };
    });
    response = () => {
      const ids = inputs.filter((input) => input.checked).map((input) => input.value);
      if (ids.length === 0) return undefined;
      return multiple ? ids : ids[0];
    };
    fill = (value) => {
      const ids = new Set(typeof value === "string" ? [value] : Array.isArray(value) ? value : []);
      for (const input of inputs) input.checked = ids.has(input.value);
    };
  } else if (question.kind === "fill-in") {
    instruction = labels["question.typeAnswer"];
    const input = h("input", {
      type: "text",
      id: uid("answer"),
      autocomplete: "off",
      "aria-labelledby": promptId,
    });
    controls = [
      {
        row: h("div", { class: "fill-in" }, input),
        input,
        marks: marksSpan(),
        entered: () => input.value.trim() !== "",
        right: () => isCorrect(question, input.value),
        isAnswer: false,
        revealed: () => [],
      },
    ];
    (controls[0] as Control).row.append((controls[0] as Control).marks);
    response = () => (input.value.trim() === "" ? undefined : input.value);
    fill = (value) => {
      if (typeof value === "string") input.value = value;
    };
    accepted.append(
      h("p", { class: "accepted-title" }, labels["question.acceptedAnswers"]),
      h("ul", {}, ...question.acceptedAnswers.map((answer) => h("li", {}, answer))),
    );
  } else {
    // One drop-down per item: the keyboard and screen-reader form of matching (UI-BLOCKS-R28).
    instruction = labels["question.match"];
    const matches = shuffle(question.pairs);
    controls = question.pairs.map((pair) => {
      const select = h(
        "select",
        { id: uid("match") },
        h("option", { value: "" }, labels["question.chooseMatch"]),
        ...matches.map((other) =>
          h("option", { value: other.id }, richText(other.match, labels).textContent ?? ""),
        ),
      );
      const marks = marksSpan();
      return {
        row: h(
          "div",
          { class: "match" },
          h("label", { for: select.id }, richText(pair.prompt, labels)),
          select,
          marks,
        ),
        input: select,
        marks,
        entered: () => select.value !== "",
        right: () => select.value === pair.id,
        isAnswer: false,
        revealed: () =>
          select.value === pair.id
            ? []
            : [
                mark(
                  "quiz.correctAnswer",
                  "correct",
                  document.createTextNode(": "),
                  richText(pair.match, labels),
                ),
              ],
      };
    });
    response = () => {
      const chosen = question.pairs.flatMap((pair, i) => {
        const value = controls[i]?.input.value;
        return value ? [[pair.id, value] as const] : [];
      });
      return chosen.length === 0 ? undefined : Object.fromEntries(chosen);
    };
    fill = (value) => {
      if (typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Readonly<Record<string, string>>;
      question.pairs.forEach((pair, i) => {
        const control = controls[i];
        if (control && Object.hasOwn(record, pair.id)) control.input.value = record[pair.id] ?? "";
      });
    };
  }

  const hint = h("p", { class: "hint", id: hintId }, instruction);
  const element = h(
    "fieldset",
    { class: "question", "aria-labelledby": promptId, "aria-describedby": hintId },
    h("div", { class: "prompt", id: promptId }, richText(question.prompt, labels)),
    hint,
    h("div", { class: "choices" }, ...controls.map((control) => control.row)),
    accepted,
  );

  return {
    element,
    response: () => response(),
    fill: (value) => fill(value),

    lock(marks) {
      for (const control of controls) {
        const own = marks !== "none" && control.entered();
        const right = control.right();
        control.input.disabled = true;
        control.row.classList.toggle("is-selected", control.entered());
        control.row.classList.toggle(
          "is-correct",
          (own && right) || (marks === "all" && control.isAnswer),
        );
        control.row.classList.toggle("is-wrong", own && !right);
        control.marks.replaceChildren(
          ...(own ? [mark("quiz.yourAnswer", "chosen")] : []),
          ...(marks === "all" ? control.revealed() : []),
        );
      }
      // UI-BLOCKS-R20, R21: the accepted answers show when all is revealed or the answer is right.
      accepted.hidden = !(marks === "all" || (marks === "own" && isCorrect(question, response())));
      hint.classList.remove("is-needed");
    },

    reset() {
      for (const control of controls) {
        control.input.disabled = false;
        if (control.input instanceof HTMLInputElement && control.input.type !== "text") {
          control.input.checked = false;
        } else control.input.value = "";
        control.row.classList.remove("is-selected", "is-correct", "is-wrong");
        control.marks.replaceChildren();
      }
      accepted.hidden = true;
      controls[0]?.input.focus();
    },

    needAnswer() {
      hint.classList.add("is-needed");
      controls[0]?.input.focus();
    },
  };
}

/**
 * The feedback: the outcome word first, then the author's text for any response, for the outcome,
 * or for the chosen answer in by-choice mode (UI-BLOCKS-R23).
 */
export function feedback(
  question: Question,
  response: Response | undefined,
  correct: boolean,
  labels: Labels,
): Node[] {
  const chosen =
    question.kind === "single-choice" && question.feedbackMode === "perAnswer"
      ? question.answers.find((answer) => answer.id === response)?.feedback
      : undefined;
  const text = chosen ?? (correct ? question.correctFeedback : question.incorrectFeedback);
  return [
    h("p", { class: "outcome" }, labels[correct ? "question.correct" : "question.incorrect"]),
    ...(text ? [richText(text, labels)] : []),
  ];
}
