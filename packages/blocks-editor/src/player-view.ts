// The player's own drawing of one block, for the lesson editor's block previews (BLK-03): the
// player's block renderer and style sheet, in a shadow root so that neither the editor's styles nor
// the player's reach the other. block-preview.tsx loads it with the first lesson opened.
import type { Block, Course } from "@course-suite/format";
import { resolveLabels } from "@course-suite/labels";
import { renderBlock } from "@course-suite/player-blocks";
import css from "@course-suite/player-blocks/player.css?inline";

// shortcut: learner text in previews is the built-in English set; use the course's label set once a
// course can choose one (BLK-16).
const labels = resolveLabels();
let sheet: CSSStyleSheet | undefined;

/**
 * Draws `block` of `course` in `host`'s shadow root, with `media` giving the address of a media file
 * by its key; returns whether the player shows anything of the block.
 */
export function draw(
  host: HTMLElement,
  block: Block,
  course: Course,
  media: (key: string) => string,
): boolean {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    // The player's page-wide rules (its colours and text) apply to the shadow root's host instead.
    // A constructed sheet, not a <style> element, which the editor's policy refuses.
    sheet.replaceSync(css.replace(/(^|,\s*)(:root|body)(?=[\s,{])/gm, "$1:host"));
  }
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.adoptedStyleSheets = [sheet];
  const element = renderBlock(block, { course, labels, mediaUrl: media });
  root.replaceChildren(...(element ? [element] : []));
  return element !== undefined;
}
