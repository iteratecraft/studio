// Launches a SCORM package in headless Chromium against the test LMS and returns its API call trace
// (standards.md T-6, T-7). Chromium must be installed for Playwright; see AGENTS.md, `test:e2e`.
import type { Browser, Frame, Page } from "playwright-core";
import type { CoursePackage } from "./package.js";
import { type CmiData, type ScormCall, startTestLms } from "./test-lms.js";

export interface RunOptions {
  /** The browser to open the host page in; the caller owns it and closes it. */
  browser: Browser;
  /** How long to wait for LMSFinish / Terminate. Default 15 seconds. */
  timeoutMs?: number;
  /** CMI data the LMS holds at launch, such as the `cmi` of an earlier run (see `relaunchCmi`). */
  cmi?: CmiData;
  /**
   * Runs before the host page opens, for example to install a fake clock with `page.clock`.
   */
  prepare?: (page: Page) => Promise<void>;
  /**
   * The learner: acts in the SCO's frame once it has loaded, then makes it finish, for example by
   * closing it with `closeSco`. Without it the run waits for the SCO to finish by itself.
   */
  drive?: (sco: Frame, page: Page) => Promise<void>;
}

export interface PackageRun {
  /** Every run-time API call, in order. */
  trace: ScormCall[];
  /** True once a call to LMSFinish (1.2) or Terminate (2004) succeeded before the timeout. */
  finished: boolean;
  /** Uncaught errors from the host page or the SCO. */
  pageErrors: string[];
  /** What the LMS holds after the run, in scorm-again's JSON shape. */
  cmi: CmiData;
}

/** Removes the SCO's frame, as an LMS does when the learner closes the course (standards.md rule 9). */
export const closeSco = (page: Page): Promise<void> =>
  page.evaluate('document.getElementById("sco")?.remove()');

/**
 * The CMI data an LMS gives the next launch of a SCORM 1.2 SCO after `cmi`: entry "resume" after a
 * suspend, and the status, bookmark, score and suspend data kept.
 */
export function relaunchCmi(cmi: CmiData): CmiData {
  const core = (cmi.core ?? {}) as Record<string, unknown>;
  return {
    core: {
      entry: core.exit === "suspend" ? "resume" : "",
      lesson_status: core.lesson_status,
      lesson_location: core.lesson_location,
      score: core.score,
    },
    suspend_data: cmi.suspend_data,
  };
}

/**
 * The CMI data an LMS gives the next launch of a SCORM 2004 SCO after `cmi`: entry "resume" after a
 * suspend, and the completion and success status, bookmark, score and suspend data kept.
 */
export function relaunchCmi2004(cmi: CmiData): CmiData {
  return {
    entry: cmi.exit === "suspend" ? "resume" : "",
    completion_status: cmi.completion_status,
    success_status: cmi.success_status,
    location: cmi.location,
    score: cmi.score,
    suspend_data: cmi.suspend_data,
  };
}

export async function runPackage(pkg: CoursePackage, options: RunOptions): Promise<PackageRun> {
  if (pkg.descriptor.kind !== "scorm") {
    throw new Error(`runPackage launches SCORM packages; this one is ${pkg.descriptor.kind}`);
  }
  const lms = await startTestLms(pkg, options.cmi ? { cmi: options.cmi } : {});
  try {
    const page = await options.browser.newPage();
    try {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await options.prepare?.(page);
      await page.goto(lms.hostUrl ?? "");
      if (options.drive) {
        const frame = await (await page.waitForSelector("#sco")).contentFrame();
        if (!frame) throw new Error("The host page has no SCO frame");
        await options.drive(frame, page);
      }
      const finished = await page
        .waitForFunction("window.__done === true", undefined, {
          timeout: options.timeoutMs ?? 15_000,
        })
        .then(
          () => true,
          () => false,
        );
      const trace = (await page.evaluate("window.__trace")) as ScormCall[];
      const cmi = (await page.evaluate("window.__cmi()")) as CmiData;
      return { trace, finished, pageErrors, cmi };
    } finally {
      await page.close();
    }
  } finally {
    await lms.close();
  }
}
