// No-network guarantee (M1-30, ADR-0004; standards.md rule 16): runs a built package in headless
// Chromium the way learners meet it, from disk and over a loopback server, sends a learner through it
// twice and lists every request that went anywhere but the package's own files and the endpoint the
// launch names.
//
// Requests are recorded twice over. Chromium reports each one it makes (documents, scripts, styles,
// CSS imports, fonts, images, fetches, prefetches, beacons, WebSockets) for every page, frame and
// worker. And Chromium runs behind a recording proxy that stands in for the whole internet: every
// connection to a host other than the loopback address reaches it and is refused, so nothing leaves
// the machine, and a request Chromium no longer reports (a beacon sent while a page closes) is still
// caught. Loopback connections bypass the proxy; they are judged by their address.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as exporters from "@course-suite/exporters";
import {
  BLOCKS_LAUNCH_PAGE,
  type Exporter,
  isAllowed,
  type Standard,
} from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { readZip, type ZipArchive } from "@course-suite/zip";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { type CoursePackage, launchFile, readPackage } from "../src/package.js";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import { startTestLms } from "../src/test-lms.js";
import { revisit, walkCourse } from "./learner.js";

/**
 * Every output @course-suite/exporters offers: each `<name>Exporter` factory it exports, with its
 * defaults. An exporter joins this suite by being exported; there is no list to keep up to date.
 */
export function registeredExporters(): Exporter[] {
  return Object.entries(exporters)
    .filter(([name, value]) => name.endsWith("Exporter") && typeof value === "function")
    .map(([name, make]) => {
      const exporter = (make as () => Exporter)();
      if (typeof exporter?.standard !== "string" || typeof exporter.describe !== "function") {
        throw new Error(`${name}() does not return an exporter`);
      }
      return exporter;
    });
}

/** The internet, as far as the browser can tell: a proxy that records every attempt and refuses it. */
export interface Internet {
  /** `METHOD url` for plain HTTP, `CONNECT host:port` for HTTPS and WebSocket tunnels. */
  hits: string[];
  /** Chromium arguments that route every non-loopback request to it, and resolve no host names. */
  args: string[];
  close(): Promise<void>;
}

export async function startInternet(): Promise<Internet> {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.writeHead(403).end();
  });
  server.on("connect", (request, socket) => {
    hits.push(`CONNECT ${request.url}`);
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  });
  server.on("upgrade", (request, socket) => {
    hits.push(`${request.method} ${request.url} (upgrade)`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    hits,
    // Not Playwright's `proxy` option: it sends loopback through the proxy too.
    args: [
      `--proxy-server=http://127.0.0.1:${port}`,
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    ],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export type Mode = "file" | "http";

export interface Run {
  standard: Standard;
  zip: Uint8Array;
  course: Course;
  /** `file`: the launch page opened from disk, with no LMS. `http`: launched over loopback. */
  mode: Mode;
  /** Changes the launch page before the run; the deliberately bad fixtures use it. */
  patch?: (html: string) => string;
}

interface Seen {
  kind: string;
  url: string;
}

/** Records every request and WebSocket of every page in `context`. */
function watch(context: BrowserContext, seen: Seen[]): void {
  context.on("request", (request) => {
    seen.push({ kind: request.resourceType(), url: request.url() });
  });
  const sockets = (page: Page) =>
    page.on("websocket", (socket) => seen.push({ kind: "websocket", url: socket.url() }));
  context.pages().forEach(sockets);
  context.on("page", sockets);
}

/** Time for requests sent while a page closes to reach the proxy. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

const utf8 = new TextEncoder();

/**
 * Runs the package through a full learner journey and a relaunch, and returns every request that
 * went beyond the package's own files and the endpoint the launch names, as `<kind> <url>` lines.
 */
export async function outboundRequests(
  browser: Browser,
  internet: Internet,
  run: Run,
): Promise<string[]> {
  const zip = await readZip(run.zip);
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  let pkg: CoursePackage | undefined;
  if (run.standard !== "web") {
    const read = await readPackage(run.zip);
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    pkg = read.value;
  }
  const launchHref = pkg?.launchHref ?? BLOCKS_LAUNCH_PAGE;
  const launch = launchFile(launchHref);
  if (typeof launch !== "string") throw new Error(`Cannot open the launch href '${launchHref}'`);
  const { patch } = run;
  const files: ZipArchive = patch
    ? {
        names: zip.value.names,
        has: (name) => zip.value.has(name),
        read: async (name) => {
          const data = await zip.value.read(name);
          return name === launch && data
            ? utf8.encode(patch(new TextDecoder().decode(data)))
            : data;
        },
      }
    : zip.value;

  internet.hits.length = 0;
  const seen: Seen[] = [];
  let allowed: string[];
  if (run.mode === "file") {
    const dir = mkdtempSync(join(tmpdir(), "no-network-"));
    try {
      for (const name of files.names) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), (await files.read(name)) as Uint8Array);
      }
      const base = pathToFileURL(join(dir, "/")).href;
      allowed = [base];
      await visitTwice(browser, () => `${base}${launchHref}`, run.course, seen);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else if (pkg?.descriptor.kind === "scorm") {
    allowed = await inTestLms({ ...pkg, files }, run.course, browser, seen);
  } else {
    // Plain web output, xAPI and cmi5 are served by the test LMS.
    const lms = await startTestLms(pkg ? { ...pkg, files } : { files });
    try {
      const base = `${lms.origin}/package/`;
      const sep = launchHref.includes("?") ? "&" : "?";
      // An xAPI package is launched with the LRS in its query (standards.md X-1). A cmi5 AU gets a
      // fresh launch from the test LMS's cmi5 launcher each time, since its fetch URL works once.
      const query = (): string =>
        pkg === undefined
          ? ""
          : `${sep}${new URLSearchParams(
              pkg.descriptor.kind === "cmi5"
                ? lms.cmi5Launch()
                : {
                    endpoint: lms.xapiEndpoint,
                    auth: `Basic ${btoa("learner:secret")}`,
                    actor: JSON.stringify({ mbox: "mailto:learner@example.com", name: "Learner" }),
                    registration: "6fa9a1d3-0b6e-4c55-9d6a-2f0b8f5e2d41",
                  },
            )}`;
      // A cmi5 AU also asks the LMS's one-time fetch URL for its token, and may go back to its
      // returnURL; both are on the test LMS.
      allowed =
        pkg === undefined
          ? [base]
          : pkg.descriptor.kind === "cmi5"
            ? [base, lms.xapiEndpoint, `${lms.origin}/cmi5/`]
            : [base, lms.xapiEndpoint];
      await visitTwice(browser, () => `${base}${launchHref}${query()}`, run.course, seen);
    } finally {
      await lms.close();
    }
  }

  const outside = seen
    .filter(({ url }) => !/^(?:data|blob|about):/.test(url) && !isAllowed(url, allowed))
    .map(({ kind, url }) => `${kind} ${url}`);
  return [...new Set([...outside, ...internet.hits.map((hit) => `left the machine: ${hit}`)])];
}

/** Opens `url()`, walks the course, closes the window, then opens a new `url()` and resumes. */
async function visitTwice(browser: Browser, url: () => string, course: Course, seen: Seen[]) {
  const context = await browser.newContext();
  watch(context, seen);
  try {
    for (const first of [true, false]) {
      const page = await context.newPage();
      await page.goto(url());
      if (first) await walkCourse(page, course);
      else await revisit(page);
      await page.close({ runBeforeUnload: true });
    }
    await settle();
  } finally {
    await context.close();
  }
}

/** Launches a SCORM package in the test LMS twice; returns what the SCO may request there. */
async function inTestLms(
  pkg: CoursePackage,
  course: Course,
  browser: Browser,
  seen: Seen[],
): Promise<string[]> {
  if (pkg.descriptor.kind !== "scorm") throw new Error("not a SCORM package");
  // Each launch starts its own test LMS, on its own port.
  const origins: string[] = [];
  const first = await runPackage(pkg, {
    browser,
    prepare: async (page) => watch(page.context(), seen),
    drive: async (sco, page) => {
      origins.push(new URL(page.url()).origin);
      await walkCourse(sco, course);
      await closeSco(page);
    },
  });
  await runPackage(pkg, {
    browser,
    // shortcut: only SCORM 1.2 is relaunched with its resume data; SCORM 2004 starts afresh until
    // its runtime adapter (M1-23) brings a relaunch helper.
    ...(pkg.descriptor.manifest.version === "scorm12" && { cmi: relaunchCmi(first.cmi) }),
    prepare: async (page) => watch(page.context(), seen),
    drive: async (sco, page) => {
      origins.push(new URL(page.url()).origin);
      await revisit(sco);
      await closeSco(page);
    },
  });
  await settle();
  // The LMS's own host page and API runtime, and the package it serves; SCORM names no endpoint.
  return origins.flatMap((origin) => [
    `${origin}/host.html`,
    `${origin}/runtime/`,
    `${origin}/package/`,
  ]);
}
