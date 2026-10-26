import { describe, expect, test } from "vitest";
import { embedFor, PROVIDER_NAMES } from "./embed.js";
import { extensionOf, imageType, isWebReady, mp4Codecs } from "./media.js";

/** An MP4 box: size, type, body. */
function box(type: string, ...body: Uint8Array[]): Uint8Array {
  const size = 8 + body.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  let at = 8;
  for (const part of body) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A minimal MP4 whose tracks use these codecs. */
function mp4(...codecs: string[]): Uint8Array {
  const tracks = codecs.map((codec) => {
    const count = new Uint8Array(8);
    new DataView(count.buffer).setUint32(4, 1);
    const stsd = box("stsd", count, box(codec, new Uint8Array(16)));
    return box("trak", box("mdia", box("minf", box("stbl", stsd))));
  });
  return new Uint8Array([
    ...box("ftyp", new TextEncoder().encode("isom")),
    ...box("moov", ...tracks),
    ...box("mdat", new Uint8Array(32)),
  ]);
}

describe("web-ready audio and video skip the converter (D-12)", () => {
  test("MP4 with H.264 and AAC, WebM, MP3 and M4A with AAC are web-ready; others are not", () => {
    expect(mp4Codecs(mp4("avc1", "mp4a"))).toEqual(["avc1", "mp4a"]);
    expect(isWebReady(mp4("avc1", "mp4a"), "clip.MP4", "video")).toBe(true);
    expect(isWebReady(mp4("hvc1", "mp4a"), "clip.mp4", "video")).toBe(false);
    expect(isWebReady(mp4("mp4a"), "talk.m4a", "audio")).toBe(true);
    expect(isWebReady(mp4("alac"), "talk.m4a", "audio")).toBe(false);
    expect(isWebReady(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]), "clip.webm", "video")).toBe(
      true,
    );
    expect(isWebReady(new TextEncoder().encode("ID3\u0004"), "talk.mp3", "audio")).toBe(true);
    expect(isWebReady(new Uint8Array([0xff, 0xfb, 0x90]), "talk.mp3", "audio")).toBe(true);
    expect(isWebReady(new TextEncoder().encode("RIFF....WAVE"), "talk.wav", "audio")).toBe(false);
    expect(isWebReady(mp4("avc1"), "clip.mov", "video")).toBe(false);
    // A file named .webm that is not one goes to the converter.
    expect(isWebReady(new Uint8Array([1, 2, 3, 4]), "clip.webm", "video")).toBe(false);
  });

  test("a damaged MP4 gives no codecs instead of reading past its end", () => {
    const cut = mp4("avc1").subarray(0, 30);
    expect(mp4Codecs(cut)).toEqual([]);
    expect(mp4Codecs(new Uint8Array([0, 0, 0, 1, 0x6d, 0x6f, 0x6f, 0x76]))).toEqual([]);
  });
});

describe("images", () => {
  test("[rise:3C] blocks-editor.md 2.17: an image's type comes from its bytes, not its name", () => {
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10]))).toBe("image/png");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(imageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageType(new TextEncoder().encode("BM\0\0"))).toBe("image/bmp");
    expect(
      imageType(new TextEncoder().encode('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1">')),
    ).toBe("image/svg+xml");
    expect(imageType(new TextEncoder().encode("%PDF-1.7"))).toBeUndefined();
    expect(extensionOf("Photo.JPEG")).toBe("jpeg");
    expect(extensionOf("no extension")).toBe("");
  });
});

describe("web embeds (D-44)", () => {
  test("[rise:3C] blocks-editor.md W18, 2.17: listed providers match by address or embed code, keeping start times", () => {
    expect(PROVIDER_NAMES).toEqual(["YouTube", "Vimeo", "Loom", "Dailymotion"]);
    expect(embedFor("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s")).toEqual({
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s",
      embedUrl: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90",
      provider: "YouTube",
    });
    expect(embedFor("  https://youtu.be/aqz-KE-bpKQ ")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    );
    expect(embedFor("https://vimeo.com/76979871#t=30s")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1#t=30s",
    );
    expect(
      embedFor(
        '<iframe width="560" src="https://player.vimeo.com/video/76979871?h=1&amp;x=2" allow="fullscreen"></iframe>',
      ),
    ).toMatchObject({ provider: "Vimeo", url: "https://player.vimeo.com/video/76979871?h=1&x=2" });
    expect(embedFor("https://www.loom.com/share/0123456789abcdef0123456789abcdef")?.embedUrl).toBe(
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef",
    );
    expect(embedFor("http://dai.ly/x8abc12")?.embedUrl).toBe(
      "https://www.dailymotion.com/embed/video/x8abc12",
    );
  });

  test("D-44: anything else is refused, including look-alike hosts and scripts", () => {
    for (const text of [
      "https://example.com/watch?v=aqz-KE-bpKQ",
      "https://youtube.com.example.net/watch?v=aqz-KE-bpKQ",
      "https://www.youtube.com/watch?v=short",
      "javascript:alert(1)",
      "<script src='https://www.youtube.com/embed/aqz-KE-bpKQ'></script>",
      "",
    ]) {
      expect(embedFor(text), text).toBeUndefined();
    }
  });
});
