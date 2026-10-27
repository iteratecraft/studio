// Question views shared by knowledge checks and quiz lessons (ENG-05): single choice, multiple
// response, fill-in and matching (by dragging, or by drop-down lists), answered locally and marked
// after submit (blocks-interactions.md 4, UI-BLOCKS-R20 to R23, R28 and R29).
import type { MatchPair, Question, Response } from "@course-suite/format";
import { accentReadable, isCorrect, SURFACE, shuffle } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
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
  options: {
    shuffleChoices?: boolean;
    /** The question's picture, audio or video (questionMedia), shown under the prompt. */
    media?: HTMLElement | undefined;
  } = {},
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
  /** Where the answer controls sit; a matching board has its own. */
  let area: HTMLElement | undefined;
  /** The control that takes focus first: a matching board's in its order. */
  let first = (): HTMLElement | undefined => controls[0]?.input;
  /** A matching board's own controls follow lock and reset. */
  let locked = (_on: boolean) => {};

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
    // Matching (UI-BLOCKS-R28, 2.12): by dragging a match onto its item, with the drop-down lists,
    // one per item, as the other way. The lists hold the answer in both ways. A column is shuffled
    // unless the author keeps it in order.
    instruction = labels["question.matchDrag"];
    const order = (column: "prompts" | "matches") =>
      question.freezeColumn === column ? question.pairs : shuffle(question.pairs);
    const matches = order("matches");
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
    const board = matchBoard(
      question.pairs,
      order("prompts"),
      matches,
      controls,
      labels,
      (text) => {
        hint.textContent = text;
      },
    );
    area = board.element;
    first = board.first;
    locked = board.lock;
    fill = (value) => {
      if (typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Readonly<Record<string, string>>;
      question.pairs.forEach((pair, i) => {
        const control = controls[i];
        if (control && Object.hasOwn(record, pair.id)) control.input.value = record[pair.id] ?? "";
      });
      board.sync();
    };
  }

  const hint = h("p", { class: "hint", id: hintId }, instruction);
  const element = h(
    "fieldset",
    { class: "question", "aria-labelledby": promptId, "aria-describedby": hintId },
    h("div", { class: "prompt", id: promptId }, richText(question.prompt, labels)),
    options.media,
    hint,
    area ?? h("div", { class: "choices" }, ...controls.map((control) => control.row)),
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
      locked(true);
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
      locked(false);
      accepted.hidden = true;
      first()?.focus();
    },

    needAnswer() {
      hint.classList.add("is-needed");
      first()?.focus();
    },
  };
}

interface MatchBoard {
  element: HTMLElement;
  /** The item to focus first, or the first drop-down when the learner chose them. */
  first(): HTMLElement | undefined;
  lock(on: boolean): void;
  /** Shows the drop-downs' values on the board. */
  sync(): void;
}

/**
 * The matching board (UI-BLOCKS-R28, blocks-interactions.md 4): the items in one column, the
 * matches in the other. Dragging a match onto an item, or picking one and then one of the other
 * column (Space or a click), pairs the two; Up and Down move in a column, Left and Right cross to
 * the other, Escape lets go of a pick, Enter submits. Pairing sets the item's drop-down, which
 * holds the answer either way; a button switches to the drop-downs and back.
 */
function matchBoard(
  pairs: readonly MatchPair[],
  prompts: readonly MatchPair[],
  matches: readonly MatchPair[],
  controls: Control[],
  labels: Labels,
  instruct: (text: string) => void,
): MatchBoard {
  const text = (html: string) => richText(html, labels).textContent ?? "";
  const button = (cls: string, pair: MatchPair, ...content: Node[]) =>
    h(
      "button",
      {
        type: "button",
        class: cls,
        "aria-pressed": "false",
        draggable: "true",
        "data-pair": pair.id,
      },
      ...content,
    );
  const slots = pairs.map(() => h("span", { class: "match-slot" }));
  const items = pairs.map((pair, i) => {
    // The space keeps the item and its slot apart in the button's name.
    const item = button(
      "match-item",
      pair,
      h("span", {}, text(pair.prompt)),
      document.createTextNode(" "),
      slots[i] as Node,
    );
    controls[i]?.row.prepend(item);
    return item;
  });
  const rows = prompts.map((pair) => controls[pairs.indexOf(pair)]?.row as HTMLElement);
  const column = h(
    "div",
    { class: "match-items", role: "group", "aria-label": labels["question.items"] },
    ...rows,
  );
  const ordered = rows.map((row) => row.querySelector(".match-item") as HTMLButtonElement);
  const tiles = matches.map((pair) =>
    button("match-tile", pair, document.createTextNode(text(pair.match))),
  );
  const board = h(
    "div",
    { class: "match-board" },
    column,
    h(
      "div",
      { class: "match-tiles", role: "group", "aria-label": labels["question.matches"] },
      ...tiles,
    ),
  );
  const mode = h("button", { type: "button", class: "match-mode" }, labels["question.useLists"]);
  const status = h("p", { class: "visually-hidden", role: "status" });
  const byId = new Map(pairs.map((pair) => [pair.id, pair]));
  const listOf = (b: HTMLElement) => (b.classList.contains("match-tile") ? tiles : ordered);
  let picked: HTMLButtonElement | undefined;
  let dragged: HTMLButtonElement | undefined;
  let isLocked = false;

  const pick = (b: HTMLButtonElement | undefined) => {
    picked = b;
    for (const one of [...ordered, ...tiles]) one.setAttribute("aria-pressed", String(one === b));
  };
  const sync = () => {
    pairs.forEach((_pair, i) => {
      const chosen = byId.get(controls[i]?.input.value ?? "");
      (slots[i] as HTMLElement).textContent = chosen
        ? formatLabel(labels, "question.matchedWith", { match: text(chosen.match) })
        : labels["question.notMatched"];
      items[i]?.classList.toggle("is-matched", chosen !== undefined);
    });
  };
  /** Pairs an item with a match, whichever was taken first. */
  const join = (a: HTMLButtonElement, b: HTMLButtonElement) => {
    const [item, tile] = a.classList.contains("match-item") ? [a, b] : [b, a];
    const i = items.indexOf(item);
    const control = controls[i];
    const pair = pairs[i];
    const match = byId.get(tile.dataset.pair ?? "");
    pick(undefined);
    if (!control || !pair || !match) return;
    control.input.value = match.id;
    sync();
    status.textContent = formatLabel(labels, "sr.matched", {
      item: text(pair.prompt),
      match: text(match.match),
    });
  };
  const choose = (b: HTMLButtonElement) => {
    if (isLocked) return;
    if (!picked || picked === b) pick(picked ? undefined : b);
    else if (listOf(picked) === listOf(b)) pick(b);
    else join(picked, b);
  };
  const target = (event: Event) =>
    (event.target as Element).closest<HTMLButtonElement>(".match-item, .match-tile") ?? undefined;

  board.addEventListener("click", (event) => {
    const b = target(event);
    if (b) choose(b);
  });
  board.addEventListener("keydown", (event) => {
    const b = target(event);
    if (!b) return;
    const list = listOf(b);
    const other = list === tiles ? ordered : tiles;
    const i = list.indexOf(b);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowUp") next = list[Math.max(0, i - 1)];
    else if (event.key === "ArrowDown") next = list[Math.min(list.length - 1, i + 1)];
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      next = other[Math.min(i, other.length - 1)];
    } else if (event.key === "Escape" && picked) {
      pick(undefined);
      event.stopPropagation();
    } else return;
    event.preventDefault();
    next?.focus();
  });
  // One tab stop per column: the button last focused in it.
  const rove = (list: HTMLButtonElement[], current: HTMLButtonElement | undefined) => {
    for (const one of list) one.tabIndex = one === current ? 0 : -1;
  };
  rove(ordered, ordered[0]);
  rove(tiles, tiles[0]);
  board.addEventListener("focusin", (event) => {
    const b = target(event);
    if (b) rove(listOf(b), b);
  });

  // Dragging: a match onto an item's row, or an item onto a match.
  const dropOn = (event: DragEvent) => {
    const element = event.target as Element;
    const b =
      element.closest<HTMLButtonElement>(".match-tile") ??
      element.closest(".match")?.querySelector<HTMLButtonElement>(".match-item");
    return b && dragged && listOf(b) !== listOf(dragged) ? b : undefined;
  };
  board.addEventListener("dragstart", (event) => {
    dragged = isLocked ? undefined : target(event);
    if (!dragged) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", dragged.dataset.pair ?? "");
  });
  board.addEventListener("dragover", (event) => {
    if (dropOn(event)) event.preventDefault();
  });
  board.addEventListener("drop", (event) => {
    const b = dropOn(event);
    if (!b || !dragged) return;
    event.preventDefault();
    join(dragged, b);
  });
  board.addEventListener("dragend", () => {
    dragged = undefined;
  });
  // A drop-down the learner changed.
  board.addEventListener("change", sync);

  mode.addEventListener("click", () => {
    const lists = board.classList.toggle("is-lists");
    mode.textContent = labels[lists ? "question.useDrag" : "question.useLists"];
    instruct(labels[lists ? "question.match" : "question.matchDrag"]);
    pick(undefined);
  });
  sync();

  return {
    element: h("div", { class: "match-area" }, board, mode, status),
    first: () =>
      board.classList.contains("is-lists")
        ? (column.querySelector("select") ?? undefined)
        : ordered.find((b) => b.tabIndex === 0),
    lock(on) {
      isLocked = on;
      pick(undefined);
      for (const b of [...ordered, ...tiles]) {
        b.disabled = on;
        b.draggable = !on;
      }
      if (!on) sync(); // a retry cleared the lists
    },
    sync,
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
  const text =
    question.feedbackMode === "any"
      ? question.feedback
      : (chosen ?? (correct ? question.correctFeedback : question.incorrectFeedback));
  return [
    h("p", { class: "outcome" }, labels[correct ? "question.correct" : "question.incorrect"]),
    ...(text ? [richText(text, labels)] : []),
  ];
}

/**
 * The author's colours for right and wrong marks (blocks-interactions.md 2.12, 2.13; rise.md 3I):
 * each one only where it keeps 4.5:1 on the white card, as the marks are text; otherwise the
 * player's own.
 */
export function answerColors(
  element: HTMLElement,
  correct: string | undefined,
  incorrect: string | undefined,
): void {
  if (correct && accentReadable(correct, SURFACE)) element.style.setProperty("--correct", correct);
  if (incorrect && accentReadable(incorrect, SURFACE)) {
    element.style.setProperty("--wrong", incorrect);
  }
}

/**
 * Runs `answer` when the learner presses the check's submit button, or Enter in an answer field
 * (blocks-interactions.md 4 "Enter submits, also with focus on a choice or the fill-in field").
 * Not through form submission, which a sandboxed frame without allow-forms blocks: the editor's
 * preview, and some LMS frames.
 */
export function onAnswer(form: HTMLFormElement, answer: () => void): void {
  form.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("button[type=submit]")) return;
    event.preventDefault();
    answer();
  });
  form.addEventListener("keydown", (event) => {
    const field =
      event.target instanceof HTMLInputElement ||
      (event.target instanceof Element && event.target.closest(".match-board"));
    if (event.key !== "Enter" || !field) return;
    event.preventDefault();
    answer();
  });
}
