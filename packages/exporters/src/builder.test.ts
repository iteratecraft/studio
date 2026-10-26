import { nodeFonts, TEST_CUSTOM_FONT } from "@course-suite/fonts/test/node-fonts";
import { type Course, PANEL } from "@course-suite/format";
import { readZip } from "@course-suite/zip";
import { describe, expect, test } from "vitest";
import { PLAYER_STYLE } from "../dist/assets.js";
import { stubCourse, stubInput, stubMedia, stubPlayer } from "../test/stub.js";
import {
  buildPackage,
  type CourseData,
  type FontSource,
  type PlayerBundle,
  unsafePath,
} from "./index.js";

const bytes = (text: string) => new TextEncoder().encode(text);

async function built(...args: Parameters<typeof stubInput>) {
  const result = await buildPackage(stubInput(...args));
  if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  return result.value;
}

async function problems(...args: Parameters<typeof stubInput>) {
  const result = await buildPackage(stubInput(...args));
  if (result.ok) throw new Error("expected the build to fail");
  return result.problems;
}

function withFiles(extra: Record<string, string>): PlayerBundle {
  const player = stubPlayer();
  const files = new Map(player.files);
  for (const [path, text] of Object.entries(extra)) files.set(path, bytes(text));
  return { ...player, files };
}

describe("buildPackage", () => {
  test("builds byte-identical packages from the same input (STD-02 reproducible output)", async () => {
    const first = await built();
    const second = await built();
    expect(Buffer.from(second.zip).equals(Buffer.from(first.zip))).toBe(true);
    expect(first.files).toEqual([
      "adlcp_rootv1p2.xsd",
      "course/data.js",
      // No fonts (ENG-08): the course chose none, so it shows in the device's fonts.
      "ims_xml.xsd",
      "imscp_rootv1p1p2.xsd",
      "imsmanifest.xml",
      "imsmd_rootv1p2p1.xsd",
      "index.html",
      "media/cover-small.jpg",
      "media/diagram.svg",
      "player/boot.js",
    ]);
  });

  test("gives the player the course without ext data, the standard, the version and media paths", async () => {
    let seen: CourseData | undefined;
    const player = stubPlayer();
    await built({
      player: {
        ...player,
        courseDataScript: (data) => {
          seen = data;
          return player.courseDataScript(data);
        },
      },
    });
    expect(seen?.standard).toBe("scorm12");
    expect(seen?.packageVersion).toBe(3);
    expect(seen?.media).toEqual({
      "cover.jpg": "media/cover-small.jpg",
      "diagram.svg": "media/diagram.svg",
    });
    expect(JSON.stringify(seen?.course)).not.toContain("org.example.plugin");
    const { ext: _ext, ...course } = stubCourse();
    expect(seen?.course.title).toBe(course.title);
  });

  test("rejects an invalid course with the JSON Pointer of the fault", async () => {
    const course = { ...stubCourse(), title: 42 } as unknown as ReturnType<typeof stubCourse>;
    expect(await problems({ course })).toEqual([
      { file: "course", path: "/title", message: expect.any(String) },
    ]);
  });

  test("rejects a package version that is not a whole number from 1", async () => {
    for (const packageVersion of [0, 1.5, -2]) {
      expect(await problems({ packageVersion })).toEqual([
        { file: "", message: "the package version must be a whole number from 1" },
      ]);
    }
  });

  test("names a media file the project does not hold", async () => {
    expect(
      await problems({ media: (key) => (key === "diagram.svg" ? undefined : stubMedia[key]) }),
    ).toEqual([
      {
        file: "media/diagram.svg",
        message: "is missing from the project (media file 'diagram.svg')",
      },
    ]);
  });

  test("names a missing launch page", async () => {
    expect(await problems({ player: { ...stubPlayer(), launchPage: "start.html" } })).toEqual([
      { file: "start.html", message: "is the player's launch page but is missing" },
    ]);
  });

  test("rejects unsafe player paths and names that differ only in case", async () => {
    const player = withFiles({ "player/a b.js": "", "Index.html": "" });
    expect(await problems({ player })).toEqual([
      { file: "player/a b.js", message: expect.stringContaining("relative path") },
      { file: "Index.html", message: "has the same name as 'index.html' (ignoring case)" },
    ]);
  });

  test("rejects a player file that names an outside address [standards:R16]", async () => {
    const player = withFiles({
      "player/telemetry.js": 'fetch("https://metrics.example.net/hit?c=1");\n',
      "player/fonts.css": '@import "//fonts.example.net/a.css";\n',
    });
    expect(await problems({ player })).toEqual([
      { file: "player/fonts.css", message: expect.stringContaining("'//fonts.example.net/a.css'") },
      {
        file: "player/telemetry.js",
        message: expect.stringContaining("'https://metrics.example.net/hit?c=1'"),
      },
    ]);
  });

  test("rejects module scripts, import() and import.meta, which break opening from disk (ADR-0003)", async () => {
    const player = withFiles({
      "index.html": '<!doctype html><script type="module" src="player/boot.js"></script>',
      "player/lazy.js": 'import("./chunk.js").then(() => import.meta.url);',
    });
    expect((await problems({ player })).map((p) => [p.file, p.message.split(";")[0]])).toEqual([
      ["index.html", "uses a module script tag"],
      ["player/lazy.js", "uses import("],
      ["player/lazy.js", "uses import.meta"],
    ]);
  });

  test("allows addresses the author configured, the course's own links and namespace names [standards:R16]", async () => {
    const player = withFiles({
      "player/lrs.js": 'const endpoint = "https://lrs.example.com/xapi/";\n',
      "player/link.js": 'const guide = "https://example.org/guide";\n',
      "player/svg.js": 'document.createElementNS("http://www.w3.org/2000/svg", "svg");\n',
    });
    await expect(built({ player, allowedUrls: ["https://lrs.example.com"] })).resolves.toBeTruthy();
    const lookalike = withFiles({ "player/lrs.js": '"https://lrs.example.com.evil.net/"' });
    expect(
      await problems({ player: lookalike, allowedUrls: ["https://lrs.example.com"] }),
    ).toHaveLength(1);
  });

  describe("media", () => {
    // Written by hand in the shape an SVG editor saves: editor namespaces, a DTD address, a comment,
    // RDF licence metadata, text and a link, none of which a browser fetches.
    const editorSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- Saved from https://editor.example.net/ -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"
   viewBox="0 0 10 10" sodipodi:docname="bench.svg">
  <sodipodi:namedview id="view1" inkscape:zoom="1"/>
  <metadata><rdf:RDF><cc:Work rdf:about="">
    <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/>
    <cc:license rdf:resource="http://creativecommons.org/licenses/by/4.0/"/>
  </cc:Work></rdf:RDF></metadata>
  <a href="https://example.net/more"><text x="1" y="5">See http://example.org/source</text></a>
  <rect width="10" height="10" style="fill:url(#shade)"/>
  <use xlink:href="#shape"/><image href="pattern.png" width="1" height="1"/>
</svg>
`;
    // The cue names an address the course text does not, so only the caption could allow it.
    const captions = `WEBVTT

00:00.000 --> 00:04.000
Read more at https://example.org/guide-two
`;

    /** The stub input with extra media files (storage key to text) in the course's media index. */
    function withMedia(files: Record<string, string>) {
      const course = stubCourse();
      for (const [index, key] of Object.keys(files).entries()) {
        course.media.push({ id: `media1000${index}`, key, source: "upload" });
      }
      const media = (key: string) => (key in files ? bytes(files[key] ?? "") : stubMedia[key]);
      return { course, media };
    }

    test("publishes an editor-saved SVG: namespace names, metadata, comments, text and links are not loads [standards:R16]", async () => {
      await expect(built(withMedia({ "bench.svg": editorSvg }))).resolves.toBeTruthy();
    });

    test("publishes a caption file whose cue text names a web address [standards:R16]", async () => {
      await expect(built(withMedia({ "talk.vtt": captions }))).resolves.toBeTruthy();
    });

    test("rejects media that loads an outside address through href, xlink:href, src, srcset, url() or @import [standards:R16]", async () => {
      const svg = `<?xml-stylesheet href="https://styles.example.net/a.css"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<style>@import "//fonts.example.net/b.css"; rect { fill: url('https://img.example.net/c.png') }</style>
<image xlink:href="https://img.example.net/d.png"/>
<image href='//img.example.net/e.png'/>
<foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="f.png"
  srcset="f.png 1x, http://img.example.net/f2.png 2x"/></foreignObject>
</svg>
`;
      expect(
        (await problems(withMedia({ "remote.svg": svg }))).map((p) => [
          p.file,
          p.message.split(",")[0],
        ]),
      ).toEqual(
        [
          "https://styles.example.net/a.css",
          "https://img.example.net/d.png",
          "//img.example.net/e.png",
          "http://img.example.net/f2.png",
          "//fonts.example.net/b.css",
          "https://img.example.net/c.png",
        ].map((url) => ["media/remote.svg", `names '${url}'`]),
      );
    });

    test("still scans the player's own pages, scripts and styles whole [standards:R16]", async () => {
      const player = withFiles({ "player/notes.js": "// docs: https://tracker.example.net/x\n" });
      expect(await problems({ player })).toEqual([
        { file: "player/notes.js", message: expect.stringContaining("tracker.example.net") },
      ]);
    });
  });
});

test("[rise:R18] the theme's links and buttons are checked against the player's own panel colour", () => {
  expect(PLAYER_STYLE.text).toContain(`--panel: ${PANEL};`);
});

describe("fonts (ENG-08, BLK-09)", () => {
  const themed = (theme: NonNullable<Course["theme"]>): Course => ({ ...stubCourse(), theme });
  /** The files under fonts/ and what the course data says of them. */
  async function fontsOf(course: Course, fonts: FontSource = nodeFonts) {
    let seen: CourseData | undefined;
    const player = stubPlayer();
    const value = await built({
      course,
      fonts,
      player: {
        ...player,
        courseDataScript: (data) => {
          seen = data;
          return player.courseDataScript(data);
        },
      },
    });
    return { files: value.files.filter((path) => path.startsWith("fonts/")), data: seen?.fonts };
  }

  test("[ENG-08] a package carries every font the theme uses and only those, each face once", async () => {
    const { files, data } = await fontsOf(
      themed({
        fonts: {
          heading: { kind: "builtin", id: "montserrat" },
          body: TEST_CUSTOM_FONT,
          ui: { kind: "builtin", id: "montserrat" },
        },
      }),
    );
    expect(files).toEqual([
      "fonts/custom-testfont01-bold.woff2",
      "fonts/custom-testfont01-italic.woff2",
      "fonts/custom-testfont01-regular.woff2",
      "fonts/montserrat-OFL.txt",
      "fonts/montserrat-bold.woff2",
      "fonts/montserrat-italic.woff2",
      "fonts/montserrat-regular.woff2",
    ]);
    expect(data).toMatchObject({
      heading: "montserrat",
      body: "custom-testfont01",
      ui: "montserrat",
    });
    expect(data?.families["custom-testfont01"]).toEqual([
      { file: "fonts/custom-testfont01-regular.woff2", weight: 400, style: "normal" },
      { file: "fonts/custom-testfont01-bold.woff2", weight: 700, style: "normal" },
      { file: "fonts/custom-testfont01-italic.woff2", weight: 400, style: "italic" },
    ]);
  });

  test("UI-BLOCKS-EDITOR-R48 a custom font the library no longer has gives way to the device's fonts", async () => {
    const gone = { kind: "custom", id: "gonefont01", name: "Gone" } as const;
    const { files, data } = await fontsOf(themed({ fonts: { heading: gone, body: gone } }));
    expect(data).toEqual({ families: {} });
    expect(files).toEqual([]);
  });

  test("ENG-08, BLK-09: a course whose author chose no font carries no font: its text is in the learner's device fonts", async () => {
    const { files, data } = await fontsOf(stubCourse());
    expect(files).toEqual([]);
    expect(data).toEqual({ families: {} });
    // Only the body chosen: the package carries that family and nothing for the headings.
    const body = await fontsOf(themed({ fonts: { body: { kind: "builtin", id: "literata" } } }));
    expect(body.data).toMatchObject({ body: "literata" });
    expect(body.data?.heading).toBeUndefined();
    expect(body.files.every((path) => path.startsWith("fonts/literata-"))).toBe(true);
  });

  test("D-45, OFL-1.1 section 2: every bundled family a package carries has its licence beside it", async () => {
    const { files } = await fontsOf(
      themed({
        fonts: {
          heading: { kind: "builtin", id: "work-sans" },
          body: { kind: "builtin", id: "crimson-pro" },
        },
      }),
    );
    expect(files.filter((path) => path.endsWith("OFL.txt"))).toEqual([
      "fonts/crimson-pro-OFL.txt",
      "fonts/work-sans-OFL.txt",
    ]);
    const zip = await readZip(
      (
        await built({
          course: themed({ fonts: { heading: { kind: "builtin", id: "work-sans" } } }),
        })
      ).zip,
    );
    if (!zip.ok) throw new Error("unreadable package");
    const licence = new TextDecoder().decode(await zip.value.read("fonts/work-sans-OFL.txt"));
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licence).toContain("Work Sans Project Authors");
  });

  test("a custom font with only its regular face carries that face, as a .woff when it is one", async () => {
    const woff = new Uint8Array([...new TextEncoder().encode("wOFF"), 0, 1, 0, 0]);
    const { files } = await fontsOf(themed({ fonts: { heading: TEST_CUSTOM_FONT } }), (font) =>
      font.kind === "custom" ? { name: "Only regular", regular: woff } : nodeFonts(font),
    );
    expect(files.filter((path) => path.includes("custom"))).toEqual([
      "fonts/custom-testfont01-regular.woff",
    ]);
  });

  test("refuses font files that are not WOFF or WOFF2, and a bundled font it cannot read", async () => {
    const found = await problems({
      course: themed({ fonts: { heading: TEST_CUSTOM_FONT } }),
      fonts: (font) =>
        font.kind === "custom"
          ? { name: "Bad", regular: new TextEncoder().encode("not a font") }
          : font.id === "noto-serif"
            ? undefined
            : nodeFonts(font),
    });
    expect(found).toEqual([
      { file: "fonts/custom-testfont01-regular.font", message: "is not a WOFF or WOFF2 font" },
    ]);
    expect(
      await problems({
        course: themed({ fonts: { body: { kind: "builtin", id: "noto-serif" } } }),
        fonts: () => undefined,
      }),
    ).toEqual([{ file: "fonts/noto-serif", message: "is a font whose files are missing" }]);
  });
});

test("unsafePath accepts plain relative paths only", () => {
  expect(unsafePath("media/cover-small.jpg")).toBeUndefined();
  for (const path of [
    "",
    "/index.html",
    "a//b",
    "../x",
    "a/./b",
    "C:/x",
    "a\\b",
    "x.",
    "con.txt",
  ]) {
    expect(unsafePath(path), path).toBeDefined();
  }
});
