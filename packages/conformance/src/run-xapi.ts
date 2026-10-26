// Launches an xAPI or cmi5 package in headless Chromium the way an LMS does: the launch page with
// the launch-link parameters endpoint, auth, actor and registration (standards.md X-1), or for cmi5
// those the test LMS's launcher prepares, with its one-time fetch URL (C-1), reporting to the test
// LMS's in-memory LRS. The run ends when the course page goes away and the LRS has gone quiet;
// it returns what the LRS holds and every request the page made.
import type { Browser, Page } from "playwright-core";
import type { LrsRequest, MemoryLrs } from "./memory-lrs.js";
import type { CoursePackage } from "./package.js";
import {
  type Cmi5LaunchOptions,
  startTestLms,
  TEST_CMI5_AUTH,
  type TestLmsOptions,
} from "./test-lms.js";

/** The learner, registration and credentials a test launch uses unless told otherwise. */
export const TEST_LAUNCH = {
  actor: { objectType: "Agent", name: "Test Learner", mbox: "mailto:learner@example.org" },
  registration: "6f2a3b40-0c1d-4e5f-8a9b-0123456789ab",
  auth: "Basic bGVhcm5lcjpzZWNyZXQ=",
} as const;

/** Reading a state document that does not exist yet (404): a first launch, not an error. */
export const firstRead = (request: LrsRequest) =>
  request.method === "GET" && request.resource === "activities/state" && request.status === 404;

export interface XapiRunOptions {
  /** The browser to open the host page in; the caller owns it and closes it. */
  browser: Browser;
  /** The LRS of an earlier run, so a relaunch finds its state. Default: a new LRS. */
  lrs?: MemoryLrs;
  /**
   * Options of a new LRS, such as the versions it supports. A cmi5 launch's LRS requires the
   * launcher's credentials (TEST_CMI5_AUTH) unless these say otherwise.
   */
  lrsOptions?: TestLmsOptions["lrsOptions"];
  /**
   * Launch-link parameters over the defaults: `endpoint` (the test LRS), `auth`, `actor` and
   * `registration` (TEST_LAUNCH), or for cmi5 those of `cmi5Launch`. Null leaves a parameter out.
   */
  launch?: Record<string, string | null>;
  /** cmi5: the launch data the test LMS writes, such as the launch mode. */
  cmi5?: Cmi5LaunchOptions;
  /** Runs before the course opens, for example to install a fake clock with `page.clock`. */
  prepare?: (page: Page) => Promise<void>;
  /** The learner. The run then closes the course page, which is the learner leaving. */
  drive?: (page: Page) => Promise<void>;
  /** How long to wait for the LRS to go quiet after the page closes. Default 10 seconds. */
  timeoutMs?: number;
}

export interface XapiRun {
  lrs: MemoryLrs;
  /** Origin of the test LMS that served the package and the LRS. */
  origin: string;
  /** cmi5: every request to a fetch URL (TestLms.fetches). */
  fetches: string[];
  /** Every URL the course page requested, in order. */
  requests: string[];
  pageErrors: string[];
  /** Console errors, without Chromium's own logs of HTTP error statuses. */
  consoleErrors: string[];
}

export async function runXapiPackage(
  pkg: CoursePackage,
  options: XapiRunOptions,
): Promise<XapiRun> {
  const { kind } = pkg.descriptor;
  if (kind !== "tincan" && kind !== "cmi5") {
    throw new Error(`runXapiPackage launches xAPI and cmi5 packages; this one is ${kind}`);
  }
  const lrsOptions = options.lrsOptions ?? (kind === "cmi5" ? { auth: TEST_CMI5_AUTH } : undefined);
  const lms = await startTestLms(pkg, {
    ...(options.lrs && { lrs: options.lrs }),
    ...(lrsOptions && { lrsOptions }),
  });
  try {
    const page = await options.browser.newPage();
    const run: XapiRun = {
      lrs: lms.lrs,
      origin: lms.origin,
      fetches: lms.fetches,
      requests: [],
      pageErrors: [],
      consoleErrors: [],
    };
    page.on("request", (request) => run.requests.push(request.url()));
    page.on("pageerror", (error) => run.pageErrors.push(error.message));
    page.on("console", (message) => {
      // Chromium logs every HTTP error status, such as the 404 of a first launch's state
      // document; `lrs.requests` holds those statuses.
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
        run.consoleErrors.push(message.text());
      }
    });
    try {
      await options.prepare?.(page);
      const params = new URLSearchParams();
      const values: Record<string, string | null> = {
        ...(kind === "cmi5"
          ? lms.cmi5Launch(options.cmi5)
          : {
              endpoint: lms.xapiEndpoint,
              auth: TEST_LAUNCH.auth,
              actor: JSON.stringify(TEST_LAUNCH.actor),
              registration: TEST_LAUNCH.registration,
            }),
        ...options.launch,
      };
      for (const [name, value] of Object.entries(values))
        if (value !== null) params.set(name, value);
      await page.goto(`${lms.origin}/package/${pkg.launchHref}?${params}`);
      await options.drive?.(page);
      // Leaving the page is the learner closing the course: it fires pagehide (standards.md rule 9).
      await page.goto("about:blank");
      await quiet(lms.lrs, options.timeoutMs ?? 10_000);
      return run;
    } finally {
      await page.close();
    }
  } finally {
    await lms.close();
  }
}

/** Waits until the LRS has answered every request and received none for half a second. */
async function quiet(lrs: MemoryLrs, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  let seen = -1;
  let since = Date.now();
  while (Date.now() < end) {
    if (lrs.requests.length !== seen || lrs.pending > 0) {
      seen = lrs.requests.length;
      since = Date.now();
    } else if (Date.now() - since >= 500) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
