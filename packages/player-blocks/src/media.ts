// Multimedia blocks and narration (M2-13, BLK-05; rise.md §3 C Multimedia and §3 D narration;
// blocks-editor.md 2.12): audio and video in the browser's own players with caption tracks per
// language, a web embed that loads its provider only when the learner asks, a file to download and
// a code snippet.
// A video or audio whose forward seeking is off cannot be skipped ahead and completes when it
// reaches its end. Images and galleries are static blocks (static.ts, BLK-04).
import {
  type Block,
  type ContentItem,
  embedProvider,
  type MediaEntry,
  type MediaRef,
  textOn,
  variantSettings,
} from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { h, richText, uid } from "./dom.js";
import { hooks } from "./hooks.js";
import { lockedMedia, mediaEntry } from "./progress.js";
import type { StaticContext } from "./static.js";

type MediaContext = Pick<StaticContext, "course" | "labels" | "lesson" | "mediaUrl">;

const items = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");

/** The settings of the multimedia variants, with their defaults (format variants.ts). */
interface MediaSettings {
  forwardSeeking: boolean;
  cornerRadius: number;
  transcript?: string;
  poster?: { key: string };
  embedUrl?: string;
  provider?: string;
  border: boolean;
  fileName?: string;
  fileSize?: number;
}

/** The address of a media reference's file, and its index entry, or undefined when it has none. */
function fileOf(ref: MediaRef | undefined, { course, mediaUrl }: MediaContext) {
  const entry = mediaEntry(course, ref);
  return entry && { entry, src: mediaUrl(entry.variantKey ?? entry.key) };
}

const caption = (html: string | undefined, labels: Labels) =>
  html ? h("figcaption", { class: "caption" }, richText(html, labels)) : undefined;

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
  { course, lesson }: MediaContext,
): HTMLElementTagNameMap[K] {
  const media = h(tag, { controls: true, preload: "metadata", src });
  // UI-BLOCKS-EDITOR-R37: forward seeking is on by default; off makes the block requirable.
  if (lockedMedia(course, block)) {
    lockForwardSeeking(media);
    media.addEventListener("ended", () => {
      if (lesson && !lesson.isDone(block.id)) lesson.itemDone(block, block.id);
    });
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
  const { transcript } = variantSettings<MediaSettings>(block);
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
  const video = videoOf(ref, file.entry, mediaPlayer("video", block, file.src, context), context);
  const { poster, cornerRadius, transcript } = variantSettings<MediaSettings>(block);
  const thumbnail = fileOf(poster, context);
  if (thumbnail) video.poster = thumbnail.src;
  if (cornerRadius > 0) video.style.borderRadius = `${cornerRadius}px`;
  return h(
    "figure",
    { class: "figure media-video" },
    video,
    caption(items(block)[0]?.text, context.labels),
    transcript ? transcriptOf(transcript, context.labels) : undefined,
  );
}

/**
 * An item's video (blocks-interactions.md 2.1 to 2.4, 2.8, A10): the browser's own player, as in a
 * video block, with its caption tracks; or undefined when its file is not in the media index. It
 * loads nothing until played, as most sit in closed sections, other tabs and later cards.
 */
export function itemVideo(ref: MediaRef, context: MediaContext): HTMLVideoElement | undefined {
  const file = fileOf(ref, context);
  if (!file) return undefined;
  const video = h("video", { controls: true, preload: "none", src: file.src });
  return videoOf(ref, file.entry, video, context);
}

/** Whether a media reference names a video file (by its media index entry's type). */
export const isVideo = (ref: MediaRef | undefined, { course }: MediaContext) =>
  mediaEntry(course, ref)?.mimeType?.startsWith("video/") === true;

/**
 * What every video shares: its size, the speed menu the course allows, a caption track per
 * language, and a pause when it scrolls out of view or the page is hidden.
 */
function videoOf(
  ref: MediaRef,
  entry: MediaEntry,
  video: HTMLVideoElement,
  context: MediaContext,
): HTMLVideoElement {
  video.setAttribute("playsinline", "");
  if (entry.width && entry.height) {
    video.width = entry.width;
    video.height = entry.height;
  }
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
  return video;
}

/**
 * A web embed (D-44; rise.md §3 C Multimedia): a placeholder naming the provider, and the provider's
 * frame only once the learner asks for it, so nothing loads from outside the package before that
 * (ADR-0004). The editor's preview shows where it goes but never loads it. Only a player address
 * of the named provider is framed; for any other address, which a hand-made document may hold, the
 * block says it cannot be shown and offers nothing to load or follow.
 */
export function embedBlock(block: Block, { labels }: MediaContext): HTMLElement | undefined {
  const s = variantSettings<MediaSettings>(block);
  if (!s.embedUrl) return undefined;
  const frame = embedFrame(s.embedUrl, s.provider, labels, s.border);
  return h(
    "figure",
    { class: "figure media-embed" },
    frame,
    caption(items(block)[0]?.text, labels),
  );
}

/**
 * A provider's player frame behind a button that loads it (D-44, ADR-0004), for an embed block or
 * an item's embed; a frame that says it cannot be shown for an address that is not the named
 * provider's player.
 */
export function embedFrame(
  address: string,
  named: string | undefined,
  labels: Labels,
  border = false,
): HTMLElement {
  const provider = embedProvider(address, named);
  const frame = h("div", { class: border ? "embed-frame embed-border" : "embed-frame" });
  if (!provider) {
    const notice = h("p", { class: "embed-notice" }, labels["embed.unavailable"]);
    frame.append(h("div", { class: "embed-placeholder" }, notice));
    return frame;
  }
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
  return frame;
}

/** A file to download (rise.md §3 C Multimedia, Attachment): its name and size. Never required. */
export function attachmentBlock(block: Block, context: MediaContext): HTMLElement | undefined {
  const file = fileOf(block.media?.[0], context);
  if (!file) return undefined;
  const { labels } = context;
  const s = variantSettings<MediaSettings>(block);
  const name = s.fileName ?? file.entry.key;
  const bytes = s.fileSize ?? 0;
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
 * A code snippet (blocks-editor.md 2.5, 2.12; BLK-05 "text-only code display"): the code as
 * written, read-only, on its own colour with white or black text that keeps 4.5:1, its language's
 * name and a button that copies it. Long lines wrap or scroll sideways; the code takes focus so a
 * keyboard can scroll it. Where the page may not use the clipboard (some training systems' frames),
 * the button selects the code for the learner to copy.
 */
export function codeSnippetBlock(block: Block, { labels }: MediaContext): HTMLElement | undefined {
  const s = variantSettings<{
    code?: string;
    language?: string;
    wrap: boolean;
    background: string;
    contrast: "auto" | "light" | "dark";
  }>(block);
  if (!s.code) return undefined;
  const code = h("code", {}, s.code);
  const name = s.language?.trim();
  const area = h(
    "pre",
    {
      class: `code-area text-${textOn(s.background, s.contrast)}${s.wrap ? " code-wrap" : ""}`,
      tabindex: 0,
      role: "region",
      "aria-label": name
        ? formatLabel(labels, "code.named", { language: name })
        : labels["code.label"],
    },
    code,
  );
  area.style.backgroundColor = s.background;
  const status = h("span", { class: "code-status", role: "status" });
  const copy = h("button", { type: "button", class: "button code-copy" }, labels["code.copy"]);
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(s.code ?? "");
      status.textContent = labels["code.copied"];
    } catch {
      getSelection()?.selectAllChildren(code);
      status.textContent = labels["code.selected"];
    }
  });
  return h(
    "figure",
    { class: "figure code-snippet" },
    h(
      "div",
      { class: "code-head" },
      name ? h("span", { class: "code-language" }, name) : undefined,
      copy,
      status,
    ),
    area,
    caption(items(block)[0]?.text, labels),
  );
}

/**
 * A block's narration (rise.md §3 D; blocks-editor.md 2.4 audio placement, W16): an audio player
 * at the top or the bottom (the default) of the block, with its transcript. Heading and subheading
 * blocks carry none.
 */
export function narrationOf(block: Block, context: MediaContext): HTMLElement | undefined {
  const narration = block.settings?.narration;
  if (!narration || block.variant === "heading" || block.variant === "subheading") return undefined;
  const { labels } = context;
  const audio = audioOf(narration.audio, labels["narration.label"], context);
  if (!audio) return undefined;
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

/**
 * An audio player named `name` that loads nothing until played: a block's narration, or an
 * item's audio (blocks-interactions.md 2.1 to 2.4, 2.8, A11); undefined without its file.
 */
export function audioOf(
  ref: MediaRef | undefined,
  name: string,
  context: MediaContext,
): HTMLAudioElement | undefined {
  const file = fileOf(ref, context);
  if (!file) return undefined;
  return h("audio", { controls: true, preload: "none", src: file.src, "aria-label": name });
}
