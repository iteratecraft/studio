// The media blocks in the published player (M2-13, BLK-05; rise.md §3 C, §3 D, §3 G), opened from
// disk: forward seeking turned off holds audio and video back by any kind of seek and finishes the
// block at its end; the carousel by buttons and arrow keys, counted done once every image was
// seen; image zoom; caption tracks per language; the embed that loads nothing until asked; the
// file to download; narration; the lesson header image.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Course } from "@course-suite/format";
import { mediaCourse } from "@course-suite/format/test/courses";
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

test.describe("images and galleries", () => {
  test("[rise:3C] UI-BLOCKS-R52, accessibility.md D4, BLK-04: the carousel moves by buttons and arrow keys, announces its position, and is done once every image was seen", async ({
    write,
    open,
    page,
  }) => {
    const subject = mediaCourse();
    const pictures = subject.entries[0] as Extract<Course["entries"][number], { kind: "lesson" }>;
    const carousel = pictures.blocks.find((block) => block.id === "blkcarouse") as Block;
    await write({
      course: {
        ...subject,
        entries: [
          lesson("lessonslid", "Slides", carousel, continueBlock("cgateslide", "block-above")),
        ],
      },
    });
    await open("#/lessons/lessonslid");
    const position = page.locator(".carousel-position");
    await expect(position).toHaveText("Image 1 of 3");
    await expect(position).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("group", { name: "Image 1 of 3" })).toBeVisible();
    const gate = page.locator(".continue");
    await expect(gate).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(position).toHaveText("Image 2 of 3");
    await page.keyboard.press("ArrowRight");
    await expect(position).toHaveText("Image 3 of 3");
    await expect(gate).not.toHaveAttribute("aria-disabled");
    await page.keyboard.press("ArrowRight");
    await expect(position).toHaveText("Image 1 of 3");
    await page.keyboard.press("ArrowLeft");
    await expect(position).toHaveText("Image 3 of 3");
  });

  test("[rise:3C] blocks-interactions section 4, UI-ACCESSIBILITY-R34: an image opens large by keyboard and Escape closes it, focus going back; decorative images have empty alt text", async ({
    write,
    open,
    page,
  }) => {
    await write({ course: mediaCourse() });
    await open("#/lessons/lessonpics");
    await expect(page.locator(".lesson-header-image")).toHaveAttribute("alt", "");
    await expect(page.locator(".figure-full-width img")).toHaveAttribute("alt", "");
    const zoom = page.getByRole("button", {
      name: "A grey heron standing in shallow water Enlarge image",
    });
    await zoom.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "A grey heron standing in shallow water" });
    await expect(dialog).toBeVisible();
    await expectAccessible(page, "enlarged image");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(zoom).toBeFocused();
    // Zoom off: a plain image.
    await expect(page.locator(".image-text button.zoom")).toHaveCount(0);
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
