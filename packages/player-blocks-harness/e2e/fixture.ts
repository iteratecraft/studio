// Browser-test fixture: a course package in a scratch folder, opened in Chromium from disk (file://),
// with every console error, page error and request recorded.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sampleCourse } from "@course-suite/format/test/courses";
import type { PlayerEvent, TestHooks } from "@course-suite/player-blocks";
import type { AdapterCall } from "@course-suite/tracking";
import { test as base, type Page } from "@playwright/test";
import { type PackageOptions, writePackage } from "../src/package.ts";

declare global {
  interface Window {
    blocksPlayerTestHooks?: TestHooks;
  }
}

/**
 * Turns on the player test hooks for the next page load. With `keep`, the debug adapter keeps the
 * saved state in session storage, so a reload of the same tab resumes.
 */
export async function useHooks(page: Page, { keep = false } = {}): Promise<void> {
  await page.addInitScript((keepState) => {
    window.blocksPlayerTestHooks = keepState ? { storage: sessionStorage } : {};
  }, keep);
}

/** The debug adapter calls the player made so far, oldest first. */
export const adapterCalls = (page: Page): Promise<AdapterCall[]> =>
  page.evaluate(() =>
    JSON.parse(JSON.stringify(window.blocksPlayerTestHooks?.adapter?.calls ?? [])),
  );

/** The player events so far, oldest first, without their times. */
export const playerEvents = (page: Page): Promise<PlayerEvent[]> =>
  page.evaluate(() =>
    (window.blocksPlayerTestHooks?.events ?? []).map(({ at: _, ...event }) => event as PlayerEvent),
  );

export interface Visit {
  /** Console errors and uncaught page errors. */
  errors: string[];
  /** Requests that failed or went outside the package folder. */
  badRequests: string[];
}

interface Fixtures {
  /** The package folder, removed after the test. */
  dir: string;
  /** Writes the package (the sample course unless told otherwise). */
  write: (options?: PackageOptions) => Promise<void>;
  /** Opens the package's index page from disk, optionally at an address (`#/lessons/<id>`). */
  open: (hash?: string, base?: string) => Promise<Visit>;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures take their dependencies this way.
  dir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "player-blocks-"));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  write: async ({ dir }, use) => {
    await use((options = { course: sampleCourse() }) => writePackage(dir, options));
  },
  open: async ({ page, dir }, use) => {
    await use(async (hash = "", baseUrl = pathToFileURL(join(dir, "/")).href) => {
      const visit: Visit = { errors: [], badRequests: [] };
      page.on("console", (message) => {
        if (message.type() === "error") visit.errors.push(message.text());
      });
      page.on("pageerror", (error) => visit.errors.push(error.message));
      page.on("requestfailed", (request) => visit.badRequests.push(request.url()));
      page.on("request", (request) => {
        if (!request.url().startsWith(baseUrl)) visit.badRequests.push(request.url());
      });
      await page.goto(`${baseUrl}index.html${hash}`, { waitUntil: "domcontentloaded" });
      return visit;
    });
  },
});

export { expect } from "@playwright/test";
