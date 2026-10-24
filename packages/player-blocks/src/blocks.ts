// Walking-skeleton block renderers (M1-10): text, heading, image, continue and the choice knowledge
// checks. Each renderer reads one block of the course document and returns its element, or
// undefined for a block it cannot show; other block families arrive with their own epics.
import type { Block, ContentItem, Course, Question } from "@course-suite/format";
import { isCorrect } from "@course-suite/format";
import type { Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";

export interface BlockContext {
  course: Course;
  labels: Labels;
}

type Renderer = (block: Block, context: BlockContext) => HTMLElement | undefined;

const RENDERERS: Record<string, Renderer> = {
  "text/paragraph": (block, { labels }) => textBlock(block, labels, undefined),
  "text/paragraph-with-heading": (block, { labels }) => textBlock(block, labels, 2),
  "text/paragraph-with-subheading": (block, { labels }) => textBlock(block, labels, 3),
  "text/heading": (block, { labels }) => headingBlock(block, labels, 2),
  "text/subheading": (block, { labels }) => headingBlock(block, labels, 3),
  "image/centered": (block, context) => imageBlock(block, context),
  "image/full-width": (block, context) => imageBlock(block, context),
  // Renders only; holding back the blocks below until it is pressed comes with the progress engine.
  "divider/continue": (_block, { labels }) =>
    h("button", { type: "button", class: "continue" }, labels["lesson.continue"]),
  "knowledge-check/single-choice": (block, { labels }) => choiceCheck(block.question, labels),
  "knowledge-check/multiple-response": (block, { labels }) => choiceCheck(block.question, labels),
};

/** The block in its frame (padding and content width from the block settings), or undefined. */
export function renderBlock(block: Block, context: BlockContext): HTMLElement | undefined {
  const render = RENDERERS[`${block.category}/${block.variant}`];
  let content: HTMLElement | undefined;
  try {
    content = render?.(block, context);
  } catch (error) {
    // A block the builder let through but this renderer cannot read must not take the lesson down.
    console.error(`Block ${block.id} could not be shown`, error);
  }
  if (!content) return undefined;
  const { padding, contentWidth } = block.settings ?? {};
  const full = block.variant === "full-width";
  return h(
    "div",
    {
      class: `block block-${block.category}`,
      "data-block": block.id,
      style: padding
        ? `padding-top:${padding.top}px;padding-bottom:${padding.bottom}px`
        : undefined,
    },
    h(
      "div",
      { class: full ? "block-inner width-full" : `block-inner width-${contentWidth ?? "medium"}` },
      content,
    ),
  );
}

const firstContent = (block: Block): ContentItem | undefined =>
  block.items?.find((item): item is ContentItem => item.kind === "content");

/** Heading level from `variantSettings.headingLevel` (2 to 6), for an accessible outline. */
function headingLevel(block: Block, fallback: number): number {
  const level = block.variantSettings?.headingLevel;
  return typeof level === "number" && Number.isInteger(level) && level >= 2 && level <= 6
    ? level
    : fallback;
}

function heading(level: number, html: string, labels: Labels): HTMLElement {
  return h(`h${level}` as "h2", { class: "block-heading" }, richText(html, labels));
}

function headingBlock(block: Block, labels: Labels, level: number): HTMLElement | undefined {
  const title = firstContent(block)?.title;
  return title ? heading(headingLevel(block, level), title, labels) : undefined;
}

function textBlock(
  block: Block,
  labels: Labels,
  level: number | undefined,
): HTMLElement | undefined {
  const item = firstContent(block);
  if (!item?.text && !item?.title) return undefined;
  return h(
    "div",
    { class: "text" },
    level !== undefined && item.title
      ? heading(headingLevel(block, level), item.title, labels)
      : undefined,
    item.text ? richText(item.text, labels) : undefined,
  );
}

function imageBlock(block: Block, { course }: BlockContext): HTMLElement | undefined {
  const ref = block.media?.[0];
  const entry = ref && course.media.find((media) => media.key === ref.key);
  if (!ref || !entry) return undefined;
  // An empty or missing alt text marks the image as decorative (ADR-0002 MediaRef).
  return h("img", {
    class: "image",
    src: mediaUrl(entry.variantKey ?? entry.key),
    alt: ref.alt ?? "",
    width: entry.width,
    height: entry.height,
    loading: "lazy",
  });
}

/** Path of a media file in the package, relative to the index page. */
export const mediaUrl = (key: string) => `media/${encodeURIComponent(key)}`;

/**
 * A single-choice or multiple-response knowledge check, answered locally (blocks-interactions.md
 * UI-BLOCKS-R20, R23, R24). Reveal is on and retries are unlimited, the defaults of the block.
 */
function choiceCheck(question: Question | undefined, labels: Labels): HTMLElement | undefined {
  if (question?.kind !== "single-choice" && question?.kind !== "multiple-response")
    return undefined;
  const multiple = question.kind === "multiple-response";
  const promptId = uid("prompt");
  const hintId = uid("hint");
  const choices = question.answers.map((answer) => {
    const id = uid("choice");
    const input = h("input", {
      type: multiple ? "checkbox" : "radio",
      name: promptId,
      value: answer.id,
      id,
    });
    const marks = h("span", { class: "marks" });
    const row = h(
      "div",
      { class: "choice" },
      input,
      h("label", { for: id }, richText(answer.text, labels), marks),
    );
    return { answer, input, marks, row };
  });
  const hint = h(
    "p",
    { class: "hint", id: hintId },
    labels[multiple ? "question.chooseAll" : "question.chooseOne"],
  );
  const feedback = h("div", { class: "feedback", tabindex: -1, hidden: true });
  const check = h("button", { type: "submit", class: "button" }, labels["question.check"]);
  const retry = h(
    "button",
    { type: "button", class: "button", hidden: true },
    labels["question.tryAgain"],
  );

  const form = h(
    "form",
    { class: "check", novalidate: true },
    h(
      "fieldset",
      { "aria-labelledby": promptId, "aria-describedby": hintId },
      h("div", { class: "prompt", id: promptId }, richText(question.prompt, labels)),
      hint,
      h("div", { class: "choices" }, ...choices.map((choice) => choice.row)),
    ),
    feedback,
    h("div", { class: "actions" }, check, retry),
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const chosen = choices.filter((choice) => choice.input.checked).map((choice) => choice.answer);
    if (chosen.length === 0) {
      hint.classList.add("is-needed");
      choices[0]?.input.focus();
      return;
    }
    const ids = chosen.map((answer) => answer.id);
    const correct = isCorrect(question, multiple ? ids : ids[0]);
    for (const { answer, input, marks, row } of choices) {
      input.disabled = true;
      const selected = input.checked;
      row.classList.toggle("is-selected", selected);
      row.classList.toggle("is-correct", answer.correct);
      row.classList.toggle("is-wrong", selected && !answer.correct);
      marks.replaceChildren(
        ...(selected ? [h("span", { class: "mark mark-chosen" }, labels["quiz.yourAnswer"])] : []),
        ...(answer.correct
          ? [h("span", { class: "mark mark-correct" }, labels["quiz.correctAnswer"])]
          : []),
      );
    }
    // The outcome word first, then the author's text (UI-BLOCKS-R23).
    const own =
      question.feedbackMode === "perAnswer" && !multiple ? chosen[0]?.feedback : undefined;
    const text = own ?? (correct ? question.correctFeedback : question.incorrectFeedback);
    feedback.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
    feedback.replaceChildren(
      h("p", { class: "outcome" }, labels[correct ? "question.correct" : "question.incorrect"]),
      text ? richText(text, labels) : "",
    );
    feedback.hidden = false;
    check.hidden = true;
    retry.hidden = correct; // UI-BLOCKS-R24: only after a wrong answer
    hint.classList.remove("is-needed");
    feedback.focus();
  });

  retry.addEventListener("click", () => {
    for (const { input, marks, row } of choices) {
      input.disabled = false;
      input.checked = false;
      row.classList.remove("is-selected", "is-correct", "is-wrong");
      marks.replaceChildren();
    }
    feedback.hidden = true;
    feedback.replaceChildren();
    retry.hidden = true;
    check.hidden = false;
    choices[0]?.input.focus();
  });
  return form;
}
