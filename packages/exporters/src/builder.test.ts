import { describe, expect, test } from "vitest";
import { stubCourse, stubInput, stubMedia, stubPlayer } from "../test/stub.js";
import { buildPackage, type CourseData, type PlayerBundle, unsafePath } from "./index.js";

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

  // Media as authors' tools save it: an SVG with editor namespaces and RDF metadata, a caption file
  // whose cue text names a web page. None of these URLs is ever fetched.
  const editorSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Drawn with a vector editor (http://editor.example.org/) -->
<svg width="10mm" height="10mm" viewBox="0 0 10 10" version="1.1"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <sodipodi:namedview id="view1" inkscape:zoom="1"/>
  <metadata><rdf:RDF><cc:Work rdf:about="">
    <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/>
    <cc:license rdf:resource="http://creativecommons.org/licenses/by/4.0/"/>
  </cc:Work></rdf:RDF></metadata>
  <a href="https://example.net/more"><text x="1" y="5">See https://example.net/notes</text></a>
  <use xlink:href="#shape"/><image href="pattern.png" width="1" height="1"/>
</svg>
`;
  const captions =
    "WEBVTT\n\n00:00.000 --> 00:04.000\nRead more at https://example.org/guide-two\n";

  /** The stub input with extra media files (storage key to text) in the course's media index. */
  function withMedia(files: Record<string, string>) {
    const course = stubCourse();
    for (const [i, key] of Object.keys(files).entries()) {
      course.media.push({ id: `media1000${i}`, key, source: "upload" });
    }
    const media = (key: string) => (key in files ? bytes(files[key] ?? "") : stubMedia[key]);
    return { course, media };
  }

  test("publishes an editor-saved SVG: namespace names, metadata, text and links are not loads [standards:R16]", async () => {
    await expect(built(withMedia({ "drawing.svg": editorSvg }))).resolves.toBeTruthy();
  });

  test("publishes a caption file whose cue text names a web address [standards:R16]", async () => {
    await expect(built(withMedia({ "captions.vtt": captions }))).resolves.toBeTruthy();
  });

  test("rejects media that loads from outside through href, xlink:href, src, url() and @import [standards:R16]", async () => {
    const svg =
      '<?xml-stylesheet href="https://cdn.example.net/a.css"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<style>@import "//fonts.example.net/b.css"; rect { fill: url( "https://cdn.example.net/c.svg#g" ) }</style>' +
      "<image href=\"https://cdn.example.net/d.png\"/><use xlink:href='https://cdn.example.net/e.svg#s'/>" +
      '<foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="http://cdn.example.net/f.gif"/></foreignObject>' +
      "</svg>";
    const found = (await problems(withMedia({ "loads.svg": svg }))).map((p) => [
      p.file,
      p.message.split("'")[1],
    ]);
    expect(found).toEqual(
      [
        "https://cdn.example.net/a.css",
        "https://cdn.example.net/d.png",
        "https://cdn.example.net/e.svg#s",
        "http://cdn.example.net/f.gif",
        "//fonts.example.net/b.css",
        "https://cdn.example.net/c.svg#g",
      ].map((url) => ["media/loads.svg", url]),
    );
  });

  test("still reads the player's own pages, scripts and styles in full [standards:R16]", async () => {
    const player = withFiles({ "player/notes.js": "// docs: https://tracker.example.net/x\n" });
    expect(await problems({ player })).toEqual([
      { file: "player/notes.js", message: expect.stringContaining("tracker.example.net") },
    ]);
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
