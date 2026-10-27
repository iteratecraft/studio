import { createHash } from "node:crypto";
import { blocksPlayer, buildPackage, webExporter } from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import { sampleCourse } from "@course-suite/format/test/courses";
import { HOOKS_GLOBAL } from "@course-suite/player-blocks";
import { readZip } from "@course-suite/zip";
import { describe, expect, test } from "vitest";
import { FRAME_SCRIPT, FRAME_SCRIPT_HASH, FRAME_URL, previewPackage } from "./index.js";

const svg = (text: string) =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`);
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const media: Record<string, Uint8Array> = {
  "cover.svg": svg("cover"),
  "compost-bin.svg": svg("bin"),
};

/** The sample course with a body font of its own, so its package carries a font and its licence. */
const withFont = (): Course => ({
  ...sampleCourse(),
  theme: { fonts: { body: { kind: "builtin", id: "literata" } } },
});

describe("previewPackage", () => {
  test("[rise:R20] holds the same bytes as the web package exported for the same course", async () => {
    const course = withFont();
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
    // Each file by its SHA-256: a deep equality walks the player and font bytes one index at a
    // time, which took seconds on a busy CI runner.
    const exported = new Map<string, string>();
    for (const name of zip.value.names)
      exported.set(name, sha256((await zip.value.read(name)) as Uint8Array));
    expect(
      new Map([
        ["index.html", sha256(new TextEncoder().encode(preview.index))],
        ...preview.files.map(([path, data]) => [path, sha256(data)] as const),
      ]),
    ).toEqual(exported);
  });

  test("gives each file the type a web server would, SVG images and fonts included", async () => {
    const preview = await previewPackage(withFont(), (key) => media[key], nodeFonts);
    const types = Object.fromEntries(
      preview.files.map(([path, , type]) => [path.replace(/\.[0-9a-f]{10}\./, "."), type]),
    );
    expect(types).toEqual({
      "player.js": "text/javascript",
      "player.css": "text/css",
      "course-data.js": "text/javascript",
      "fonts/literata-regular.woff2": "font/woff2",
      "fonts/literata-bold.woff2": "font/woff2",
      "fonts/literata-italic.woff2": "font/woff2",
      "fonts/literata-OFL.txt": "text/plain",
      "media/cover.svg": "image/svg+xml",
      "media/compost-bin.svg": "image/svg+xml",
    });
  });

  test("leaves out a media file or font the project cannot give, and still builds the rest", async () => {
    const preview = await previewPackage(
      withFont(),
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
