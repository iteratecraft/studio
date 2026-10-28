// Block renderers: the continue block and the knowledge checks (M1-10) here, the text and static
// blocks in static.ts (BLK-04). Each renderer reads one block of the course document and returns
// its element, or undefined for a block it cannot show; other block families arrive with their own
// epics.
import type { Block, Course, Response } from "@course-suite/format";
import {
  accentReadable,
  FULL_BLEED,
  isCorrect,
  SURFACE,
  textColor,
  textOn,
  variantSettings,
} from "@course-suite/format";
import type { Labels } from "@course-suite/labels";
import { h } from "./dom.js";
import { fileUrl } from "./hooks.js";
import { INTERACTIVE_RENDERERS } from "./interactive.js";
import {
  attachmentBlock,
  audioBlock,
  codeSnippetBlock,
  embedBlock,
  narrationOf,
  questionMedia,
  videoBlock,
} from "./media.js";
import { answerableCheck, type CheckState, requiresCorrect } from "./progress.js";
import { answerColors, feedback, onAnswer, questionView } from "./question.js";
import { icon, STATIC_RENDERERS, type StaticContext } from "./static.js";
import { themeBackground } from "./theme.js";

/** What a lesson page gives its blocks: progress, gates and saved answers. */
export interface LessonHooks {
  /** Whether a continue block may be pressed now (UI-BLOCKS-R44). */
  continueReady(block: Block): boolean;
  pressContinue(block: Block): void;
  /** A knowledge check was answered. */
  answered(block: Block, response: Response, correct: boolean): void;
  /** The saved response to a question, to show again on return. */
  saved(questionId: string): Response | undefined;
  /** A knowledge check's answer and tries, after `answered` (progress.ts, one rule). */
  check(block: Block): CheckState;
  /** Runs `update` now and after every progress change. */
  watch(update: () => void): void;
  /**
   * An item of a checklist or carousel was done (a box ticked, a slide shown) or undone; or, given
   * the block's own id, a block finished by one action was (audio or video with forward seeking
   * off, played to the end).
   */
  itemDone(block: Block, item: string, isDone?: boolean): void;
  /** Whether a block or an item is done, to show again on return. */
  isDone(id: string): boolean;
  /** Ends the course, as the outline's exit link does: a button block's exit (M2-14). */
  exit?(): void;
}

export interface BlockContext {
  course: Course;
  labels: Labels;
  lesson?: LessonHooks;
  /** Where a media file is, by package media key; the editor's block previews give their own. */
  mediaUrl?: (key: string) => string;
}

type Renderer = (block: Block, context: StaticContext) => HTMLElement | undefined;

const RENDERERS: Record<string, Renderer> = {
  ...STATIC_RENDERERS,
  "divider/continue": continueBlock,
  "knowledge-check/single-choice": check,
  "knowledge-check/multiple-response": check,
  "knowledge-check/fill-in": check,
  "knowledge-check/matching": check,
  // Interactive blocks (M2-14; interactive.ts).
  ...INTERACTIVE_RENDERERS,
  // Multimedia blocks (M2-13; media.ts).
  "multimedia/audio": audioBlock,
  "multimedia/video": videoBlock,
  "multimedia/embed": embedBlock,
  "multimedia/attachment": attachmentBlock,
  "multimedia/code-snippet": codeSnippetBlock,
};

/**
 * The block in its frame, or undefined: padding, content width and a background colour from the
 * block settings, with text, links and controls in white or black on that colour (contrast.ts);
 * the cards of its items white on that colour unless the author made them clear; and its own
 * accent colour where that stays readable.
 */
export function renderBlock(block: Block, context: BlockContext): HTMLElement | undefined {
  const render = RENDERERS[`${block.category}/${block.variant}`];
  const staticContext = { ...context, mediaUrl: context.mediaUrl ?? mediaUrl };
  let content: HTMLElement | undefined;
  try {
    content = render?.(block, staticContext);
  } catch (error) {
    // A block the builder let through but this renderer cannot read must not take the lesson down.
    console.error(`Block ${block.id} could not be shown`, error);
  }
  if (!content) return undefined;
  const { padding, contentWidth, background, textContrast, cardStyle, accentColor } =
    block.settings ?? {};
  const full = FULL_BLEED.has(`${block.category}/${block.variant}`);
  const narration = narrationOf(block, staticContext);
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
    const url = staticContext.mediaUrl(image.variantKey ?? image.key);
    frame.style.backgroundImage = `linear-gradient(${tint}, ${tint}), url("${url}")`;
    frame.style.backgroundSize = "cover";
    frame.style.backgroundPosition = "center";
    // On a picture, buttons are black or white and process controls take the theme colour
    // (UI-BLOCKS-EDITOR-R23, player.css).
    frame.classList.add("has-background", "background-image", dark ? "text-light" : "text-dark");
    if (cardStyle !== "transparent") frame.classList.add("cards-white");
  }
  // Theme colour and tint follow the course theme, with its contrast (UI-BLOCKS-EDITOR-R45).
  const fill =
    background?.kind === "color"
      ? { color: background.color, text: textOn(background.color, textContrast) }
      : themeBackground(block, context.course);
  if (fill) {
    frame.style.backgroundColor = fill.color;
    frame.classList.add("has-background", `text-${fill.text}`);
    // Keep cards white (blocks-editor.md 2.4, W10 step 4): on by default.
    if (cardStyle !== "transparent") frame.classList.add("cards-white");
  }
  if (accentColor) {
    const color = fill?.color ?? SURFACE;
    const cards = frame.classList.contains("cards-white")
      ? [...frame.querySelectorAll<HTMLElement>(".check, .card")]
      : [];
    for (const [element, surface] of [
      [frame, color] as const,
      ...cards.map((card) => [card, SURFACE] as const),
    ]) {
      if (!accentReadable(accentColor, surface)) continue;
      element.style.setProperty("--accent", accentColor);
      element.style.setProperty("--button", accentColor);
      element.style.setProperty("--focus", accentColor);
      const text = textOn(accentColor) === "light" ? "#ffffff" : "#000000";
      element.style.setProperty("--accent-text", text);
      element.style.setProperty("--button-text", text);
    }
  }
  return frame;
}

/** Address of a media file: its path in the package, relative to the index page (see fileUrl). */
export const mediaUrl = (key: string) => fileUrl(`media/${encodeURIComponent(key)}`);

/** A plain-text setting the author typed, when it is set and not blank. */
function authoredText(block: Block, name: string): string | undefined {
  const value = block.variantSettings?.[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** A padlock, drawn on a 24-unit grid. */
const LOCK =
  "M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3zm3 4a2 2 0 0 1 1 3.7V20h-2v-2.3A2 2 0 0 1 12 14z";

/**
 * A continue block: holds back the blocks below until pressed (rise.md rule 13 and §3 G;
 * UI-BLOCKS-R43, R44). While its requirement is not met, a hint line with an icon stands in the
 * button's place, as plain text that screen readers read where it is; the button takes its spot as
 * soon as the requirement is met (UI-BLOCKS-R55, GL7). The author's button label and hint text win
 * over the label set's, and its own colour, with its text on it, width and corners over the theme's
 * (blocks-interactions.md 2.11, M2-16).
 */
function continueBlock(block: Block, { labels, lesson }: BlockContext): HTMLElement {
  const button = h(
    "button",
    { type: "button", class: "continue" },
    authoredText(block, "buttonLabel") ?? labels["lesson.continue"],
  );
  const { color, contrast, width, cornerRadius } = variantSettings<{
    color?: string;
    contrast: "auto" | "light" | "dark";
    width: number;
    cornerRadius?: number;
  }>(block);
  if (color) {
    button.style.setProperty("--button", color);
    button.style.setProperty("--button-text", textColor(color, contrast));
  }
  if (width < 100) button.style.width = `${width}%`;
  if (cornerRadius !== undefined) button.style.setProperty("--button-radius", `${cornerRadius}px`);
  const hint = h(
    "p",
    { class: "continue-hint", hidden: true },
    icon(LOCK, "continue-hint-icon"),
    h("span", {}, authoredText(block, "hintText") ?? labels["lesson.continueLocked"]),
  );
  lesson?.watch(() => {
    const ready = lesson.continueReady(block);
    hint.hidden = ready;
    button.hidden = !ready;
  });
  button.addEventListener("click", () => {
    if (lesson?.continueReady(block)) lesson.pressContinue(block);
  });
  return h("div", { class: "continue-block" }, button, hint);
}

/** The settings of a knowledge check (format variants.ts, M2-15). */
interface CheckSettings {
  reveal: boolean;
  correctColor?: string;
  incorrectColor?: string;
}

/**
 * A knowledge check, answered locally (UI-BLOCKS-R20 to R25, R72): its question with its picture,
 * audio or video; after a wrong answer the right answers are marked only when reveal is on, and a
 * retry is offered while tries remain. A required check says so above itself. Without a lesson
 * (the editor's block previews) retries are unlimited.
 */
function check(block: Block, context: StaticContext): HTMLElement | undefined {
  const { labels, lesson } = context;
  if (!answerableCheck(block)) return undefined;
  const question = block.question;
  const settings = variantSettings<CheckSettings>(block);
  const view = questionView(question, labels, { media: questionMedia(question, context) });
  const result = h("div", { class: "feedback", tabindex: -1, hidden: true });
  const submit = h("button", { type: "submit", class: "button" }, labels["question.check"]);
  const retry = h(
    "button",
    { type: "button", class: "button", hidden: true },
    labels["question.tryAgain"],
  );
  const spent = h("p", { class: "check-spent", hidden: true }, labels["question.noTriesLeft"]);
  const form = h(
    "form",
    { class: "check", novalidate: true },
    requiresCorrect(block)
      ? h("p", { class: "check-notice" }, labels["question.mustAnswer"])
      : undefined,
    view.element,
    result,
    h("div", { class: "actions" }, submit, retry),
    spent,
  );
  answerColors(form, settings.correctColor, settings.incorrectColor);

  const show = (response: Response) => {
    const correct = isCorrect(question, response);
    view.lock(correct || settings.reveal ? "all" : "own");
    result.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
    result.replaceChildren(...feedback(question, response, correct, labels));
    result.hidden = false;
    submit.hidden = true;
    const state = lesson?.check(block);
    retry.hidden = state ? !state.canRetry : correct;
    spent.hidden = !state || correct || state.triesLeft > 0;
  };

  onAnswer(form, () => {
    if (submit.hidden) return;
    const response = view.response();
    if (response === undefined) {
      view.needAnswer();
      return;
    }
    lesson?.answered(block, response, isCorrect(question, response));
    show(response);
    result.focus();
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
