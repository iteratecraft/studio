// A local test LMS (standards.md S-1, T-6): one HTTP server on 127.0.0.1 that serves a SCORM host
// page, the package's files from memory and an in-memory xAPI LRS. The host page puts the
// scorm-again (MIT) run-time API on window.API (SCORM 1.2) or window.API_1484_11 (SCORM 2004),
// launches the SCO in a frame and records every API call, in order, on window.__trace. It can start
// from stored CMI data and hands back what the LMS holds, so a test can relaunch a SCO.
// The trace records what scorm-again answered. After LMSFinish (1.2) its results and error codes
// can differ from the standard's, so golden traces assert call order and results up to the finish.
// The SCO is same-origin with the host page and can rewrite window.__trace and window.__done, so a
// trace is only as trustworthy as the package: fine for packages we author, not proof for others.
// For a cmi5 package it is also a minimal cmi5 launcher (standards.md S-6, test subset): it writes
// LMS.LaunchData and the learner's preferences, records launched and hands out one-time fetch URLs.
// shortcut: no abandoned, waived or satisfied statements and no move-on evaluation; the server's
// launcher (STD-17) does those and is tested with CATAPULT (T-2).
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMemoryLrs,
  type MemoryLrs,
  type MemoryLrsOptions,
  profileKey,
  stateKey,
} from "./memory-lrs.js";
import type { CoursePackage } from "./package.js";
import type { ScormVersion } from "./scorm-manifest.js";

export interface ScormCall {
  method: string;
  args: string[];
  result: string;
  /** The API's last error code right after the call. */
  errorCode: string;
}

/** The learner, registration and session credentials of a test cmi5 launch. */
export const TEST_CMI5 = {
  actor: {
    objectType: "Agent",
    name: "Test Learner",
    account: { homePage: "https://lms.example.org", name: "learner-1" },
  },
  registration: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
  token: "Y21pNS1sZWFybmVyOnNlc3Npb24=",
  /** The LMS's activity id for the AU; it must differ from the AU's id in cmi5.xml (cmi5 §8.1.5). */
  activityId: "urn:test-lms:au:1",
} as const;
/** The Authorization value the LRS of a cmi5 launch requires. */
export const TEST_CMI5_AUTH = `Basic ${TEST_CMI5.token}`;

export interface Cmi5LaunchOptions {
  launchMode?: "Normal" | "Browse" | "Review";
  /** Over the AU's in cmi5.xml; null leaves it out of the launch data. */
  masteryScore?: number | null;
  moveOn?: string;
  /** Default: the test LMS's return page. Null leaves it out. */
  returnURL?: string | null;
  /** The fetch URL refuses the first request too (error-code 2). */
  refuseFetch?: boolean;
}

export interface TestLms {
  /** Origin of the server, such as `http://127.0.0.1:50123`. */
  origin: string;
  /** Host page that launches the package's SCO; only for SCORM packages. */
  hostUrl?: string;
  /** xAPI endpoint of the in-memory LRS, ending in `/`. */
  xapiEndpoint: string;
  lrs: MemoryLrs;
  /** The page the cmi5 launch data names as returnURL. */
  returnUrl: string;
  /**
   * Prepares a launch of a cmi5 package's AU the way an LMS does (cmi5 §8, §10, §11): stores
   * LMS.LaunchData and the learner's preferences, records launched and returns the launch-link
   * parameters, with a new one-time fetch URL.
   */
  cmi5Launch(options?: Cmi5LaunchOptions): Record<string, string>;
  /** Every request to a fetch URL, in order, as `<method> <path> <token | error code>`. */
  fetches: string[];
  close(): Promise<void>;
}

const API = {
  scorm12: {
    global: "API",
    runtime: "scorm12",
    className: "Scorm12API",
    finish: "LMSFinish",
    lastError: "LMSGetLastError",
    methods: [
      "LMSInitialize",
      "LMSFinish",
      "LMSGetValue",
      "LMSSetValue",
      "LMSCommit",
      "LMSGetLastError",
      "LMSGetErrorString",
      "LMSGetDiagnostic",
    ],
  },
  scorm2004: {
    global: "API_1484_11",
    runtime: "scorm2004",
    className: "Scorm2004API",
    finish: "Terminate",
    lastError: "GetLastError",
    methods: [
      "Initialize",
      "Terminate",
      "GetValue",
      "SetValue",
      "Commit",
      "GetLastError",
      "GetErrorString",
      "GetDiagnostic",
    ],
  },
} as const satisfies Record<ScormVersion, unknown>;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * CMI data the LMS holds before the launch, in scorm-again's JSON shape: for SCORM 1.2 for example
 * `{ core: { lesson_mode: "review" } }`, or the `cmi` a previous run returned plus
 * `core.entry: "resume"` to relaunch it.
 */
export type CmiData = Record<string, unknown>;

const CMI5 = "https://w3id.org/xapi/cmi5";

export interface TestLmsOptions {
  /** CMI data loaded into the API before the SCO launches. */
  cmi?: CmiData;
  /** An LRS to serve, such as the one of an earlier run, so a relaunch finds its state. */
  lrs?: MemoryLrs;
  /** Options of a new LRS when `lrs` is not given. */
  lrsOptions?: MemoryLrsOptions;
}

function hostPage(version: ScormVersion, launchHref: string, cmi: CmiData = {}): string {
  const api = API[version];
  // JSON is valid JavaScript; escaping '<' keeps a launch href from closing the script element.
  const config = JSON.stringify({ ...api, launch: `/package/${launchHref}`, cmi }).replaceAll(
    "<",
    "\\u003c",
  );
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Test LMS</title>
<style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style></head>
<body>
<iframe id="sco" title="Course"></iframe>
<script type="module">
import { ${api.className} as Api } from "/runtime/${api.runtime}.js";
const config = ${config};
// logLevel 5 silences the runtime; lmsCommitUrl stays false, so commits stay in memory.
const api = new Api({ logLevel: 5, autocommit: false });
api.loadFromJSON(config.cmi);
const trace = [];
const wrapped = {};
for (const method of config.methods) {
  wrapped[method] = (...args) => {
    const result = String(api[method](...args));
    trace.push({ method, args: args.map(String), result, errorCode: String(api[config.lastError]()) });
    if (method === config.finish && result === "true") window.__done = true;
    return result;
  };
}
window.__trace = trace;
window.__done = false;
window.__cmi = () => JSON.parse(JSON.stringify(api.cmi));
window[config.global] = wrapped;
document.getElementById("sco").src = config.launch;
</script>
</body>
</html>
`;
}

export async function startTestLms(
  pkg?: CoursePackage,
  options: TestLmsOptions = {},
): Promise<TestLms> {
  const lrs = options.lrs ?? createMemoryLrs(options.lrsOptions);
  const version = pkg?.descriptor.kind === "scorm" ? pkg.descriptor.manifest.version : undefined;
  const page = version && pkg ? hostPage(version, pkg.launchHref, options.cmi) : undefined;
  const runtimes = new Map<string, string>();
  for (const name of ["scorm12", "scorm2004"] as const) {
    runtimes.set(`/runtime/${name}.js`, fileURLToPath(import.meta.resolve(`scorm-again/${name}`)));
  }

  const tokens = new Map<string, { used: boolean; refuse: boolean }>();
  const fetches: string[] = [];

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const send = (status: number, contentType: string, body: string | Uint8Array) => {
      response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(body);
    };
    if (path.startsWith("/cmi5/fetch/")) {
      // One-time fetch URL (cmi5 §8.2): the token once, then error-code 1; always 200 and JSON.
      const entry = tokens.get(path);
      const answer: Record<string, string> =
        request.method !== "POST" || !entry
          ? { "error-code": "3", "error-text": "Unknown fetch URL or not a POST." }
          : entry.refuse
            ? { "error-code": "2", "error-text": "This launch is not allowed." }
            : entry.used
              ? {
                  "error-code": "1",
                  "error-text": "The authorization token has already been returned.",
                }
              : { "auth-token": TEST_CMI5.token };
      if (entry) entry.used = true;
      fetches.push(`${request.method} ${path} ${answer["error-code"] ?? "token"}`);
      response.setHeader("Access-Control-Allow-Origin", "*");
      return send(200, "application/json", JSON.stringify(answer));
    }
    if (path === "/cmi5/return") {
      return send(
        200,
        CONTENT_TYPES[".html"] ?? "",
        '<!doctype html><html lang="en"><title>Test LMS</title><h1>Back in the test LMS</h1></html>',
      );
    }
    if (path.startsWith("/xapi/")) {
      lrs.handle(request, response, path.slice("/xapi/".length)).catch(() => {
        if (!response.headersSent) send(500, "text/plain", "LRS error");
      });
      return;
    }
    if (path === "/host.html" && page) return send(200, CONTENT_TYPES[".html"] ?? "", page);
    const runtime = runtimes.get(path);
    if (runtime) {
      readFile(runtime).then(
        (data) => send(200, CONTENT_TYPES[".js"] ?? "", data),
        () => send(500, "text/plain", "runtime missing"),
      );
      return;
    }
    if (pkg && path.startsWith("/package/")) {
      let name: string;
      try {
        name = decodeURIComponent(path.slice("/package/".length));
      } catch {
        return send(400, "text/plain", "bad path");
      }
      // Files are looked up by entry name in memory, so no request can reach the disk.
      const data = pkg.files.read(name);
      const type = CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
      if (data) return send(200, type, data);
    }
    send(404, "text/plain", "not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const returnUrl = `${origin}/cmi5/return`;

  function cmi5Launch(options: Cmi5LaunchOptions = {}): Record<string, string> {
    if (pkg?.descriptor.kind !== "cmi5") throw new Error("cmi5Launch needs a cmi5 package");
    const au = pkg.descriptor.course.children.find((node) => node.kind === "au");
    if (!au) throw new Error("cmi5Launch launches a course with one AU at its root");
    const { actor, registration, activityId } = TEST_CMI5;
    const agent = JSON.stringify(actor);
    const launched = lrs.statements.filter((s) =>
      String((s.verb as { id?: string }).id).endsWith("/launched"),
    );
    const sessionId = `${registration}-${launched.length + 1}`;
    const contextTemplate = {
      contextActivities: { grouping: [{ id: au.id }] },
      extensions: { [`${CMI5}/context/extensions/sessionid`]: sessionId },
    };
    const mastery = options.masteryScore === undefined ? au.masteryScore : options.masteryScore;
    const returnURL = options.returnURL === undefined ? returnUrl : options.returnURL;
    const launchMode = options.launchMode ?? "Normal";
    const moveOn = options.moveOn ?? au.moveOn;
    const json = (value: unknown) => ({
      contentType: "application/json",
      body: JSON.stringify(value),
    });
    lrs.state.set(
      stateKey(new URLSearchParams({ activityId, agent, registration, stateId: "LMS.LaunchData" })),
      json({
        contextTemplate,
        launchMode,
        moveOn,
        ...(mastery != null && { masteryScore: mastery }),
        ...(returnURL !== null && { returnURL }),
      }),
    );
    lrs.profiles.set(
      profileKey(new URLSearchParams({ agent, profileId: "cmi5LearnerPreferences" })),
      json({ languagePreference: "en-US", audioPreference: "on" }),
    );
    // The LMS records launched before the AU opens (cmi5 §9.3.1).
    const now = new Date().toISOString();
    lrs.statements.push({
      id: randomUUID(),
      actor,
      verb: { id: "http://adlnet.gov/expapi/verbs/launched", display: { "en-US": "launched" } },
      object: { objectType: "Activity", id: activityId },
      context: {
        registration,
        contextActivities: {
          ...contextTemplate.contextActivities,
          category: [{ id: `${CMI5}/context/categories/cmi5` }],
        },
        extensions: {
          ...contextTemplate.extensions,
          [`${CMI5}/context/extensions/launchmode`]: launchMode,
          [`${CMI5}/context/extensions/launchurl`]: `${origin}/package/${pkg.launchHref}`,
          [`${CMI5}/context/extensions/moveon`]: moveOn,
          ...(mastery != null && { [`${CMI5}/context/extensions/masteryscore`]: mastery }),
        },
      },
      timestamp: now,
      stored: now,
    });
    const fetchPath = `/cmi5/fetch/${randomUUID()}`;
    tokens.set(fetchPath, { used: false, refuse: options.refuseFetch === true });
    return {
      endpoint: `${origin}/xapi/`,
      fetch: `${origin}${fetchPath}`,
      actor: agent,
      registration,
      activityId,
    };
  }

  return {
    origin,
    ...(page && { hostUrl: `${origin}/host.html` }),
    xapiEndpoint: `${origin}/xapi/`,
    lrs,
    returnUrl,
    cmi5Launch,
    fetches,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
