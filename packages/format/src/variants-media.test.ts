import { describe, expect, test } from "vitest";
import { EMBED_ATTACKS, mediaCourse } from "../test/courses.js";
import { edit } from "../test/edit.js";
import { validateCourse } from "./validate.js";
import { EMBED_PROVIDERS, embedProvider, VARIANTS, variantSettings } from "./variants.js";

/** The path of a block of the media course, by its id. */
const at = (id: string) => {
  for (const [e, entry] of mediaCourse().entries.entries()) {
    if (entry.kind !== "lesson") continue;
    const b = entry.blocks.findIndex((block) => block.id === id);
    if (b >= 0) return `/entries/${e}/blocks/${b}`;
  }
  throw new Error(id);
};

describe("multimedia block variants (M2-13, BLK-05)", () => {
  test("[rise:3C] the media course is valid and uses every multimedia variant", () => {
    const course = mediaCourse();
    expect(validateCourse(course)).toEqual([]);
    const used = new Set(
      course.entries.flatMap((entry) =>
        entry.kind === "lesson" ? entry.blocks.map((b) => `${b.category}/${b.variant}`) : [],
      ),
    );
    for (const variant of Object.keys(VARIANTS.multimedia ?? {})) {
      expect(used).toContain(`multimedia/${variant}`);
    }
  });

  test.each([
    [
      "an embed address that is not https",
      "blkembed01",
      "embedUrl",
      "http://example.com/x",
      "must match",
    ],
    [
      "an embed address with a quote in it",
      "blkembed01",
      "embedUrl",
      'https://a.example/"x',
      "must match",
    ],
    ["a provider not on the list (D-44)", "blkembed01", "provider", "Example", "must be one of"],
    ["a border that is not a boolean", "blkembed01", "border", "yes", "must be a boolean"],
    ["forward seeking as a string", "blkaudio01", "forwardSeeking", "no", "must be a boolean"],
    ["a transcript that is not text", "blkaudio01", "transcript", 3, "must be a string"],
    ["a thumbnail without a file", "blkvideo01", "poster", {}, "is required"],
    [
      "a thumbnail key that is not a media key",
      "blkvideo01",
      "poster",
      { key: "../x" },
      "must match",
    ],
    ["a video corner radius over 30", "blkvideo01", "cornerRadius", 31, "at most 30"],
    ["an empty file name", "blkattach1", "fileName", "", "must not be empty"],
    ["a negative file size", "blkattach1", "fileSize", -1, "at least 0"],
    ["a file size that is not a whole number", "blkattach1", "fileSize", 1.5, "must be an integer"],
    ["code that is not text", "blkcode001", "code", ["x"], "must be a string"],
    ["word wrap as a string", "blkcode001", "wrap", "yes", "must be a boolean"],
    ["a snippet colour that is not a colour", "blkcode001", "background", "red", "must match"],
    ["an image overlay over 100 %", "blkonimage", "overlayOpacity", 150, "at most 100"],
    ["zoom as a string", "blkimgtext", "zoom", "on", "must be a boolean"],
    ["an image side that is not left or right", "blkimgtext", "position", "top", "must be one of"],
    ["a setting no variant has", "blkaudio01", "autoplay", true, "is not a known property"],
  ])("[rise:3C] %s is reported at its path", (_name, id, setting, value, message) => {
    const path = `${at(id)}/variantSettings/${setting}`;
    const errors = validateCourse(edit(mediaCourse(), path, value));
    expect(errors).toEqual([
      {
        path: expect.stringMatching(new RegExp(`^${path}`)),
        message: expect.stringContaining(message),
      },
    ]);
  });

  test.each(EMBED_ATTACKS)("D-44: an embed named YouTube on %s is refused", (_trick, address) => {
    const path = `${at("blkembed01")}/variantSettings/embedUrl`;
    expect(embedProvider(address, "YouTube")).toBeUndefined();
    expect(validateCourse(edit(mediaCourse(), path, address))).toEqual([
      { path, message: "is not a player address of YouTube" },
    ]);
  });

  test("D-44: each provider's player address, with a start time, is accepted for that provider only", () => {
    const players = {
      YouTube: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90",
      Vimeo: "https://player.vimeo.com/video/76979871?dnt=1#t=30s",
      Loom: "https://www.loom.com/embed/0123456789abcdef0123456789abcdef",
      Dailymotion: "https://www.dailymotion.com/embed/video/x8abc12",
    };
    expect(Object.keys(players)).toEqual(Object.keys(EMBED_PROVIDERS));
    const embed = at("blkembed01");
    for (const [provider, address] of Object.entries(players)) {
      expect(embedProvider(address)).toBe(provider);
      expect(embedProvider(address, provider)).toBe(provider);
      const course = edit(
        edit(mediaCourse(), `${embed}/variantSettings/provider`, provider),
        `${embed}/variantSettings/embedUrl`,
        address,
      );
      expect(validateCourse(course), provider).toEqual([]);
      const other = provider === "Loom" ? "Vimeo" : "Loom";
      expect(validateCourse(edit(course, `${embed}/variantSettings/provider`, other))).toEqual([
        {
          path: `${embed}/variantSettings/embedUrl`,
          message: `is not a player address of ${other}`,
        },
      ]);
    }
  });

  test("an unknown multimedia variant is reported", () => {
    expect(validateCourse(edit(mediaCourse(), `${at("blkaudio01")}/variant`, "podcast"))).toEqual([
      { path: `${at("blkaudio01")}/variant`, message: "is not a multimedia variant" },
    ]);
  });

  test("UI-BLOCKS-EDITOR-R37: forward seeking is on, a border off and code unwrapped unless set", () => {
    expect(variantSettings({ category: "multimedia", variant: "video" })).toEqual({
      forwardSeeking: true,
      cornerRadius: 0,
    });
    expect(variantSettings({ category: "multimedia", variant: "embed" })).toEqual({
      border: false,
    });
    expect(variantSettings({ category: "multimedia", variant: "code-snippet" })).toEqual({
      wrap: false,
      background: "#1f2430",
      contrast: "auto",
    });
  });
});
