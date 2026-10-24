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
