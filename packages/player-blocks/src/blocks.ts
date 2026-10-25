// Walking-skeleton block renderers (M1-10): text, heading, image, continue and the knowledge checks.
// Each renderer reads one block of the course document and returns its element, or undefined for a
// block it cannot show; other block families arrive with their own epics.
import type { Block, ContentItem, Course, Response } from "@course-suite/format";
import { isCorrect } from "@course-suite/format";
import type { Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";
import { fileUrl } from "./hooks.js";
import { requiresCorrect } from "./progress.js";
import { feedback, questionView } from "./question.js";

/** What a lesson page gives its blocks: progress, gates and saved answers. */
export interface LessonHooks {
  /** Whether a continue block may be pressed now (UI-BLOCKS-R44). */
  continueReady(block: Block): boolean;
  pressContinue(block: Block): void;
  /** A knowledge check was answered. */
  answered(block: Block, response: Response, correct: boolean): void;
  /** The saved response to a question, to show again on return. */
  saved(questionId: string): Response | undefined;
  /** Runs `update` now and after every progress change. */
  watch(update: () => void): void;
}

export interface BlockContext {
  course: Course;
  labels: Labels;
  lesson?: LessonHooks;
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
  "divider/continue": continueBlock,
  "knowledge-check/single-choice": check,
  "knowledge-check/multiple-response": check,
  "knowledge-check/fill-in": check,
  "knowledge-check/matching": check,
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
  const frame = h(
    "div",
    { class: `block block-${block.category}`, "data-block": block.id },
    h(
      "div",
      { class: full ? "block-inner width-full" : `block-inner width-${contentWidth ?? "medium"}` },
      content,
    ),
  );
  // Through the style object, not a style attribute, which a page's content security policy may
  // refuse (the editor's preview runs under the desktop app's policy, ENG-13).
  if (padding) {
    frame.style.paddingTop = `${padding.top}px`;
    frame.style.paddingBottom = `${padding.bottom}px`;
  }
  return frame;
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

/** Address of a media file: its path in the package, relative to the index page (see fileUrl). */
export const mediaUrl = (key: string) => fileUrl(`media/${encodeURIComponent(key)}`);

/** A plain-text setting the author typed, when it is set and not blank. */
function authoredText(block: Block, name: string): string | undefined {
  const value = block.variantSettings?.[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * A continue block: holds back the blocks below until pressed, and stays inactive with a hint
 * while its requirement is not met (rise.md rule 13 and §3 G; UI-BLOCKS-R43, R44). The author's
 * button label and hint text win over the label set's.
 */
function continueBlock(block: Block, { labels, lesson }: BlockContext): HTMLElement {
  const hintId = uid("hint");
  const button = h(
    "button",
    { type: "button", class: "continue" },
    authoredText(block, "buttonLabel") ?? labels["lesson.continue"],
  );
  const hint = h(
    "p",
    { class: "continue-hint", id: hintId, hidden: true },
    authoredText(block, "hintText") ?? labels["lesson.continueLocked"],
  );
  lesson?.watch(() => {
    const ready = lesson.continueReady(block);
    hint.hidden = ready;
    if (ready) {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-describedby");
    } else {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-describedby", hintId);
    }
  });
  button.addEventListener("click", () => {
    if (lesson?.continueReady(block)) lesson.pressContinue(block);
  });
  return h("div", { class: "continue-block" }, button, hint);
}

/**
 * A knowledge check, answered locally (UI-BLOCKS-R20, R23 to R25). Reveal is on and retries are
 * unlimited, the defaults of the block. A required check says so above itself.
 */
function check(block: Block, { labels, lesson }: BlockContext): HTMLElement | undefined {
  const question = block.question;
  if (!question || block.variant !== question.kind) return undefined;
  const view = questionView(question, labels);
  const result = h("div", { class: "feedback", tabindex: -1, hidden: true });
  const submit = h("button", { type: "submit", class: "button" }, labels["question.check"]);
  const retry = h(
    "button",
    { type: "button", class: "button", hidden: true },
    labels["question.tryAgain"],
  );
  const form = h(
    "form",
    { class: "check", novalidate: true },
    requiresCorrect(block)
      ? h("p", { class: "check-notice" }, labels["question.mustAnswer"])
      : undefined,
    view.element,
    result,
    h("div", { class: "actions" }, submit, retry),
  );

  const show = (response: Response) => {
    const correct = isCorrect(question, response);
    view.lock("all");
    result.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
    result.replaceChildren(...feedback(question, response, correct, labels));
    result.hidden = false;
    submit.hidden = true;
    retry.hidden = correct; // UI-BLOCKS-R24: only after a wrong answer
    return correct;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const response = view.response();
    if (response === undefined) {
      view.needAnswer();
      return;
    }
    const correct = show(response);
    result.focus();
    lesson?.answered(block, response, correct);
  });

  retry.addEventListener("click", () => {
    result.hidden = true;
    result.replaceChildren();
    retry.hidden = true;
    submit.hidden = false;
    view.reset();
  });

  const saved = lesson?.saved(question.id);
  if (saved !== undefined) {
    view.fill(saved);
    show(saved);
  }
  return form;
}
