// The interactive blocks in every output (M2-14, BLK-06; ADR-0004; standards.md rule 16): a course
// with every interactive variant is built by each exporter, run from disk and over loopback through
// a full learner journey without a request beyond the package and its launch endpoint (a button to
// a web page is a link the learner follows, not a request), and the web package shows every block
// of every lesson, with the pictures inside sections, marker cards and flashcards.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { webExporter } from "@course-suite/exporters";
import type { LessonEntry } from "@course-suite/format";
import { interactiveBlocksCourse } from "@course-suite/format/test/courses";
import { readZip } from "@course-suite/zip";
import { test as base, expect } from "@playwright/test";
import { runPackage } from "../src/run-package.js";
import { blocksZip, scorm12Package } from "../test/blocks.js";
import {
  type Internet,
  type Mode,
  outboundRequests,
  registeredExporters,
  startInternet,
} from "../test/no-network.js";

const test = base.extend<object, { internet: Internet }>({
  internet: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures take their dependencies this way.
    async ({}, use) => {
      const internet = await startInternet();
      await use(internet);
      await internet.close();
    },
    { scope: "worker" },
  ],
  browser: [
    async ({ playwright, internet }, use) => {
      const browser = await playwright.chromium.launch({ args: internet.args });
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
});

const course = interactiveBlocksCourse();

for (const exporter of registeredExporters()) {
  for (const mode of ["file", "http"] as Mode[]) {
    test(`[rise:3C] [standards:R16] BLK-06: ${exporter.standard} from ${mode}: the interactive blocks request only the package and its launch endpoint`, async ({
      browser,
      internet,
    }) => {
      const zip = await blocksZip(course, exporter);
      const offending = await outboundRequests(browser, internet, {
        standard: exporter.standard,
        zip,
        course,
        mode,
      });
      expect(offending, "requests beyond the package and its launch endpoint").toEqual([]);
    });
  }
}

test("[rise:3C] BLK-06, blocks-interactions 2.10, A10, A11: the exported web package shows every interactive block of every lesson, carries its items' media, and leaves out the button that exits the course", async ({
  page,
}) => {
  const zip = await readZip(await blocksZip(course, webExporter()));
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  // The items' video, its captions and their audio go in the package.
  expect(zip.value.names).toEqual(
    expect.arrayContaining(["media/spin.mp4", "media/spin-en.vtt", "media/bell.wav"]),
  );
  const dir = mkdtempSync(join(tmpdir(), "interactive-blocks-"));
  try {
    for (const name of zip.value.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), (await zip.value.read(name)) as Uint8Array);
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const lesson of course.entries.filter((e): e is LessonEntry => e.kind === "lesson")) {
      await page.goto(`${pathToFileURL(join(dir, "index.html")).href}#/lessons/${lesson.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
      await expect(page.locator(".blocks > [data-block]")).toHaveCount(lesson.blocks.length);
      // Open what holds a picture: a section, a marker's card; turn the cards over.
      if (lesson.id === "ialessfold") await page.getByRole("button", { name: "Tyres" }).click();
      if (lesson.id === "ialesspict") {
        await page.getByRole("button", { name: /^Marker 2/ }).click();
        await expect(page.getByRole("dialog", { name: "Saddle" })).toBeVisible();
      }
      if (lesson.id === "ialesscard") {
        await page.locator("[data-block=iacardgrid] .card-turn").first().click();
        // Exit is for learning-system packages only (2.10); the other buttons stay.
        await expect(page.getByRole("link", { name: "Ask the workshop" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Leave the course" })).toHaveCount(0);
      }
      // Pictures on show load from the package's own media folder.
      for (const image of await page.locator(".blocks img:not(.zoom-image):visible").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);
      }
    }
    expect(errors).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("[rise:3C] [standards:R7] UI-BLOCKS-R18, BLK-06: in the LMS, a button that exits the course ends the session as the exit link does", async ({
  browser,
}) => {
  const run = await runPackage(await scorm12Package(course), {
    browser,
    drive: async (sco) => {
      await sco.getByRole("link", { name: "Begin course" }).click();
      await sco
        .getByRole("navigation", { name: "Course contents" })
        .getByRole("link", { name: "Cards and buttons" })
        .click();
      await sco.getByRole("button", { name: "Leave the course" }).click();
      await expect(sco.getByRole("main")).toContainText("You have left the course.");
    },
  });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(run.trace.at(-1)?.method).toBe("LMSFinish");
});
