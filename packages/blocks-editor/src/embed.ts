// Web embeds (D-44; blocks-editor.md L20, W18, 2.17): a short built-in list of providers, matched
// by the address the author pastes, or by the frame address in pasted embed code. No lookup
// service is called while authoring (ADR-0004); the published course loads the provider's own
// player frame only when the learner asks for it. Start times in a pasted link are kept (2.17:
// "parameters honoured").

import { EMBED_PROVIDERS } from "@course-suite/format";

export interface Embed {
  /** What the author pasted: the page address, or the frame address in embed code. */
  url: string;
  /** The provider's player frame. */
  embedUrl: string;
  provider: (typeof EMBED_PROVIDERS)[number];
}

/** Seconds from `90`, `90s` or `1h2m3s`; undefined for anything else. */
function seconds(text: string | null): number | undefined {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(text ?? "");
  if (!text || !match) return undefined;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

interface Provider {
  name: (typeof EMBED_PROVIDERS)[number];
  match: RegExp;
  embed: (id: string, url: URL) => string;
}

const PROVIDERS: readonly Provider[] = [
  {
    name: "YouTube",
    match:
      /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{11})(?![\w-])/,
    embed: (id, url) => {
      const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
      return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`;
    },
  },
  {
    name: "Vimeo",
    match:
      /^https:\/\/(?:www\.)?(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)(?!\d)/,
    embed: (id, url) =>
      `https://player.vimeo.com/video/${id}?dnt=1${/^#t=\w+$/.test(url.hash) ? url.hash : ""}`,
  },
  {
    name: "Loom",
    match: /^https:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([0-9a-f]{32})(?![0-9a-f])/,
    embed: (id) => `https://www.loom.com/embed/${id}`,
  },
  {
    name: "Dailymotion",
    match: /^https:\/\/(?:www\.)?(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-zA-Z0-9]+)/,
    embed: (id) => `https://www.dailymotion.com/embed/video/${id}`,
  },
];

/** The providers' names, for telling the author what can be embedded. */
export const PROVIDER_NAMES: readonly string[] = EMBED_PROVIDERS;

/** The embed for a pasted address or embed code, or undefined when no listed provider matches. */
export function embedFor(pasted: string): Embed | undefined {
  const text = pasted.trim();
  const frame = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  const address = (frame ?? text).replaceAll("&amp;", "&").replace(/^http:\/\//, "https://");
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  for (const provider of PROVIDERS) {
    const id = provider.match.exec(address)?.[1];
    if (id) return { url: address, embedUrl: provider.embed(id, url), provider: provider.name };
  }
  return undefined;
}
