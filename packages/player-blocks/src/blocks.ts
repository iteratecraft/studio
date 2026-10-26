// Walking-skeleton block renderers (M1-10): text, heading, image, continue and the knowledge checks.
// Each renderer reads one block of the course document and returns its element, or undefined for a
// block it cannot show; other block families arrive with their own epics.
import type { Block, ContentItem, Course, Response } from "@course-suite/format";
import { accentReadable, isCorrect, SURFACE, textOn } from "@course-suite/format";
import type { Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";
import { fileUrl } from "./hooks.js";
import {
  attachmentBlock,
  audioBlock,
  embedBlock,
  galleryBlock,
  imageBlock,
  type MediaContext,
  narrationOf,
  videoBlock,
} from "./media.js";
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
  /** A block that needs an action is done: a carousel seen through, a locked video played. */
  completed(block: Block): void;
}

export interface BlockContext {
  course: Course;
  labels: Labels;
  lesson?: LessonHooks;
  /** Where a media file is, by package media key; the editor's block previews give their own. */
  mediaUrl?: (key: string) => string;
}

type Renderer = (block: Block, context: BlockContext) => HTMLElement | undefined;

/** What the media blocks need, from a block's context. */
const media =
  (render: (block: Block, context: MediaContext) => HTMLElement | undefined): Renderer =>
  (block, { course, labels, lesson, mediaUrl: url = mediaUrl }) =>
    render(block, {
      course,
      labels,
      url,
      ...(lesson && { completed: (done: Block) => lesson.completed(done) }),
    });

const RENDERERS: Record<string, Renderer> = {
  "text/paragraph": (block, { labels }) => textBlock(block, labels, undefined),
  "text/paragraph-with-heading": (block, { labels }) => textBlock(block, labels, 2),
  "text/paragraph-with-subheading": (block, { labels }) => textBlock(block, labels, 3),
  "text/heading": (block, { labels }) => headingBlock(block, labels, 2),
  "text/subheading": (block, { labels }) => headingBlock(block, labels, 3),
  "divider/continue": continueBlock,
  "knowledge-check/single-choice": check,
  "knowledge-check/multiple-response": check,
  "knowledge-check/fill-in": check,
  "knowledge-check/matching": check,
  // Media blocks (M2-13).
  "image/centered": media(imageBlock),
  "image/full-width": media(imageBlock),
  "image/image-text": media(imageBlock),
  "image/text-on-image": media(imageBlock),
  "image/banner": media(imageBlock),
  "gallery/carousel": media(galleryBlock),
  "gallery/grid-2": media(galleryBlock),
  "gallery/grid-3": media(galleryBlock),
  "gallery/grid-4": media(galleryBlock),
  "multimedia/audio": media(audioBlock),
  "multimedia/video": media(videoBlock),
  "multimedia/embed": media(embedBlock),
  "multimedia/attachment": media(attachmentBlock),
};

/**
 * The block in its frame, or undefined: padding, content width and a background colour from the
 * block settings, with text, links and controls in white or black on that colour (contrast.ts);
 * the cards of its items white on that colour unless the author made them clear; and its own
 * accent colour where that stays readable.
 */
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
  const { padding, contentWidth, background, textContrast, cardStyle, accentColor } =
    block.settings ?? {};
  const full = block.variant === "full-width" || block.variant === "banner";
  const narration = media(narrationOf)(block, context);
  const top = narration && block.settings?.narration?.position === "top";
  const frame = h(
    "div",
    { class: `block block-${block.category}`, "data-block": block.id },
    h(
      "div",
      { class: full ? "block-inner width-full" : `block-inner width-${contentWidth ?? "medium"}` },
      top ? narration : undefined,
      content,
      top ? undefined : narration,
    ),
  );
  // Through the style object, not a style attribute, which a page's content security policy may
  // refuse (the editor's preview runs under the desktop app's policy, ENG-13).
  if (padding) {
    frame.style.paddingTop = `${padding.top}px`;
    frame.style.paddingBottom = `${padding.bottom}px`;
  }
  // An image background with its overlay: a dark one makes the text light, a light one dark
  // (UI-BLOCKS-EDITOR-R22).
  const image =
    background?.kind === "image" &&
    context.course.media.find((media) => media.key === background.image.key);
  if (background?.kind === "image" && image) {
    const dark = background.overlay !== "light";
    const alpha = Math.min(100, Math.max(0, background.opacity ?? 50));
    const tint = dark ? `rgb(0 0 0 / ${alpha}%)` : `rgb(255 255 255 / ${alpha}%)`;
    const url = (context.mediaUrl ?? mediaUrl)(image.variantKey ?? image.key);
    frame.style.backgroundImage = `linear-gradient(${tint}, ${tint}), url("${url}")`;
    frame.style.backgroundSize = "cover";
    frame.style.backgroundPosition = "center";
    frame.classList.add("has-background", dark ? "text-light" : "text-dark");
    if (cardStyle !== "transparent") frame.classList.add("cards-white");
  }
  if (background?.kind === "color") {
    frame.style.backgroundColor = background.color;
    frame.classList.add("has-background", `text-${textOn(background.color, textContrast)}`);
    // Keep cards white (blocks-editor.md 2.4, W10 step 4): on by default.
    if (cardStyle !== "transparent") frame.classList.add("cards-white");
  }
  if (accentColor) {
    const color = background?.kind === "color" ? background.color : SURFACE;
    const cards = frame.classList.contains("cards-white")
      ? [...frame.querySelectorAll<HTMLElement>(".check")]
      : [];
    for (const [element, surface] of [
      [frame, color] as const,
      ...cards.map((card) => [card, SURFACE] as const),
    ]) {
      if (!accentReadable(accentColor, surface)) continue;
      element.style.setProperty("--accent", accentColor);
      element.style.setProperty("--focus", accentColor);
      element.style.setProperty(
        "--accent-text",
        textOn(accentColor) === "light" ? "#ffffff" : "#000000",
      );
    }
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
