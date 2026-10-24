// M1 demo (M1-31): `pnpm demo:m1` builds the format's sample courses, plus every corpus course when a
// test-courses checkout is present, in every output (web, SCORM 1.2, SCORM 2004, xAPI, cmi5) with the
// Blocks player, writes each zip and its unpacked folder under the git-ignored `demo/` folder, and
// serves an index page on the loopback address. Each Launch link starts a fresh test LMS for that
// package and opens it beside a panel that shows, as they happen, the SCORM calls the course makes
// or the xAPI statements the LRS stores. It opens nothing by itself; Ctrl+C stops it.
// Test-only tooling: it runs the conformance test LMS (M1-15), never anything a course ships.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import {
  type CoursePackage,
  firstRead,
  loadBlocksCorpus,
  readPackage,
  readZip,
  startTestLms,
  TEST_CMI5_AUTH,
  TEST_COURSES_DIR,
  TEST_LAUNCH,
  type TestLms,
} from "@course-suite/conformance";
import {
  BLOCKS_LAUNCH_PAGE,
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  type Exporter,
  type Standard,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "@course-suite/exporters";
import type { Course } from "@course-suite/format";
import { fullCourse, sampleCourse } from "@course-suite/format/test/courses";

/** The root of the studio checkout. */
const ROOT = join(import.meta.dirname, "..", "..", "..");

const OUTPUTS: { exporter: () => Exporter; name: string }[] = [
  { exporter: webExporter, name: "Web" },
  { exporter: scorm12Exporter, name: "SCORM 1.2" },
  { exporter: scorm2004Exporter, name: "SCORM 2004" },
  { exporter: xapiExporter, name: "xAPI" },
  { exporter: cmi5Exporter, name: "cmi5" },
];

interface DemoCourse {
  /** `fixtures/<name>` or `corpus/<folder>`. */
  name: string;
  course: Course;
  media(key: string): Uint8Array | undefined;
}

/** A stand-in for a media file the fixtures name but do not ship, as in the browser tests. */
const standIn = (key: string) =>
  new TextEncoder().encode(
    key.endsWith(".svg")
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3"/></svg>\n'
      : `stand-in for ${key}\n`,
  );

/** The format's sample courses, then every corpus course of a test-courses checkout. */
export function demoCourses(): DemoCourse[] {
  const corpus = (loadBlocksCorpus() ?? []).map(({ name, text }) => ({
    name: `corpus/${name}`,
    course: JSON.parse(text) as Course,
    media: (key: string) => {
      const file = join(TEST_COURSES_DIR, "blocks", name, "media", key);
      return existsSync(file) ? readFileSync(file) : undefined;
    },
  }));
  return [
    { name: "fixtures/sample", course: sampleCourse(), media: standIn },
    { name: "fixtures/full", course: fullCourse(), media: standIn },
    ...corpus,
  ];
}

interface Launch {
  /** `<course name>/<standard>`, also its path below `/launch/`. */
  key: string;
  course: DemoCourse;
  standard: Standard;
  /** Read back from the zip; plain web output has no descriptor. */
  pkg: CoursePackage | Pick<CoursePackage, "files" | "launchHref">;
  lms?: TestLms;
}

export interface DemoOptions {
  courses?: DemoCourse[];
  /** Where the zips and unpacked folders go. Default: `demo/` at the root of studio. */
  outDir?: string;
  /** Default 0: any free port. */
  port?: number;
}

export interface Demo {
  /** The index page. */
  url: string;
  outDir: string;
  close(): Promise<void>;
}

/** Builds every course in every output, writes them under `outDir` and starts the demo server. */
export async function startDemo(options: DemoOptions = {}): Promise<Demo> {
  const outDir = options.outDir ?? join(ROOT, "demo");
  const launches = new Map<string, Launch>();
  for (const course of options.courses ?? demoCourses()) {
    for (const { exporter } of OUTPUTS) {
      const made = exporter();
      const { standard } = made;
      const built = await buildPackage({
        course: { ...course.course, publish: { ...course.course.publish, standard } },
        player: blocksPlayer({ language: course.course.sourceLanguage ?? "en" }),
        exporter: made,
        media: course.media,
        packageVersion: 1,
      });
      if (!built.ok)
        throw new Error(`${course.name} as ${standard}: ${JSON.stringify(built.problems)}`);
      const key = `${course.name}/${standard}`;
      const folder = join(outDir, key);
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(folder, { recursive: true });
      writeFileSync(`${folder}.zip`, built.value.zip);
      const unzipped = readZip(built.value.zip);
      if (!unzipped.ok) throw new Error(`${key}: ${JSON.stringify(unzipped.problems)}`);
      for (const name of unzipped.value.names) {
        mkdirSync(dirname(join(folder, name)), { recursive: true });
        writeFileSync(join(folder, name), unzipped.value.read(name) as Uint8Array);
      }
      let pkg: Launch["pkg"] = { files: unzipped.value, launchHref: BLOCKS_LAUNCH_PAGE };
      if (standard !== "web") {
        const read = readPackage(built.value.zip);
        if (!read.ok) throw new Error(`${key}: ${JSON.stringify(read.problems)}`);
        pkg = read.value;
      }
      launches.set(key, { key, course, standard, pkg });
    }
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = decodeURIComponent(url.pathname);
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
      response.end(body);
    };
    if (path === "/") return send(200, HTML, indexPage([...launches.values()], outDir));
    const launch = launches.get(path.replace(/^\/(launch|statements)\//, ""));
    if (launch && path.startsWith("/launch/")) {
      relaunch(launch).then(
        (course) => send(200, HTML, launchPage(launch, course.src, course.activity)),
        (error: unknown) => send(500, "text/plain; charset=utf-8", String(error)),
      );
      return;
    }
    if (launch?.lms && path.startsWith("/statements/")) {
      const { lrs } = launch.lms;
      const from = Number(url.searchParams.get("from") ?? 0);
      const refused = lrs.requests.filter((r) => r.status >= 400 && !firstRead(r));
      return json(response, { statements: lrs.statements.slice(from), refused });
    }
    send(404, "text/plain; charset=utf-8", "Not found");
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    outDir,
    close: async () => {
      await Promise.all([...launches.values()].map((launch) => launch.lms?.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

const HTML = "text/html; charset=utf-8";

function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

/**
 * Replaces the launch's test LMS with a fresh one, so every launch is a first attempt; returns the
 * course URL and, for xAPI and cmi5, the activity whose statements report on the whole course.
 */
async function relaunch(launch: Launch): Promise<{ src: string; activity?: string | undefined }> {
  await launch.lms?.close();
  const { pkg, standard } = launch;
  const lms = await startTestLms(
    pkg,
    standard === "cmi5" ? { lrsOptions: { auth: TEST_CMI5_AUTH } } : {},
  );
  launch.lms = lms;
  if (lms.hostUrl) return { src: lms.hostUrl };
  const href = `${lms.origin}/package/${pkg.launchHref}`;
  const sep = pkg.launchHref.includes("?") ? "&" : "?";
  if ("descriptor" in pkg && pkg.descriptor.kind === "cmi5") {
    const params = lms.cmi5Launch();
    return { src: `${href}${sep}${new URLSearchParams(params)}`, activity: params.activityId };
  }
  if ("descriptor" in pkg && pkg.descriptor.kind === "tincan") {
    // The launch link of standards.md X-1: the LRS, credentials, learner and registration.
    const params = new URLSearchParams({
      endpoint: lms.xapiEndpoint,
      auth: TEST_LAUNCH.auth,
      actor: JSON.stringify(TEST_LAUNCH.actor),
      registration: TEST_LAUNCH.registration,
    });
    return { src: `${href}${sep}${params}`, activity: pkg.descriptor.tincan.launch.activityId };
  }
  return { src: href };
}

const html = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; }
a { color: LinkText; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

function indexPage(launches: Launch[], outDir: string): string {
  const courses = [...new Map(launches.map((l) => [l.course.name, l.course])).values()];
  const rows = courses
    .map((course) => {
      const cells = OUTPUTS.map(({ exporter, name }) => {
        const key = `${course.name}/${exporter().standard}`;
        return `<td><a href="/launch/${html(key)}">Launch<span class="visually-hidden"> ${html(course.name)} as ${html(name)}</span></a></td>`;
      }).join("");
      return `<tr><th scope="row">${html(course.name)}<br><small>${html(course.course.title)}</small></th>${cells}</tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>M1 demo</title>
<style>${STYLE}
main { max-width: 64rem; margin: 0 auto; padding: 1rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid GrayText; padding: .5rem; text-align: left; vertical-align: top; }
</style></head>
<body><main>
<h1>M1 demo</h1>
<p>Every course in every output, played in the local test LMS. Each launch starts a new attempt.
The zips and their unpacked folders are in <code>${html(outDir)}</code>.</p>
<table>
<caption class="visually-hidden">Courses and outputs</caption>
<thead><tr><th scope="col">Course</th>${OUTPUTS.map(({ name }) => `<th scope="col">${html(name)}</th>`).join("")}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</main></body>
</html>
`;
}

function launchPage(launch: Launch, src: string, activity?: string): string {
  const output = OUTPUTS.find(({ exporter }) => exporter().standard === launch.standard)?.name;
  // JSON is valid JavaScript; escaping '<' keeps a value from closing the script element.
  const config = JSON.stringify({
    standard: launch.standard,
    lmsOrigin: launch.lms?.origin,
    activity,
    statements: `/statements/${launch.key}`,
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(launch.course.name)} as ${html(output ?? launch.standard)}: M1 demo</title>
<style>${STYLE}
body { display: grid; grid-template-columns: 1fr minmax(18rem, 30%); height: 100vh; }
iframe { border: 0; width: 100%; height: 100%; display: block; }
aside { overflow: auto; border-left: 1px solid GrayText; padding: 0 .75rem; font-size: .875rem; }
h1 { font-size: 1.125rem; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .25rem .75rem; }
dd { margin: 0; font-weight: bold; }
ol { padding-left: 1.5rem; font: .8125rem/1.4 ui-monospace, monospace; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; }
@media (max-width: 40rem) { body { grid-template-columns: 1fr; grid-template-rows: 70vh auto; height: auto; } aside { border: 0; } }
</style></head>
<body>
<main><iframe id="course" title="Course" src="${html(src)}"></iframe></main>
<aside aria-labelledby="panel-title">
<h1 id="panel-title">${html(launch.course.name)} as ${html(output ?? launch.standard)}</h1>
<p><a href="/">All courses</a> · <a href="">Launch again</a></p>
<h2>Reported</h2>
<dl>
<dt>Completion</dt><dd id="completion">not reported</dd>
<dt>Success</dt><dd id="success">not reported</dd>
<dt>Score</dt><dd id="score">not reported</dd>
</dl>
<h2 id="trace-title">Live trace</h2>
<ol id="trace" role="log" aria-labelledby="trace-title"></ol>
</aside>
<script>
const config = ${config};
const trace = document.getElementById("trace");
const report = (id, value) => { if (value !== undefined && value !== "") document.getElementById(id).textContent = String(value); };
function add(text, detail) {
  const item = document.createElement("li");
  if (detail === undefined) item.textContent = text;
  else {
    const more = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    summary.textContent = text;
    pre.textContent = JSON.stringify(detail, null, 2);
    more.append(summary, pre);
    item.append(more);
  }
  trace.append(item);
  item.scrollIntoView({ block: "nearest" });
}

// SCORM: the test LMS's host page posts every API call it answers.
const SCORM_STATUS = {
  "cmi.core.lesson_status": (v) => {
    if (v === "passed" || v === "failed") { report("success", v); report("completion", "completed"); }
    else report("completion", v);
  },
  "cmi.core.score.raw": (v) => report("score", v),
  "cmi.completion_status": (v) => report("completion", v),
  "cmi.success_status": (v) => report("success", v),
  "cmi.score.raw": (v) => report("score", v),
};
window.addEventListener("message", (event) => {
  const call = event.data && event.data.scormCall;
  if (event.origin !== config.lmsOrigin || !call) return;
  const error = call.errorCode === "0" ? "" : " [error " + call.errorCode + "]";
  add(call.method + "(" + call.args.map((a) => JSON.stringify(a)).join(", ") + ") → " + JSON.stringify(call.result) + error);
  if (/SetValue$/.test(call.method) && call.result === "true") SCORM_STATUS[call.args[0]]?.(call.args[1]);
});

// xAPI and cmi5: the statements the LRS stored, read from the demo server as they arrive.
const name = (map, fallback) => (map && (map["en-US"] || map.en || Object.values(map)[0])) || fallback;
async function poll(from, refused) {
  try {
    const answer = await (await fetch(config.statements + "?from=" + from)).json();
    for (const s of answer.statements) {
      const verb = name(s.verb.display, s.verb.id.split("/").pop());
      const object = name(s.object.definition && s.object.definition.name, s.object.id);
      const result = s.result || {};
      add(verb + " · " + object, s);
      // Statements about a quiz or a lesson say nothing about the whole course.
      if (s.object.id !== config.activity) continue;
      if (verb === "completed" || result.completion === true) report("completion", "completed");
      if (verb === "passed" || verb === "failed") report("success", verb);
      if (result.score && result.score.raw !== undefined) report("score", result.score.raw);
    }
    for (const r of answer.refused.slice(refused)) add("LRS refused " + r.method + " " + r.resource + " with " + r.status);
    from += answer.statements.length;
    refused = Math.max(refused, answer.refused.length);
  } catch {}
  setTimeout(() => poll(from, refused), 500);
}
if (config.standard === "xapi" || config.standard === "cmi5") poll(0, 0);
if (config.standard === "web") add("Web output reports to no LMS or LRS, so there is nothing to trace.");
</script>
</body>
</html>
`;
}

if (import.meta.main) {
  console.log("Building every course in every output...");
  const demo = await startDemo();
  console.log(`Packages and unpacked folders: ${demo.outDir}`);
  console.log(`M1 demo running at ${demo.url}  (Ctrl+C stops it)`);
  process.once("SIGINT", () => {
    demo.close().then(() => process.exit(0));
  });
}
