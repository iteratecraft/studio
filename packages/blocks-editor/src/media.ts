// Media intake rules (M2-13, ENG-14 basic, BLK-05; blocks-editor.md 2.17): which files each kind of
// media takes, the size limit, how images are checked and scaled down in the app (canvas, no
// library), and which audio and video files are web-ready already. Files that are not web-ready
// go to the host's converter (intake.tsx).

export type MediaKind = "image" | "audio" | "video" | "captions" | "file";

/** File extensions each kind takes, in the open dialog and in a drop; any file is an attachment. */
export const EXTENSIONS: Readonly<Record<Exclude<MediaKind, "file">, readonly string[]>> = {
  // 2.17: any common image format; SVG and BMP allowed.
  image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp"],
  audio: ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "wma", "aif", "aiff", "webm"],
  video: ["mp4", "m4v", "webm", "mov", "avi", "mkv", "wmv", "mpg", "mpeg", "3gp", "ogv"],
  // accessibility.md B5: the blocks app takes WebVTT caption files only.
  captions: ["vtt"],
};

/**
 * The largest file the editor takes. The spec allows 5 GB per file (UI-BLOCKS-EDITOR-R34), but a
 * project file holds at most 4 GiB in all (no ZIP64) and is held in memory while it is saved.
 * shortcut: 2 GiB until the project container streams and writes ZIP64.
 */
export const MEDIA_MAX_BYTES = 2 * 1024 ** 3;

/** Images larger than this on their long side are scaled down (2.17 "image compression"). */
export const IMAGE_MAX_EDGE = 1920;

const TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  vtt: "text/vtt",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** A file name's extension in lower case, without the dot; "" when it has none. */
export const extensionOf = (name: string) =>
  /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? "";

/** The media type a web server would give a file of this name. */
export const typeOfName = (name: string) => TYPES[extensionOf(name)] ?? "application/octet-stream";

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/** An image's real type from its first bytes, whatever its name says; undefined if it is none. */
export function imageType(bytes: Uint8Array): string | undefined {
  const at = (offset: number, ...values: number[]) =>
    values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 2) === "BM") return "image/bmp";
  if (ascii(bytes, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(bytes, 8, 12))) return "image/avif";
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).toLowerCase();
  return /<svg[\s>]/.test(head) ? "image/svg+xml" : undefined;
}

const EXTENSION_OF_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** MP4 boxes that hold the tracks' sample descriptions. */
const MP4_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

/** The codec of each track of an MP4 or M4A file (`avc1`, `mp4a`...), from its sample descriptions. */
export function mp4Codecs(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const codecs: string[] = [];
  const walk = (start: number, end: number) => {
    for (let at = start; at + 8 <= end; ) {
      let size = view.getUint32(at);
      const type = ascii(bytes, at + 4, at + 8);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return;
        size = Number(view.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) return;
      if (MP4_CONTAINERS.has(type)) walk(at + header, at + size);
      else if (type === "stsd" && at + header + 8 <= at + size) {
        // A full box (version and flags), the entry count, then one sample entry per codec.
        const count = view.getUint32(at + header + 4);
        for (let i = 0, entry = at + header + 8; i < count && entry + 8 <= at + size; i++) {
          codecs.push(ascii(bytes, entry + 4, entry + 8));
          const length = view.getUint32(entry);
          if (length < 8) break;
          entry += length;
        }
      }
      at += size;
    }
  };
  walk(0, bytes.length);
  return codecs;
}

const isWebm = (bytes: Uint8Array) =>
  bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
const isMp3 = (bytes: Uint8Array) =>
  ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);

/**
 * Whether an audio or video file plays in every current browser as it is, so it skips the
 * converter: MP4 with H.264 video and AAC audio, WebM, MP3 and M4A with AAC.
 */
export function isWebReady(bytes: Uint8Array, name: string, kind: "audio" | "video"): boolean {
  const extension = extensionOf(name);
  if (extension === "webm") return isWebm(bytes);
  if (kind === "audio" && extension === "mp3") return isMp3(bytes);
  const mp4 = kind === "video" ? ["mp4", "m4v"] : ["m4a", "mp4"];
  if (!mp4.includes(extension)) return false;
  const codecs = mp4Codecs(bytes);
  const allowed = kind === "video" ? ["avc1", "avc3", "mp4a"] : ["mp4a"];
  return codecs.length > 0 && codecs.every((codec) => allowed.includes(codec));
}

/** The media type a web-ready audio or video file is served with. */
export function webReadyType(name: string, kind: "audio" | "video"): string {
  const extension = extensionOf(name);
  if (extension === "webm") return kind === "video" ? "video/webm" : "audio/webm";
  if (extension === "mp3") return "audio/mpeg";
  return kind === "video" ? "video/mp4" : "audio/mp4";
}

export interface PreparedImage {
  data: Uint8Array;
  type: string;
  extension: string;
  width?: number;
  height?: number;
}

/** Width and height of an SVG drawing as the browser lays it out, or none when it has no size. */
async function svgSize(data: Uint8Array): Promise<{ width?: number; height?: number }> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : {};
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * An image ready for the course: its real type and size. A raster image larger than `maxEdge` on
 * its long side is scaled down with the browser's canvas (JPEG and WebP at quality 0.9, the rest as
 * PNG or WebP), unless the author keeps the original quality (2.10, 2.17) or the smaller file
 * would not be lighter. BMP becomes PNG. SVG and GIF (which may be animated) stay as they are.
 */
export async function prepareImage(
  data: Uint8Array,
  type: string,
  keepOriginal: boolean,
  maxEdge = IMAGE_MAX_EDGE,
): Promise<PreparedImage> {
  const original = { data, type, extension: EXTENSION_OF_TYPE[type] ?? "img" };
  if (type === "image/svg+xml") return { ...original, ...(await svgSize(data)) };
  const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type }));
  const { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const bmp = type === "image/bmp";
  if (!bmp && (keepOriginal || scale === 1 || type === "image/gif")) {
    bitmap.close();
    return { ...original, width, height };
  }
  const size = bmp && keepOriginal ? 1 : scale;
  const w = Math.max(1, Math.round(width * size));
  const h = Math.max(1, Math.round(height * size));
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw images");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const outType =
    type === "image/jpeg" || type === "image/webp"
      ? type
      : type === "image/png" || bmp
        ? "image/png"
        : "image/webp";
  const blob = await canvas.convertToBlob({ type: outType, quality: 0.9 });
  if (!bmp && blob.size >= data.length) return { ...original, width, height };
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    type: outType,
    extension: EXTENSION_OF_TYPE[outType] ?? "img",
    width: w,
    height: h,
  };
}

/** A video's width and height from the browser's own reading of it, or none when it cannot. */
export async function videoSize(
  data: Uint8Array,
  type: string,
): Promise<{ width?: number; height?: number }> {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
      video.src = url;
    });
    return video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : {};
  } catch {
    return {};
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** A size for people: "12.5 MB", in the editor's language. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}
