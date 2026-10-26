// The text and static blocks in every output (M2-12, BLK-04; ADR-0004; standards.md rule 16): a
// course with every text and static variant is built by each exporter, run from disk and over
// loopback through a full learner journey without a request beyond the package and its launch
// endpoint, and the web package shows every block of every lesson.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { webExporter } from "@course-suite/exporters";
import type { LessonEntry } from "@course-suite/format";
import { staticBlocksCourse } from "@course-suite/format/test/courses";
import { readZip } from "@course-suite/zip";
import { test as base, expect } from "@playwright/test";
import { blocksZip } from "../test/blocks.js";
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

const course = staticBlocksCourse();

for (const exporter of registeredExporters()) {
  for (const mode of ["file", "http"] as Mode[]) {
    test(`[rise:3C] [standards:R16] BLK-04: ${exporter.standard} from ${mode}: the text and static blocks request only the package and its launch endpoint`, async ({
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

test("[rise:3C] BLK-04: the exported web package shows every text and static block of every lesson", async ({
  page,
}) => {
  const zip = await readZip(await blocksZip(course, webExporter()));
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  const dir = mkdtempSync(join(tmpdir(), "static-blocks-"));
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
