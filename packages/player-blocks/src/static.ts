// The text and static blocks (BLK-04; rise.md 3C; blocks-editor.md 2.5, 2.7 to 2.11, 2.14): text,
// columns and tables, statements and notes, quotes and the quote carousel, lists and checklists,
// images, galleries and dividers. Each renderer reads its variant's settings through the format
// (`variantSettings`, which fills the defaults) and returns the block's element, or undefined when
// the block has nothing to show yet. A checklist and the carousels are finished item by item
// (UI-BLOCKS-R51, R52) through the lesson's hooks.
import type { Block, ContentItem, LessonEntry, MediaRef } from "@course-suite/format";
import { headingLevel, isSafeLink, textOn, variantSettings } from "@course-suite/format";
import { formatLabel, type LabelKey, type Labels } from "@course-suite/labels";
import type { BlockContext } from "./blocks.js";
import { h, linkOut, richText, uid } from "./dom.js";
import { shownItems } from "./progress.js";
import { pagesOf, parseRoute } from "./route.js";

/** What a renderer gets: the block context with the media address resolved. */
export type StaticContext = BlockContext & { mediaUrl: (key: string) => string };
type Renderer = (block: Block, context: StaticContext) => HTMLElement | undefined;
type Contrast = "auto" | "light" | "dark";

const contents = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");
const px = (value: unknown) => `${Number(value)}px`;

const SVG = "http://www.w3.org/2000/svg";
/** A decorative icon drawn from one SVG path on a 24-unit grid. */
function icon(path: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", className);
  const shape = document.createElementNS(SVG, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}
const QUOTE_MARK =
  "M4 18h6v-6H7a3 3 0 0 1 3-3V6a6 6 0 0 0-6 6zm10 0h6v-6h-3a3 3 0 0 1 3-3V6a6 6 0 0 0-6 6z";
const INFO = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z";
const ENLARGE =
  "M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm-1 2v2H7v2h2v2h2v-2h2V9h-2V7z";
const PREVIOUS = "M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z";
const NEXT = "M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z";

/** A media file of the course as an image, or undefined when the index lacks it. */
function picture(
  ref: MediaRef | undefined,
  { course, mediaUrl }: StaticContext,
  className: string,
) {
  const entry = ref && course.media.find((media) => media.key === ref.key);
  if (!ref || !entry) return undefined;
  // An empty or missing alt text marks the image as decorative (ADR-0002 MediaRef).
  return h("img", {
    class: className,
    src: mediaUrl(entry.variantKey ?? entry.key),
    alt: ref.alt ?? "",
    width: entry.width,
    height: entry.height,
    loading: "lazy",
  });
}

/**
 * Zoom on click (blocks-editor.md 2.10, 2.11): the image with a button that shows it enlarged in a
 * modal dialog; Escape or the close button closes it and focus goes back (blocks-interactions.md 4).
 */
function zoomable(image: HTMLImageElement, labels: Labels, zoom: boolean): HTMLElement {
  if (!zoom) return image;
  const close = h("button", { type: "button", class: "zoom-close" }, labels["image.close"]);
  const dialog = h(
    "dialog",
    { class: "zoom-dialog", "aria-label": image.alt || labels["image.enlarge"] },
    // The address as written, not as resolved, so the page reads the same wherever it is opened.
    h("img", { class: "zoom-image", src: image.getAttribute("src") ?? "", alt: image.alt }),
    close,
  );
  const open = h(
    "button",
    { type: "button", class: "zoom-open" },
    icon(ENLARGE, "icon"),
    h("span", { class: "visually-hidden" }, labels["image.enlarge"]),
  );
  const show = () => {
    if (!dialog.open) dialog.showModal();
    close.focus();
  };
  open.addEventListener("click", show);
  image.addEventListener("click", show);
  close.addEventListener("click", () => dialog.close());
  // A press on the backdrop, outside the dialog's box, closes it too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  image.classList.add("zoomable");
  return h("div", { class: "zoom-frame" }, image, open, dialog);
}

function heading(level: number, html: string, labels: Labels, space?: unknown): HTMLElement {
  const element = h(`h${level}` as "h2", { class: "block-heading" }, richText(html, labels));
  if (space !== undefined) element.style.marginBottom = px(space);
  return element;
}

/** The blocks of the lesson that holds `block`; the block alone when it is shown on its own. */
function lessonBlocks(block: Block, { course }: StaticContext): readonly Block[] {
  const lesson = course.entries.find(
    (entry): entry is LessonEntry =>
      entry.kind === "lesson" && entry.blocks.some((other) => other.id === block.id),
  );
  return lesson?.blocks ?? [block];
}

/**
 * Text (2.5): a heading at the author's level (2 to 6, so the lesson title stays the only level 1),
 * a body text in one to three columns, or both.
 */
const text =
  (body: boolean): Renderer =>
  (block, context) => {
    const { labels } = context;
    const item = contents(block)[0];
    const s = variantSettings<{ columns: number; headingSpace: number }>(block);
    const level = headingLevel(block);
    const title =
      level !== undefined && item?.title
        ? heading(level, item.title, labels, body ? s.headingSpace : undefined)
        : undefined;
    const main =
      body && item?.text
        ? h("div", { class: `text-body text-columns-${s.columns}` }, richText(item.text, labels))
        : undefined;
    return title || main ? h("div", { class: "text" }, title, main) : undefined;
  };

/** Columns (2.5): two to four columns of text, each with an optional image above it. */
const columns: Renderer = (block, context) => {
  const s = variantSettings<{ columns: number; images: boolean; zoom: boolean }>(block);
  const shown = contents(block).slice(0, s.columns);
  if (shown.every((item) => !item.text && !(s.images && item.media))) return undefined;
  return h(
    "div",
    { class: `columns columns-${s.columns}` },
    ...shown.map((item) => {
      const image = s.images ? picture(item.media, context, "image") : undefined;
      return h(
        "div",
        { class: "column" },
        image && zoomable(image, context.labels, s.zoom),
        item.text
          ? h("div", { class: "text-body" }, richText(item.text, context.labels))
          : undefined,
      );
    }),
  );
};

/**
 * Table (2.5): the author's table with its header row in the accent colour, in a region that
 * scrolls sideways on its own, so the page never does (WCAG 1.4.10).
 */
const table: Renderer = (block, { labels }) => {
  const html = contents(block)[0]?.text;
  const body = html ? richText(html, labels) : undefined;
  if (!body?.querySelector("table")) return undefined;
  const { cellPadding } = variantSettings<{ cellPadding: string }>(block);
  return h(
    "div",
    {
      class: `table-wrap cells-${cellPadding}`,
      role: "region",
      "aria-label": labels["sr.table"],
      tabindex: 0,
    },
    body,
  );
};

/** Statements A to D (2.7): emphasised text in four looks; C and D carry a rule. */
const statement: Renderer = (block, { labels }) => {
  const html = contents(block)[0]?.text;
  if (!html) return undefined;
  const s = variantSettings<{ divider: boolean; dividerSize: number; dividerSpace: number }>(block);
  const rule = () => {
    if (!s.divider) return undefined;
    const line = h("div", { class: "statement-rule", "aria-hidden": "true" });
    line.style.height = px(s.dividerSize);
    line.style.marginTop = px(s.dividerSpace);
    line.style.marginBottom = px(s.dividerSpace);
    return line;
  };
  const look = block.variant;
  return h(
    "div",
    { class: `statement ${look}` },
    look === "statement-c" || look === "statement-d" ? rule() : undefined,
    h("div", { class: "statement-text" }, richText(html, labels)),
    look === "statement-c" ? rule() : undefined,
  );
};

/** Note (2.7): supporting text on a card of its own colour, with an icon (built in, or the author's SVG). */
const note: Renderer = (block, context) => {
  const html = contents(block)[0]?.text;
  if (!html) return undefined;
  const s = variantSettings<{
    noteSize: string;
    noteColor?: string;
    noteContrast: Contrast;
    noteIcon: boolean;
    noteIconColor?: string;
    cornerRadius: number;
  }>(block);
  const own = picture(block.media?.[0], context, "note-icon");
  if (own) own.alt = "";
  const mark = s.noteIcon ? (own ?? icon(INFO, "note-icon")) : undefined;
  const card = h(
    "div",
    { class: `note note-${s.noteSize}` },
    mark,
    h("div", { class: "note-text" }, richText(html, context.labels)),
  );
  card.style.borderRadius = px(s.cornerRadius);
  if (s.noteColor) {
    card.style.backgroundColor = s.noteColor;
    card.classList.add("has-color", `text-${textOn(s.noteColor, s.noteContrast)}`);
  }
  if (s.noteIconColor) card.style.setProperty("--note-icon", s.noteIconColor);
  return card;
};

interface QuoteSettings {
  avatar: boolean;
  avatarSize: number;
  quoteIcon: boolean;
  divider: boolean;
  dividerSize: number;
  quoteSpace: number;
  align: string;
  overlay: string;
  overlayOpacity: number;
  look: string;
}

/** One quote in look a, b, c or d (2.8): the quote, then the name; look c puts the photo first. */
function quoteFigure(item: ContentItem, s: QuoteSettings, look: string, context: StaticContext) {
  const photo = s.avatar ? picture(item.media, context, "quote-avatar") : undefined;
  if (photo) {
    photo.alt = "";
    photo.style.width = px(s.avatarSize);
    photo.style.height = px(s.avatarSize);
  }
  const caption =
    (item.title || (photo && look !== "c")) &&
    h(
      "figcaption",
      { class: "quote-caption" },
      look === "c" ? undefined : photo,
      item.title
        ? h("span", { class: "quote-name" }, richText(item.title, context.labels))
        : undefined,
    );
  if (caption) caption.style.marginTop = px(s.quoteSpace);
  const rule = s.divider ? h("div", { class: "quote-rule", "aria-hidden": "true" }) : undefined;
  if (rule) rule.style.height = px(s.dividerSize);
  return h(
    "figure",
    { class: `quote quote-${look}` },
    look === "c" ? photo : undefined,
    h(
      "div",
      { class: "quote-body" },
      s.quoteIcon && look !== "c" ? icon(QUOTE_MARK, "quote-mark") : undefined,
      h("blockquote", {}, richText(item.text ?? "", context.labels)),
      rule,
      caption || undefined,
    ),
  );
}

const quote: Renderer = (block, context) => {
  const item = contents(block).find((other) => other.text);
  if (!item) return undefined;
  const s = variantSettings<QuoteSettings>(block);
  return quoteFigure(item, s, block.variant.slice(-1), context);
};

/**
 * Text over a picture (quote on image, text on image): the picture, the author's overlay colour at
 * its opacity, and the text in white or black for that colour (UI-BLOCKS-EDITOR-R22). Without a
 * picture the overlay colour is solid, so the text keeps 4.5:1 on it.
 */
function overImage(
  ref: MediaRef | undefined,
  context: StaticContext,
  overlay: string,
  opacity: number,
  className: string,
  content: HTMLElement,
): HTMLElement {
  const image = picture(ref, context, "cover-image");
  const shade = h("div", { class: "overlay", "aria-hidden": "true" });
  shade.style.backgroundColor = overlay;
  shade.style.opacity = String(image ? opacity / 100 : 1);
  return h(
    "div",
    { class: `over-image ${className} text-${textOn(overlay)}` },
    image,
    shade,
    h("div", { class: "over-image-content" }, content),
  );
}

const quoteOnImage: Renderer = (block, context) => {
  const item = contents(block).find((other) => other.text);
  if (!item) return undefined;
  const s = variantSettings<QuoteSettings>(block);
  return overImage(
    block.media?.[0],
    context,
    s.overlay,
    s.overlayOpacity,
    `align-${s.align}`,
    quoteFigure(item, s, "a", context),
  );
};

/**
 * A carousel (quote carousel, image carousel): one slide at a time, previous and next buttons
 * that stop at the first and last slide (blocks-editor.md 2.8), Left and Right arrows on them
 * (blocks-interactions.md 4), and the position read out as it changes. Each slide shown is done;
 * the first counts as soon as the block shows (UI-BLOCKS-R52).
 */
function carousel(
  block: Block,
  slides: [id: string, element: HTMLElement][],
  names: { previous: LabelKey; next: LabelKey; position: LabelKey; region: LabelKey },
  { labels, lesson }: StaticContext,
): HTMLElement {
  const total = slides.length;
  const position = (current: number) => formatLabel(labels, names.position, { current, total });
  const groups = slides.map(([, element], i) =>
    h(
      "div",
      {
        class: "slide",
        role: "group",
        "aria-roledescription": labels["sr.slide"],
        "aria-label": position(i + 1),
      },
      element,
    ),
  );
  const status = h("p", { class: "carousel-position", "aria-live": "polite" });
  const button = (path: string, label: LabelKey) =>
    h(
      "button",
      { type: "button", class: "carousel-button" },
      icon(path, "icon"),
      h("span", { class: "visually-hidden" }, labels[label]),
    );
  const previous = button(PREVIOUS, names.previous);
  const next = button(NEXT, names.next);
  let index = 0;
  const done = (i: number) => {
    const id = slides[i]?.[0];
    if (id && lesson && !lesson.isDone(id)) lesson.itemDone(block, id);
  };
  const show = (to: number) => {
    index = Math.max(0, Math.min(total - 1, to));
    groups.forEach((group, i) => {
      group.hidden = i !== index;
    });
    status.textContent = position(index + 1);
    previous.setAttribute("aria-disabled", String(index === 0));
    next.setAttribute("aria-disabled", String(index === total - 1));
  };
  previous.addEventListener("click", () => {
    show(index - 1);
    done(index);
  });
  next.addEventListener("click", () => {
    show(index + 1);
    done(index);
  });
  const controls = h("div", { class: "carousel-controls" }, previous, status, next);
  controls.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    show(index + (event.key === "ArrowLeft" ? -1 : 1));
    done(index);
  });
  show(0);
  // Once the lesson page is built: the first slide counts as soon as the block shows.
  queueMicrotask(() => done(0));
  return h(
    "section",
    {
      class: "carousel",
      "aria-roledescription": labels["sr.carousel"],
      "aria-label": labels[names.region],
    },
    h("div", { class: "carousel-slides" }, ...groups),
    controls,
  );
}

const quoteCarousel: Renderer = (block, context) => {
  const items = shownItems(block);
  if (items.length === 0) return undefined;
  const s = variantSettings<QuoteSettings>(block);
  return carousel(
    block,
    items.map((item) => [item.id, quoteFigure(item, s, s.look, context)]),
    {
      previous: "quote.previous",
      next: "quote.next",
      position: "quote.position",
      region: "sr.quotes",
    },
    context,
  );
};

/**
 * Lists (2.9): numbered from the author's first number, bulleted, or a checklist whose boxes the
 * learner ticks; numbers, bullets and boxes take the block's item colour, with the number in
 * white or black on it.
 */
const list: Renderer = (block, context) => {
  const items = shownItems(block);
  if (items.length === 0) return undefined;
  const s = variantSettings<{
    markerSpace: number;
    markerColor?: string;
    markerContrast: Contrast;
    start: number;
  }>(block);
  const numbered = block.variant === "numbered";
  const element = h(numbered ? "ol" : "ul", {
    class: `list list-${block.variant}`,
    start: numbered && s.start !== 1 ? s.start : undefined,
  });
  element.style.setProperty("--marker-space", px(s.markerSpace));
  if (numbered) element.style.counterReset = `item ${s.start - 1}`;
  if (s.markerColor) {
    element.style.setProperty("--marker", s.markerColor);
    element.style.setProperty(
      "--marker-text",
      textOn(s.markerColor, s.markerContrast) === "light" ? "#ffffff" : "#000000",
    );
  }
  const { labels, lesson } = context;
  for (const item of items) {
    const body = h("div", { class: "list-text" }, richText(item.text ?? "", labels));
    if (block.variant !== "checkbox") {
      element.append(h("li", {}, body));
      continue;
    }
    const box = h("input", { type: "checkbox", id: uid("tick") });
    box.checked = lesson ? lesson.isDone(item.id) || lesson.isDone(block.id) : false;
    box.addEventListener("change", () => lesson?.itemDone(block, item.id, box.checked));
    element.append(h("li", {}, h("label", { class: "checklist-item", for: box.id }, box, body)));
  }
  return element;
};

interface ImageSettings {
  zoom: boolean;
  link?: string;
  cornerRadius: number;
  position: string;
  size: string;
  overlay: string;
  overlayOpacity: number;
}

/**
 * Images (2.10): centred or full width with a caption, beside text, under text, or as a banner.
 * Corners round except where the image fills the page width (UI-BLOCKS-EDITOR-R26).
 */
const image: Renderer = (block, context) => {
  const s = variantSettings<ImageSettings>(block);
  const { labels } = context;
  const html = contents(block)[0]?.text;
  const words = html ? h("div", { class: "text-body" }, richText(html, labels)) : undefined;
  const variant = block.variant;
  if (variant === "text-on-image") {
    return (
      words &&
      overImage(block.media?.[0], context, s.overlay, s.overlayOpacity, "text-on-image", words)
    );
  }
  const picked = picture(
    block.media?.[0],
    context,
    variant === "banner" ? "image banner" : "image",
  );
  if (picked && (variant === "centered" || variant === "image-text")) {
    picked.style.borderRadius = px(s.cornerRadius);
  }
  const shown = picked && (linked(picked, s.link, context) ?? zoomable(picked, labels, s.zoom));
  if (variant === "image-text") {
    if (!shown && !words) return undefined;
    return h(
      "div",
      { class: `image-text image-${s.position} image-${s.size}` },
      shown && h("div", { class: "image-side" }, shown),
      words,
    );
  }
  if (!shown) return undefined;
  return h(
    "figure",
    { class: "image-figure" },
    shown,
    words && variant !== "banner" ? h("figcaption", { class: "caption" }, words) : undefined,
  );
};

/**
 * A picture that links to a web page or a lesson (2.10, W15 step 3), instead of enlarging; none
 * without a safe link. A decorative picture gives the link no name, so the lesson's title or the
 * address names it.
 */
function linked(
  image: HTMLImageElement,
  link: string | undefined,
  { course, labels }: StaticContext,
): HTMLElement | undefined {
  if (!link || !isSafeLink(link)) return undefined;
  const element = linkOut(h("a", { class: "image-link", href: link }, image), labels);
  if (!image.alt) {
    const route = parseRoute(link, pagesOf(course));
    const name = route.kind === "page" ? route.page.title : link;
    element.prepend(h("span", { class: "visually-hidden" }, name));
  }
  return element;
}

/** A gallery image with its caption. */
function galleryFigure(item: ContentItem, s: ImageSettings, context: StaticContext) {
  const picked = picture(item.media, context, "image");
  if (picked) picked.style.borderRadius = px(s.cornerRadius);
  return h(
    "figure",
    { class: "gallery-item" },
    picked && zoomable(picked, context.labels, s.zoom),
    item.text
      ? h("figcaption", { class: "caption" }, richText(item.text, context.labels))
      : undefined,
  );
}

/** Galleries (2.11): a grid of two, three or four columns shows that many images (W8 step 3). */
const grid: Renderer = (block, context) => {
  const count = Number(block.variant.slice(-1));
  const shown = contents(block).slice(0, count);
  if (shown.length === 0) return undefined;
  const s = variantSettings<ImageSettings>(block);
  return h(
    "div",
    { class: `gallery gallery-${count}` },
    ...shown.map((item) => galleryFigure(item, s, context)),
  );
};

const galleryCarousel: Renderer = (block, context) => {
  const items = shownItems(block);
  if (items.length === 0) return undefined;
  const s = variantSettings<ImageSettings>(block);
  return carousel(
    block,
    items.map((item) => [item.id, galleryFigure(item, s, context)]),
    {
      previous: "gallery.previous",
      next: "gallery.next",
      position: "gallery.position",
      region: "sr.images",
    },
    context,
  );
};

/**
 * The number a numbered divider shows (2.14): it counts the numbered dividers down its lesson, from
 * the last one that restarts at its own number.
 */
function dividerNumber(block: Block, context: StaticContext): number {
  let number = 0;
  for (const other of lessonBlocks(block, context)) {
    if (other.category !== "divider" || other.variant !== "numbered") continue;
    const s = variantSettings<{ restart: boolean; start: number }>(other);
    number = s.restart ? s.start : number + 1;
    if (other.id === block.id) break;
  }
  return number;
}

export const STATIC_RENDERERS: Record<string, Renderer> = {
  "text/paragraph": text(true),
  "text/paragraph-with-heading": text(true),
  "text/paragraph-with-subheading": text(true),
  "text/heading": text(false),
  "text/subheading": text(false),
  "text/columns": columns,
  "text/table": table,
  "statement/statement-a": statement,
  "statement/statement-b": statement,
  "statement/statement-c": statement,
  "statement/statement-d": statement,
  "statement/note": note,
  "quote/quote-a": quote,
  "quote/quote-b": quote,
  "quote/quote-c": quote,
  "quote/quote-d": quote,
  "quote/on-image": quoteOnImage,
  "quote/carousel": quoteCarousel,
  "list/numbered": list,
  "list/bulleted": list,
  "list/checkbox": list,
  "image/centered": image,
  "image/full-width": image,
  "image/image-text": image,
  "image/text-on-image": image,
  "image/banner": image,
  "gallery/carousel": galleryCarousel,
  "gallery/grid-2": grid,
  "gallery/grid-3": grid,
  "gallery/grid-4": grid,
  "divider/line": () => h("hr", { class: "divider-line" }),
  "divider/numbered": (block, context) =>
    h(
      "div",
      { class: "divider-numbered" },
      h("span", { class: "divider-number" }, String(dividerNumber(block, context))),
    ),
  "divider/spacer": () => h("div", { class: "spacer" }),
};
