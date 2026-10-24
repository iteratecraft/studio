// A local test LMS (standards.md S-1, T-6): one HTTP server on 127.0.0.1 that serves a SCORM host
// page, the package's files from memory and an in-memory xAPI LRS. The host page puts the
// scorm-again (MIT) run-time API on window.API (SCORM 1.2) or window.API_1484_11 (SCORM 2004),
// launches the SCO in a frame and records every API call, in order, on window.__trace. It can start
// from stored CMI data and hands back what the LMS holds, so a test can relaunch a SCO.
// The trace records what scorm-again answered. After LMSFinish (1.2) its results and error codes
// can differ from the standard's, so golden traces assert call order and results up to the finish.
// The SCO is same-origin with the host page and can rewrite window.__trace and window.__done, so a
// trace is only as trustworthy as the package: fine for packages we author, not proof for others.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryLrs, type MemoryLrs } from "./memory-lrs.js";
import type { CoursePackage } from "./package.js";
import type { ScormVersion } from "./scorm-manifest.js";

export interface ScormCall {
  method: string;
  args: string[];
  result: string;
  /** The API's last error code right after the call. */
  errorCode: string;
}

export interface TestLms {
  /** Origin of the server, such as `http://127.0.0.1:50123`. */
  origin: string;
  /** Host page that launches the package's SCO; only for SCORM packages. */
  hostUrl?: string;
  /** xAPI endpoint of the in-memory LRS, ending in `/`. */
  xapiEndpoint: string;
  lrs: MemoryLrs;
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

export interface TestLmsOptions {
  /** CMI data loaded into the API before the SCO launches. */
  cmi?: CmiData;
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

/**
 * Starts the test LMS. It serves `pkg`'s files under `/package/`; a package without a descriptor,
 * such as plain web output, is only served.
 */
export async function startTestLms(
  pkg?: CoursePackage | Pick<CoursePackage, "files">,
  options: TestLmsOptions = {},
): Promise<TestLms> {
  const lrs = createMemoryLrs();
  const scorm = pkg && "descriptor" in pkg && pkg.descriptor.kind === "scorm" ? pkg : undefined;
  const page =
    scorm?.descriptor.kind === "scorm"
      ? hostPage(scorm.descriptor.manifest.version, scorm.launchHref, options.cmi)
      : undefined;
  const runtimes = new Map<string, string>();
  for (const name of ["scorm12", "scorm2004"] as const) {
    runtimes.set(`/runtime/${name}.js`, fileURLToPath(import.meta.resolve(`scorm-again/${name}`)));
  }

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const send = (status: number, contentType: string, body: string | Uint8Array) => {
      response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(body);
    };
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
  return {
    origin,
    ...(page && { hostUrl: `${origin}/host.html` }),
    xapiEndpoint: `${origin}/xapi/`,
    lrs,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
