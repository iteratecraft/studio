// Launches a SCORM package in headless Chromium against the test LMS and returns its API call trace
// (standards.md T-6, T-7). Chromium must be installed for Playwright; see AGENTS.md, `test:e2e`.
import { type Browser, chromium } from "playwright-core";
import type { CoursePackage } from "./package.js";
import { type ScormCall, startTestLms } from "./test-lms.js";

export interface RunOptions {
  /** A browser to reuse; when absent one is launched and closed. */
  browser?: Browser;
  /** How long to wait for LMSFinish / Terminate. Default 15 seconds. */
  timeoutMs?: number;
}

export interface PackageRun {
  /** Every run-time API call, in order. */
  trace: ScormCall[];
  /** True once the SCO called LMSFinish (1.2) or Terminate (2004) before the timeout. */
  finished: boolean;
  /** Uncaught errors from the host page or the SCO. */
  pageErrors: string[];
}

export async function runPackage(
  pkg: CoursePackage,
  options: RunOptions = {},
): Promise<PackageRun> {
  if (pkg.descriptor.kind !== "scorm") {
    throw new Error(`runPackage launches SCORM packages; this one is ${pkg.descriptor.kind}`);
  }
  const lms = await startTestLms(pkg);
  try {
    const browser = options.browser ?? (await chromium.launch());
    try {
      const page = await browser.newPage();
      try {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(lms.hostUrl ?? "");
        const finished = await page
          .waitForFunction("window.__done === true", undefined, {
            timeout: options.timeoutMs ?? 15_000,
          })
          .then(
            () => true,
            () => false,
          );
        const trace = (await page.evaluate("window.__trace")) as ScormCall[];
        return { trace, finished, pageErrors };
      } finally {
        await page.close();
      }
    } finally {
      if (!options.browser) await browser.close();
    }
  } finally {
    await lms.close();
  }
}
