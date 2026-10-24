// No-network guarantee for every output (M1-30, ADR-0004; standards.md rule 16): every exporter
// @course-suite/exporters offers builds every fixture course and every corpus course (when a
// test-courses checkout is present), and each package is run from disk and over loopback through a
// full learner journey: every lesson, each quiz failed and passed, the window closed, the course
// relaunched. The only destinations allowed are the package's own files and, for LMS and LRS
// outputs, the endpoint the launch names. Deliberately bad fixtures prove that each kind of leak is
// caught.
import { sampleCourse } from "@course-suite/format/test/courses";
import { test as base, expect } from "@playwright/test";
import { blocksZip, corpusCourses, fixtureCourses } from "../test/blocks.js";
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

const MODES: Mode[] = ["file", "http"];
const outputs = registeredExporters();
const corpus = corpusCourses();

test("the suite covers every exporter, web and SCORM 1.2 among them", () => {
  expect(outputs.map((exporter) => exporter.standard)).toEqual(
    expect.arrayContaining(["web", "scorm12"]),
  );
});

for (const exporter of outputs) {
  for (const { name, course, media } of [...fixtureCourses(), ...(corpus ?? [])]) {
    for (const mode of MODES) {
      test(`[standards:R16] ${exporter.standard} ${name} from ${mode}: a full journey requests only the package and its launch endpoint`, async ({
        browser,
        internet,
      }) => {
        // Two visits of the longest corpus course take about 20 seconds on an idle machine.
        test.setTimeout(120_000);
        const zip = await blocksZip(course, exporter, media);
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
}

if (!corpus) {
  test.skip("corpus courses: no test-courses checkout at the root of studio", () => {});
}

/** Deliberately bad launch pages: each adds one kind of outbound request to a good package. */
const LEAKS = [
  {
    leak: "an outside font",
    host: "fonts.example.com",
    head: "<style>@font-face{font-family:Outside;src:url(https://fonts.example.com/outside.woff2)}html,body,*{font-family:Outside!important}</style>",
  },
  {
    leak: "a tracking pixel",
    host: "pixel.example.com",
    body: '<img src="https://pixel.example.com/p.gif" alt="" width="1" height="1">',
  },
  {
    leak: "a remote script",
    host: "cdn.example.com",
    head: '<script src="https://cdn.example.com/library.js"></script>',
  },
  {
    leak: "a CSS import",
    host: "styles.example.com",
    head: '<style>@import url("https://styles.example.com/theme.css");</style>',
  },
  {
    leak: "a prefetch",
    host: "prefetch.example.com",
    head: '<link rel="prefetch" href="https://prefetch.example.com/next.js">',
  },
  {
    leak: "a beacon sent as the page closes",
    host: "beacon.example.com",
    body: '<script>addEventListener("pagehide", () => navigator.sendBeacon("https://beacon.example.com/bye", "x"))</script>',
  },
  {
    leak: "a WebSocket",
    host: "socket.example.com",
    body: '<script>new WebSocket("wss://socket.example.com/live")</script>',
  },
];

for (const exporter of outputs) {
  for (const { leak, host, head = "", body = "" } of LEAKS) {
    for (const mode of MODES) {
      test(`${exporter.standard} from ${mode}: the suite catches ${leak}`, async ({
        browser,
        internet,
      }) => {
        const course = sampleCourse();
        const offending = await outboundRequests(browser, internet, {
          standard: exporter.standard,
          zip: await blocksZip(course, exporter),
          course,
          mode,
          patch: (html) =>
            html.replace("</head>", `${head}</head>`).replace("</body>", `${body}</body>`),
        });
        expect(offending.length, `nothing caught for ${leak}`).toBeGreaterThan(0);
        expect(offending.filter((line) => !line.includes(host))).toEqual([]);
      });
    }
  }
}
