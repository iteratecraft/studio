import { createHash } from "node:crypto";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import { sampleCourse } from "@course-suite/format/test/courses";
import { HOOKS_GLOBAL } from "@course-suite/player-blocks";
import { readZip } from "@course-suite/zip";
import { describe, expect, test } from "vitest";
import { FRAME_SCRIPT, FRAME_SCRIPT_HASH, FRAME_URL, previewPackage } from "./index.js";

const svg = (text: string) =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`);
const media: Record<string, Uint8Array> = {
  "cover.svg": svg("cover"),
  "compost-bin.svg": svg("bin"),
};

describe("previewPackage", () => {
  test("[rise:R20] holds the same bytes as the web package exported for the same course", async () => {
    const course = sampleCourse();
    const built = await buildPackage({
      course,
      player: blocksPlayer({ language: course.sourceLanguage ?? "en" }),
      exporter: webExporter(),
      media: (key) => media[key],
      fonts: nodeFonts,
      packageVersion: 1,
    });
    if (!built.ok) throw new Error(JSON.stringify(built.problems));
    const zip = await readZip(built.value.zip);
    if (!zip.ok) throw new Error(JSON.stringify(zip.problems));

    const preview = await previewPackage(course, (key) => media[key], nodeFonts);
    const exported = new Map<string, Uint8Array>();
    for (const name of zip.value.names)
      exported.set(name, (await zip.value.read(name)) as Uint8Array);
    expect(new TextEncoder().encode(preview.index)).toEqual(exported.get("index.html"));
    expect(new Map(preview.files.map(([path, data]) => [path, data]))).toEqual(
      new Map([...exported].filter(([name]) => name !== "index.html")),
    );
    // It builds, zips and unzips the real player: about 0.3 s alone, over 5 s on a busy CI runner.
  }, 30_000);

  test("gives each file the type a web server would, SVG images included", async () => {
    const preview = await previewPackage(sampleCourse(), (key) => media[key], nodeFonts);
    const types = Object.fromEntries(
      preview.files.map(([path, , type]) => [path.replace(/\.[0-9a-f]{10}\./, "."), type]),
    );
    expect(types).toEqual({
      "player.js": "text/javascript",
      "player.css": "text/css",
      "course-data.js": "text/javascript",
      "fonts/noto-sans-regular.woff2": "font/woff2",
      "fonts/noto-sans-bold.woff2": "font/woff2",
      "fonts/noto-sans-italic.woff2": "font/woff2",
      "fonts/noto-serif-regular.woff2": "font/woff2",
      "fonts/noto-serif-bold.woff2": "font/woff2",
      "fonts/noto-serif-italic.woff2": "font/woff2",
      "media/cover.svg": "image/svg+xml",
      "media/compost-bin.svg": "image/svg+xml",
    });
  });

  test("leaves out a media file or font the project cannot give, and still builds the rest", async () => {
    const preview = await previewPackage(
      sampleCourse(),
      (key) => {
        if (key === "cover.svg") throw new Error("unreadable");
        return undefined;
      },
      () => {
        throw new Error("unreadable");
      },
    );
    expect(
      preview.files.map(([path]) => path).filter((path) => /^(media|fonts)\//.test(path)),
    ).toEqual([]);
    expect(preview.files).toHaveLength(3);
  });
});

describe("the frame", () => {
  test("runs its script under the content security policy hash pinned for it", () => {
    const hash = createHash("sha256").update(FRAME_SCRIPT).digest("base64");
    expect(FRAME_SCRIPT_HASH).toBe(`'sha256-${hash}'`);
  });

  test("is a data: document whose only script is the frame script, so the hash covers it", () => {
    const html = decodeURIComponent(FRAME_URL.slice(FRAME_URL.indexOf(",") + 1));
    expect(FRAME_URL.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    expect(html.match(/<script>([\s\S]*?)<\/script>/g)).toEqual([
      `<script>${FRAME_SCRIPT}</script>`,
    ]);
    expect(html).toContain('<div id="app"></div>');
    expect(FRAME_SCRIPT).toContain(`window.${HOOKS_GLOBAL} =`);
  });
});
