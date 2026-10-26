// Media blocks (M2-13, BLK-05; rise.md §3 C Image, Gallery, Multimedia and §3 D narration;
// blocks-editor.md 2.10 to 2.12): images in five variants with zoom, galleries as grids or a
// carousel, audio and video in the browser's own players with caption tracks per language, a web
// embed that loads its provider only when the learner asks, and a file to download. A video or audio
// whose forward seeking is off cannot be skipped ahead and completes when it reaches its end.
import type { Block, ContentItem, Course, MediaRef } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";
import { hooks } from "./hooks.js";

/** What a media block needs from blocks.ts: the course, labels, file addresses, completion. */
export interface MediaContext {
  course: Course;
  labels: Labels;
  url: (key: string) => string;
  /** The learner finished a block that needs an action (carousel, locked audio or video). */
  completed?: (block: Block) => void;
}

const items = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");

const setting = <T>(block: Block, name: string, ok: (value: unknown) => boolean, fallback: T) => {
  const value = block.variantSettings?.[name];
  return ok(value) ? (value as T) : fallback;
};
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** The address of a media reference's file, and its index entry, or undefined when it has none. */
function fileOf(ref: MediaRef | undefined, { course, url }: MediaContext) {
  const entry = ref && course.media.find((media) => media.key === ref.key);
  return entry && { entry, src: url(entry.variantKey ?? entry.key) };
}

const caption = (html: string | undefined, labels: Labels) =>
  html ? h("figcaption", { class: "media-caption" }, richText(html, labels)) : undefined;

/**
 * An image; with zoom, a button that opens it large in a modal dialog, which Escape, its close
 * button or a click outside closes (blocks-interactions.md section 4: Esc leaves image zoom).
 * Empty or missing alt text marks it decorative (UI-ACCESSIBILITY-R34).
 */
function picture(ref: MediaRef, context: MediaContext, zoom: boolean, radius = 0) {
  const file = fileOf(ref, context);
  if (!file) return undefined;
  const alt = ref.alt ?? "";
  const image = h("img", {
    class: "image",
    src: file.src,
    alt,
    width: file.entry.width,
    height: file.entry.height,
    loading: "lazy",
  });
  if (radius > 0) image.style.borderRadius = `${Math.min(radius, 30)}px`;
  if (!zoom) return image;
  const { labels } = context;
  const open = h(
    "button",
    { type: "button", class: "zoom" },
    image,
    h("span", { class: "visually-hidden" }, labels["image.enlarge"]),
  );
  open.addEventListener("click", () => {
    const close = h(
      "button",
      { type: "button", class: "button zoom-close" },
      labels["image.close"],
    );
    const dialog = h(
      "dialog",
      { class: "zoom-dialog", "aria-label": alt || labels["image.enlarge"] },
      close,
      h("img", { src: file.src, alt }),
    );
    close.addEventListener("click", () => dialog.close());
    // A click on the backdrop lands on the dialog itself.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
  return open;
}

/** Image blocks (rise.md §3 C Image; blocks-editor.md 2.10). */
export function imageBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const ref = block.media?.[0];
  const text = items(block)[0]?.text;
  const radius = setting(block, "cornerRadius", isNumber, 0);
  const variant = block.variant;
  // UI-BLOCKS-EDITOR-R26: full-screen images get no corner radius.
  const bleed = variant === "full-width" || variant === "banner" || variant === "text-on-image";
  const zoom =
    variant !== "banner" && variant !== "text-on-image" && block.variantSettings?.zoom !== false;
  const image = ref && picture(ref, context, zoom, bleed ? 0 : radius);
  if (!image) return undefined;
  const { labels } = context;
  if (variant === "image-text") {
    const position = setting(block, "imagePosition", (v) => v === "right", "left");
    const size = setting(block, "imageSize", (v) => v === "small" || v === "large", "medium");
    return h(
      "div",
      { class: `image-text image-${position} image-${size}` },
      h("figure", { class: "figure" }, image),
      text ? h("div", { class: "text" }, richText(text, labels)) : undefined,
    );
  }
  if (variant === "text-on-image") {
    // Overlay colour and opacity (2.10): black at 50 % unless set, keeping the white text readable.
    const opacity = Math.min(100, Math.max(0, setting(block, "overlayOpacity", isNumber, 50)));
    const overlay = h("div", { class: "overlay-text" }, text ? richText(text, labels) : "");
    overlay.style.backgroundColor = `rgb(0 0 0 / ${opacity}%)`;
    return h("div", { class: "text-on-image" }, image, overlay);
  }
  return h("figure", { class: `figure figure-${variant}` }, image, caption(text, labels));
}

/** Galleries (rise.md §3 C Gallery; blocks-editor.md 2.11): a grid, or a carousel. */
export function galleryBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const zoom = block.variantSettings?.zoom !== false;
  const radius = setting(block, "cornerRadius", isNumber, 0);
  const { labels } = context;
  const slides = items(block).flatMap((item) => {
    const image = item.media && picture(item.media, context, zoom, radius);
    return image ? [h("figure", { class: "figure" }, image, caption(item.text, labels))] : [];
  });
  if (slides.length === 0) return undefined;
  const columns = /^grid-([234])$/.exec(block.variant)?.[1];
  if (columns) {
    return h(
      "ul",
      { class: `gallery gallery-${columns}` },
      ...slides.map((slide) => h("li", {}, slide)),
    );
  }
  return carousel(block, slides, context);
}

/**
 * A carousel: one image at a time, previous and next buttons and its position, which a screen
 * reader hears as it changes; left and right arrows move it (accessibility.md D4). Its first image
 * counts as seen at once and the block is done once every image has been shown (UI-BLOCKS-R52).
 */
function carousel(block: Block, slides: HTMLElement[], { labels, completed }: MediaContext) {
  const total = slides.length;
  const seen = new Set<number>();
  const position = h("p", { class: "carousel-position", "aria-live": "polite" });
  const previous = h("button", { type: "button", class: "button" }, labels["gallery.previous"]);
  const next = h("button", { type: "button", class: "button" }, labels["gallery.next"]);
  let current = 0;
  const show = (index: number) => {
    current = (index + total) % total;
    slides.forEach((slide, i) => {
      slide.hidden = i !== current;
      slide.setAttribute("role", "group");
      slide.setAttribute(
        "aria-label",
        formatLabel(labels, "gallery.position", { current: i + 1, total }),
      );
    });
    position.textContent = formatLabel(labels, "gallery.position", { current: current + 1, total });
    seen.add(current);
    if (seen.size === total) completed?.(block);
  };
  previous.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  const element = h(
    "div",
    { class: "carousel" },
    ...slides,
    h("div", { class: "carousel-controls" }, previous, position, next),
  );
  element.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if ((event.target as Element).closest("input, textarea, select, dialog")) return;
    event.preventDefault();
    show(current + (event.key === "ArrowLeft" ? -1 : 1));
  });
  show(0);
  return element;
}

/**
 * Keeps a learner from skipping ahead: a seek past the furthest point played goes back to it, by
 * mouse, keyboard or media keys alike (BLK-05 done-when); going back is always allowed.
 */
function lockForwardSeeking(media: HTMLMediaElement) {
  let reached = 0;
  media.addEventListener("timeupdate", () => {
    if (!media.seeking) reached = Math.max(reached, media.currentTime);
  });
  media.addEventListener("seeking", () => {
    if (media.currentTime > reached + 0.5) media.currentTime = reached;
  });
}

/** Audio and video settings every player shares: seeking and completion. */
function mediaPlayer<K extends "audio" | "video">(
  tag: K,
  block: Block,
  src: string,
  { completed }: MediaContext,
): HTMLElementTagNameMap[K] {
  const media = h(tag, { controls: true, preload: "metadata", src });
  // UI-BLOCKS-EDITOR-R37: forward seeking is on by default; off makes the block requirable.
  if (block.variantSettings?.forwardSeeking === false) {
    lockForwardSeeking(media);
    media.addEventListener("ended", () => completed?.(block));
  }
  return media;
}

/** The language name of a caption track, in the course's language, or its code. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(
      code,
    ) as string;
  } catch {
    return code;
  }
}

/** Audio (blocks-editor.md 2.12): the clip, its caption and its transcript. */
export function audioBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const file = fileOf(block.media?.[0], context);
  if (!file) return undefined;
  const { labels } = context;
  const transcript = setting(block, "transcript", isText, "");
  return h(
    "figure",
    { class: "figure media-audio" },
    mediaPlayer("audio", block, file.src, context),
    caption(items(block)[0]?.text, labels),
    transcript ? transcriptOf(transcript, labels) : undefined,
  );
}

/** A transcript the learner opens: plain text, a paragraph per blank-line-separated part. */
function transcriptOf(text: string, labels: Labels) {
  return h(
    "details",
    { class: "transcript" },
    h("summary", {}, labels["media.transcript"]),
    ...text.split(/\n\s*\n/).map((part) => h("p", {}, part.trim())),
  );
}

/**
 * Video (rise.md §3 C Multimedia; blocks-editor.md 2.12): the browser's own player with a caption
 * track per language, which the learner picks from its captions menu; learners may change the speed
 * from 0.25 to 2 times unless the author turned it off. It shows the author's thumbnail before it
 * plays, and a transcript (2.12). An uploaded video pauses when it scrolls out of view or the page is
 * hidden (UI-BLOCKS-EDITOR-R38).
 */
export function videoBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const ref = block.media?.[0];
  const file = fileOf(ref, context);
  if (!ref || !file) return undefined;
  const video = mediaPlayer("video", block, file.src, context);
  video.setAttribute("playsinline", "");
  const poster = block.variantSettings?.poster;
  const thumbnail =
    typeof poster === "object" && poster !== null && "key" in poster
      ? fileOf({ key: String(poster.key) }, context)
      : undefined;
  if (thumbnail) video.poster = thumbnail.src;
  if (file.entry.width && file.entry.height) {
    video.width = file.entry.width;
    video.height = file.entry.height;
  }
  const radius = setting(block, "cornerRadius", isNumber, 0);
  if (radius > 0) video.style.borderRadius = `${Math.min(radius, 30)}px`;
  if (context.course.navigation?.videoSpeed === false) {
    video.setAttribute("controlslist", "noplaybackrate");
    video.addEventListener("ratechange", () => {
      video.playbackRate = 1;
    });
  }
  for (const track of ref.captions ?? []) {
    const captions = fileOf({ key: track.key }, context);
    if (!captions) continue;
    video.append(
      h("track", {
        kind: "captions",
        src: captions.src,
        srclang: track.language,
        label: languageName(track.language),
      }),
    );
  }
  // Both let go of the video once a redraw has taken it out of the page.
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(([entry]) => {
      if (!video.isConnected) observer.disconnect();
      else if (entry && !entry.isIntersecting) video.pause();
    });
    observer.observe(video);
  }
  const hidden = () => {
    if (!video.isConnected) document.removeEventListener("visibilitychange", hidden);
    else if (document.hidden) video.pause();
  };
  document.addEventListener("visibilitychange", hidden);
  const transcript = setting(block, "transcript", isText, "");
  return h(
    "figure",
    { class: "figure media-video" },
    video,
    caption(items(block)[0]?.text, context.labels),
    transcript ? transcriptOf(transcript, context.labels) : undefined,
  );
}

/**
 * A web embed (D-44; rise.md §3 C Multimedia): a placeholder naming the provider, and the provider's
 * frame only once the learner asks for it, so nothing loads from outside the package before that
 * (ADR-0004). The editor's preview shows where it goes but never loads it. Only https frames.
 */
export function embedBlock(block: Block, { labels }: MediaContext): HTMLElement | undefined {
  const address = setting(block, "embedUrl", isText, "");
  if (!/^https:\/\/[^\s]+$/.test(address)) return undefined;
  const provider = setting(block, "provider", isText, new URL(address).hostname);
  const text = items(block)[0]?.text;
  const frame = h("div", {
    class: block.variantSettings?.border === true ? "embed-frame embed-border" : "embed-frame",
  });
  const preview = hooks?.files !== undefined;
  const noticeId = uid("embed");
  const load = h(
    "button",
    { type: "button", class: "button", "aria-describedby": noticeId },
    formatLabel(labels, "embed.load", { provider }),
  );
  const notice = h(
    "p",
    { class: "embed-notice", id: noticeId },
    formatLabel(labels, preview ? "embed.preview" : "embed.notice", { provider }),
  );
  load.hidden = preview;
  load.addEventListener("click", () => {
    const iframe = h("iframe", {
      src: address,
      title: formatLabel(labels, "embed.title", { provider }),
      allow: "fullscreen; picture-in-picture; encrypted-media",
      allowfullscreen: true,
      referrerpolicy: "strict-origin-when-cross-origin",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-presentation",
    });
    frame.replaceChildren(iframe);
    iframe.focus();
  });
  frame.append(h("div", { class: "embed-placeholder" }, notice, load));
  return h("figure", { class: "figure media-embed" }, frame, caption(text, labels));
}

/** A file to download (rise.md §3 C Multimedia, Attachment): its name and size. Never required. */
export function attachmentBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const file = fileOf(block.media?.[0], context);
  if (!file) return undefined;
  const { labels } = context;
  const name = setting(block, "fileName", isText, file.entry.key);
  const bytes = setting(block, "fileSize", isNumber, 0);
  const link = h(
    "a",
    { class: "button attachment-link", href: file.src, download: name },
    formatLabel(labels, "attachment.download", { name }),
  );
  return h(
    "figure",
    { class: "figure attachment" },
    h("div", { class: "attachment-row" }, link, bytes > 0 ? h("span", {}, fileSize(bytes)) : ""),
    caption(items(block)[0]?.text, labels),
  );
}

/** A file size in the course's language: kilobytes below a megabyte, megabytes above. */
function fileSize(bytes: number): string {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(document.documentElement.lang || "en", {
    style: "unit",
    unit: mega ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(bytes / (mega ? 1_000_000 : 1000));
}

/**
 * A block's narration (rise.md §3 D; blocks-editor.md 2.4 audio placement, W16): an audio player
 * at the top or the bottom (the default) of the block, with its transcript. Heading and subheading
 * blocks carry none.
 */
export function narrationOf(block: Block, context: MediaContext): HTMLElement | undefined {
  const narration = block.settings?.narration;
  if (!narration || block.variant === "heading" || block.variant === "subheading") return undefined;
  const file = fileOf(narration.audio, context);
  if (!file) return undefined;
  const { labels } = context;
  const audio = h("audio", {
    controls: true,
    preload: "none",
    src: file.src,
    "aria-label": labels["narration.label"],
  });
  const transcript = narration.transcript
    ? h(
        "details",
        { class: "transcript" },
        h("summary", {}, labels["media.transcript"]),
        richText(narration.transcript, labels),
      )
    : undefined;
  return h("div", { class: "narration" }, audio, transcript);
}
