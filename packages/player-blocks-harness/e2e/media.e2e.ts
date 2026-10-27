// The media blocks in the published player (M2-13, BLK-05; rise.md §3 C, §3 D, §3 G), opened from
// disk: forward seeking turned off holds audio and video back by any kind of seek and finishes the
// block at its end; caption tracks per language; the embed that loads nothing until asked; the
// file to download; the code snippet; narration; the lesson header image. Images and galleries are
// BLK-04's (static.e2e.ts).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Course } from "@course-suite/format";
import { EMBED_ATTACKS, mediaCourse } from "@course-suite/format/test/courses";
import { expectAccessible } from "./axe.ts";
import { continueBlock, course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";

/** A mono 16-bit WAV of a quiet tone, `seconds` long: a real file the browser plays. */
function tone(seconds: number): Uint8Array {
  const rate = 8000;
  const samples = rate * seconds;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (const [i, char] of [...value].entries()) view.setUint8(at + i, char.charCodeAt(0));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 2000), true);
  }
  return bytes;
}

const audio = (id: string, forwardSeeking?: boolean): Block => ({
  id,
  category: "multimedia",
  variant: "audio",
  ...(forwardSeeking !== undefined && { variantSettings: { forwardSeeking } }),
  media: [{ key: "tone.wav" }],
});

/** Two audio blocks on one tone, each before a continue block that waits for it. */
function listening(): Course {
  return {
    ...course([
      lesson(
        "lessonhear",
        "Listen",
        audio("blkaudiofr"),
        continueBlock("cgatefree1", "block-above"),
        audio("blkaudiolk", false),
        continueBlock("cgatelock1", "block-above"),
      ),
    ]),
    media: [{ id: "mediatone1", key: "tone.wav", mimeType: "audio/wav", source: "upload" }],
  };
}

test.describe("audio and video", () => {
  test("[rise:3G] UI-BLOCKS-EDITOR-R37, UI-BLOCKS-R45, BLK-05: with forward seeking off, no seek goes past what was played, and playing to the end opens the continue block; with it on, seeking is free", async ({
    write,
    open,
    dir,
    page,
  }) => {
    await write({ course: listening() });
    writeFileSync(join(dir, "media", "tone.wav"), tone(2));
    await open("#/lessons/lessonhear");
    const players = page.locator("audio");
    // Forward seeking on: the block is done when seen, and seeking ahead is kept.
    const free = page.locator(".continue").first();
    await expect(free).not.toHaveAttribute("aria-disabled");
    await players.first().evaluate(async (element) => {
      const media = element as HTMLAudioElement;
      if (media.readyState < 1) await new Promise((resolve) => (media.onloadedmetadata = resolve));
      media.currentTime = 1.5;
      await new Promise((resolve) => (media.onseeked = resolve));
    });
    expect(await players.first().evaluate((media) => (media as HTMLAudioElement).currentTime)).toBe(
      1.5,
    );
    await free.click();

    // Forward seeking off: every way of seeking ahead lands back on what was played.
    const locked = page.locator(".continue").nth(1);
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    const after = await players.nth(1).evaluate(async (element) => {
      const media = element as HTMLAudioElement;
      if (media.readyState < 1) await new Promise((resolve) => (media.onloadedmetadata = resolve));
      const settle = () =>
        new Promise((resolve) => {
          media.onseeked = () => {
            if (!media.seeking) resolve(undefined);
          };
        });
      // The seek bar, the arrow keys and media keys all set the time, which fires "seeking".
      media.currentTime = 1.5;
      await settle();
      const unplayed = media.currentTime;
      // Some played, then a jump ahead lands at the furthest point played; going back is free.
      media.muted = true;
      await media.play();
      await new Promise<void>((resolve) => {
        media.ontimeupdate = () => {
          if (media.currentTime > 0.3) resolve();
        };
      });
      media.pause();
      const reached = media.currentTime;
      media.currentTime = 1.8;
      await settle();
      const ahead = media.currentTime;
      media.currentTime = 0.1;
      await settle();
      return { unplayed, reached, ahead, back: media.currentTime };
    });
    expect(after.unplayed).toBe(0);
    expect(after.ahead).toBeLessThanOrEqual(after.reached + 0.5);
    expect(after.ahead).toBeLessThan(1);
    expect(after.back).toBe(0.1);
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    // Played to the end, at double speed (learners may change the speed), it opens the gate.
    await players.nth(1).evaluate((element) => {
      const media = element as HTMLAudioElement;
      media.muted = true;
      media.playbackRate = 2;
      void media.play();
    });
    await expect(locked).not.toHaveAttribute("aria-disabled");
  });

  test("UI-BLOCKS-R45: audio or video with forward seeking off but no file to play shows nothing and holds no continue block", async ({
    write,
    open,
    page,
  }) => {
    const unplayable = (id: string, variant: string, key?: string): Block => ({
      id,
      category: "multimedia",
      variant,
      variantSettings: { forwardSeeking: false },
      ...(key && { media: [{ key }] }),
    });
    await write({
      course: course([
        lesson(
          "lessonnone",
          "Nothing to play",
          unplayable("blkaudnone", "audio"),
          continueBlock("cgateaudio", "block-above"),
          unplayable("blkvidnone", "video"),
          continueBlock("cgatevideo", "block-above"),
          unplayable("blkvidgone", "video", "gone.mp4"),
          continueBlock("cgategone1", "block-above"),
        ),
      ]),
    });
    await open("#/lessons/lessonnone");
    // Each gate is ready as soon as it shows, and pressing it shows the next.
    for (const id of ["cgateaudio", "cgatevideo", "cgategone1"]) {
      const gate = page.locator(`[data-block=${id}] .continue`);
      await expect(gate).toBeVisible();
      await expect(gate).not.toHaveAttribute("aria-disabled");
      await expect(page.locator(`[data-block=${id}] .continue-hint`)).toBeHidden();
      await gate.click();
    }
    await expect(page.locator("audio, video")).toHaveCount(0);
  });

  test("[rise:3C] UI-ACCESSIBILITY-R41, LA8, BLK-05: a video has a caption track per language named in the course language, a thumbnail and a transcript (blocks-editor 2.12); the author can turn off the speed menu", async ({
    write,
    open,
    page,
  }) => {
    const subject = mediaCourse();
    await write({ course: { ...subject, navigation: { videoSpeed: false } } });
    await open("#/lessons/lessonsoun");
    const video = page.locator("video");
    await expect(video.locator("track")).toHaveCount(2);
    expect(
      await video
        .locator("track")
        .evaluateAll((tracks) =>
          tracks.map((track) => [track.getAttribute("srclang"), track.getAttribute("label")]),
        ),
    ).toEqual([
      ["en", "English"],
      ["fr", "French"],
    ]);
    await expect(video).toHaveAttribute("controlslist", "noplaybackrate");
    await expect(video.locator("track").first()).toHaveAttribute("src", "media/otters-en.vtt");
    // The author's thumbnail until it plays, and its transcript (blocks-editor.md 2.12).
    await expect(video).toHaveAttribute("poster", "media/bank.svg");
    const figure = page.locator(".media-video");
    await figure.getByText("Transcript").click();
    await expect(figure.getByText("Two otters roll in the shallows.")).toBeVisible();
  });
});

test.describe("pictures from the media library", () => {
  test("[rise:3B] [rise:3C] UI-ACCESSIBILITY-R34: the lesson header image and the course's pictures keep their alt text, empty when decorative", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: mediaCourse() });
    await open("#/lessons/lessonpics");
    await expect(page.locator(".lesson-header-image")).toHaveAttribute("alt", "");
    await expect(
      page.getByRole("img", { name: "A grey heron standing in shallow water" }),
    ).toBeVisible();
    await expect(page.locator("[data-block=blkfullwid] img.image")).toHaveAttribute("alt", "");
    await expectAccessible(page, "pictures");
  });
});

test.describe("code snippets", () => {
  test("[rise:3C] blocks-editor 2.5, 2.12, BLK-05: a code snippet shows the code as written with its language, scrolls by keyboard and copies", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: mediaCourse() });
    await open("#/lessons/lessonlink");
    const block = page.locator("[data-block=blkcode001]");
    const code = block.getByRole("region", { name: "JavaScript code" });
    await code.focus();
    await expect(code).toBeFocused();
    await expect(block.locator("pre code")).toHaveText(
      'const pace = "slow";\nconsole.log("The river is " + pace + " today.");',
      { useInnerText: true },
    );
    await expect(block.locator(".code-language")).toHaveText("JavaScript");
    await expect(block.locator("pre")).toHaveClass(/code-wrap/);
    await expect(block.locator("figcaption")).toHaveText("Log the river's pace.");
    await expectAccessible(page, "code snippet");
    // Copied where the page may use the clipboard; selected for the keyboard where it may not.
    await page.evaluate(() => {
      const page = window as { copied?: string; denied?: boolean };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            if (page.denied) throw new Error("not allowed");
            page.copied = text;
          },
        },
      });
    });
    await block.getByRole("button", { name: "Copy code" }).click();
    await expect(block.getByRole("status")).toHaveText("Code copied");
    expect(await page.evaluate(() => (window as { copied?: string }).copied)).toContain(
      'const pace = "slow";',
    );
    await page.evaluate(() => {
      (window as { denied?: boolean }).denied = true;
    });
    await block.getByRole("button", { name: "Copy code" }).click();
    await expect(block.getByRole("status")).toHaveText(
      "The code is selected: copy it with your keyboard",
    );
    expect(await page.evaluate(() => getSelection()?.toString())).toContain("console.log");
  });
});

test.describe("embeds, files and narration", () => {
  test("[rise:3C] D-44, ADR-0004, BLK-05: an embed loads nothing until the learner asks, then the provider's frame only", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: mediaCourse() });
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) outside.push(request.url());
    });
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Player</title>" }),
    );
    await open("#/lessons/lessonlink");
    const load = page.getByRole("button", { name: "Show the content from YouTube" });
    await expect(load).toHaveAccessibleDescription("It loads from YouTube, outside this course.");
    await expectAccessible(page, "embed before it loads");
    expect(outside).toEqual([]);
    await load.click();
    await expect(page.getByTitle("Content from YouTube")).toBeFocused();
    await expect
      .poll(() => outside)
      .toEqual(["https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"]);
    // The file to download: its name and size, never a requirement (UI-BLOCKS-R19).
    const link = page.getByRole("link", { name: "Download River map.pdf" });
    await expect(link).toHaveAttribute("href", "media/map.pdf");
    await expect(link).toHaveAttribute("download", "River map.pdf");
    await expect(page.locator(".attachment-row")).toContainText("24.6 kB");
  });

  test("D-44: an embed whose address is not a player of its provider frames nothing and offers nothing to load or follow", async ({
    write,
    open,
    page,
  }) => {
    const embed = ([trick, embedUrl]: (typeof EMBED_ATTACKS)[number], i: number): Block => ({
      id: `blkattack${i.toString(36)}`,
      category: "multimedia",
      variant: "embed",
      variantSettings: { embedUrl, provider: "YouTube" },
      items: [{ id: `itmattack${i.toString(36)}`, kind: "content", text: `<p>${trick}</p>` }],
    });
    // A hand-made document: the format refuses these, so they reach the player only unchecked.
    await write({ course: course([lesson("lessonfake", "Fakes", ...EMBED_ATTACKS.map(embed))]) });
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) outside.push(request.url());
    });
    await open("#/lessons/lessonfake");
    const figures = page.locator(".media-embed");
    await expect(figures).toHaveCount(EMBED_ATTACKS.length);
    for (const [i, [trick]] of EMBED_ATTACKS.entries()) {
      const figure = figures.nth(i);
      await expect(figure.locator("figcaption"), trick).toHaveText(trick);
      await expect(figure.locator(".embed-notice"), trick).toHaveText(
        "This content cannot be shown.",
      );
    }
    await expect(figures.getByRole("button")).toHaveCount(0);
    await expect(figures.getByRole("link")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText(/youtube|example\.net|vimeo/i)).toHaveCount(0);
    await expectAccessible(page, "refused embeds");
    expect(outside).toEqual([]);
  });

  test("[rise:3D] blocks-editor 2.4, W16: narration sits at the top of its block with its transcript", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: mediaCourse() });
    await open("#/lessons/lessonsoun");
    const block = page.locator("[data-block=blknarrate] .block-inner");
    await expect(block.locator("> :first-child")).toHaveClass("narration");
    await expect(block.locator("audio")).toHaveAttribute("aria-label", "Narration");
    await block.getByText("Transcript").click();
    await expect(block.getByText("Listen as you read.")).toBeVisible();
  });
});
