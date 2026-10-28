// The interactive blocks in every output (M2-14, BLK-06; ADR-0004; standards.md rule 16): a course
// with every interactive variant is built by each exporter, run from disk and over loopback through
// a full learner journey without a request beyond the package and its launch endpoint (a button to
// a web page is a link the learner follows, not a request), and the web package shows every block
// of every lesson, with the pictures inside sections, marker cards and flashcards.
import { interactiveBlocksCourse } from "@course-suite/format/test/courses";
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
      // DIAGNOSTIC (to be removed): what is still open when the worker's browser closes.
      const started = Date.now();
      const say = (text: string) => console.log(`[teardown +${Date.now() - started} ms] ${text}`);
      for (const context of browser.contexts()) {
        say(
          `context with ${
            context
              .pages()
              .map((p) => p.url())
              .join(", ") || "no pages"
          }`,
        );
        await context.close();
        say("context closed");
      }
      const timer = setInterval(() => say("browser still closing"), 5000);
      await browser.close();
      clearInterval(timer);
      say("browser closed");
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
