import type { Course } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  type Clock,
  CMI5_IRIS,
  CMI5_VERBS,
  type Cmi5Launch,
  createCmi5Adapter,
  createTracker,
  type HttpRequest,
  REQUEST_TIMEOUT_MS,
  RESUME_CAPS,
  readCmi5Launch,
  type Transport,
  XAPI_VERBS,
} from "./index.js";

const ENDPOINT = "https://lms.example.org/xapi/";
const FETCH = "https://lms.example.org/fetch?k=one";
const REGISTRATION = "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d";
const AU = "https://lms.example.org/activities/au-17";
const PUBLISHER_AU = "https://example.org/courses/compost/au";
const SESSION = "session-1";
const TOKEN = "dG9rZW46b25jZQ==";

const course: Course = {
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en-GB",
  publish: { standard: "cmi5", activityId: "https://example.org/courses/compost" },
  entries: [{ id: "lessonone1", kind: "lesson", title: "Why compost", blocks: [] }],
  media: [],
};

const launch: Cmi5Launch = {
  endpoint: ENDPOINT,
  fetch: FETCH,
  actor: { objectType: "Agent", name: "Sam", account: { homePage: "https://lms", name: "s7" } },
  registration: REGISTRATION,
  activityId: AU,
};

/** A clock that moves only when the test advances it. */
function fakeClock() {
  let now = Date.UTC(2026, 0, 5, 9);
  const clock: Clock & { advance(ms: number): void } = {
    now: () => now,
    setTimeout: () => 0,
    clearTimeout: () => {},
    advance(ms) {
      now += ms;
    },
  };
  return clock;
}

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

interface Sent extends HttpRequest {
  url: string;
}

/**
 * An LMS behind a fake `fetch`: a one-time fetch URL, launch data and an LRS that keeps one statement
 * per id. Pass the state of an earlier launch to relaunch the same registration.
 */
function fakeLms(
  launchData: Record<string, unknown> | undefined,
  state = new Map<string, string>(),
) {
  const requests: Sent[] = [];
  const statements: Record<string, unknown>[] = [];
  if (launchData) state.set("LMS.LaunchData", JSON.stringify(launchData));
  let fetched = 0;
  const transport: Transport = async (url, request) => {
    requests.push({ ...request, url });
    const answer = (status: number, body = "") => ({ status, text: async () => body });
    if (url === FETCH) {
      return ++fetched === 1
        ? answer(200, JSON.stringify({ "auth-token": TOKEN }))
        : answer(200, JSON.stringify({ "error-code": "1", "error-text": "already used" }));
    }
    const [path = "", search = ""] = url.slice(ENDPOINT.length).split("?");
    if (path === "about") return answer(200, JSON.stringify({ version: ["1.0.3"] }));
    if (request.headers.Authorization !== `Basic ${TOKEN}`) return answer(401);
    if (path === "statements") {
      for (const statement of JSON.parse(request.body ?? "[]") as Record<string, unknown>[]) {
        if (!statements.some((s) => s.id === statement.id)) statements.push(statement);
      }
      return answer(200, "[]");
    }
    if (path === "activities/state") {
      const key = decodeURIComponent(/(?:^|&)stateId=([^&]*)/.exec(search)?.[1] ?? "");
      if (request.method === "PUT") {
        state.set(key, request.body ?? "");
        return answer(204);
      }
      const stored = state.get(key);
      return stored === undefined ? answer(404) : answer(200, stored);
    }
    return answer(404);
  };
  return { requests, statements, state, transport };
}

const normal = (extra: Record<string, unknown> = {}) => ({
  contextTemplate: {
    contextActivities: { grouping: [{ id: PUBLISHER_AU }] },
    extensions: { [CMI5_IRIS.sessionId]: SESSION },
  },
  launchMode: "Normal",
  moveOn: "CompletedAndPassed",
  masteryScore: 0.8,
  returnURL: "https://lms.example.org/return",
  ...extra,
});

let ids = 0;
function setup(lms = fakeLms(normal())) {
  const clock = fakeClock();
  const adapter = createCmi5Adapter({
    launch,
    course,
    clock,
    transport: lms.transport,
    uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  });
  const tracker = createTracker({
    adapter,
    clock,
    packageVersion: "1",
    resumeCap: RESUME_CAPS.xapi,
  });
  const verbs = () =>
    lms.statements.map((s) => {
      const id = (s.verb as { id: string }).id;
      return Object.entries({ ...XAPI_VERBS, ...CMI5_VERBS }).find(([, iri]) => iri === id)?.[0];
    });
  const find = (verb: string) =>
    lms.statements.find(
      (s) => (s.verb as { display: Record<string, string> }).display["en-US"] === verb,
    );
  return { ...lms, lms, clock, adapter, tracker, verbs, find };
}

const passedScore = {
  completion: "completed",
  success: "passed",
  score: { raw: 90, min: 0, max: 100 },
} as const;

describe("launch link", () => {
  const params = (values: Record<string, string>) => ({ get: (n: string) => values[n] ?? null });
  const full = {
    endpoint: "https://lms.example.org/xapi",
    fetch: FETCH,
    actor: '{"name":"Sam","account":{"homePage":"https://lms","name":"s7"}}',
    registration: REGISTRATION,
    activityId: AU,
  };

  test("[standards:C-1] reads endpoint, fetch, actor, registration and activityId", () => {
    expect(readCmi5Launch(params(full))).toEqual({ ...launch, actor: { ...launch.actor } });
  });

  test("[standards:C-1] any parameter missing or malformed turns reporting off, with the reason", () => {
    for (const name of Object.keys(full)) {
      expect(readCmi5Launch(params({ ...full, [name]: "" }))).toHaveProperty("error");
    }
    expect(readCmi5Launch(params({ ...full, fetch: "file:///fetch" }))).toHaveProperty("error");
    expect(readCmi5Launch(params({ ...full, registration: "seven" }))).toHaveProperty("error");
    expect(readCmi5Launch(params({ ...full, activityId: "no scheme" }))).toHaveProperty("error");
  });
});

describe("session", () => {
  test("[standards:C-1] fetch once, then launch data, preferences and state, then initialized with the context template", async () => {
    const { tracker, requests, statements, adapter } = setup();
    const session = await tracker.start();
    await settle();
    expect(session.mode).toBe("normal");
    expect(requests.map((r) => `${r.method} ${r.url.replace(ENDPOINT, "")}`.split("?")[0])).toEqual(
      [
        `POST ${FETCH.split("?")[0]}`,
        "GET about",
        "GET activities/state",
        "GET agents/profile",
        "GET activities/state",
        "POST statements",
        "POST statements",
      ],
    );
    expect(requests[2]?.url).toContain("stateId=LMS.LaunchData");
    expect(requests[2]?.url).toContain(`activityId=${encodeURIComponent(AU)}`);
    expect(requests[3]?.url).toContain("profileId=cmi5LearnerPreferences");
    expect(requests.at(-1)?.headers.Authorization).toBe(`Basic ${TOKEN}`);
    expect(adapter.returnUrl).toBe("https://lms.example.org/return");
    const [initialized, attempted] = statements;
    expect(initialized).toEqual({
      id: expect.any(String),
      actor: launch.actor,
      verb: { id: CMI5_VERBS.initialized, display: { "en-US": "initialized" } },
      object: { objectType: "Activity", id: AU },
      context: {
        registration: REGISTRATION,
        language: "en-GB",
        contextActivities: {
          grouping: [{ id: PUBLISHER_AU }],
          category: [{ id: CMI5_IRIS.category }],
        },
        extensions: { [CMI5_IRIS.sessionId]: SESSION },
      },
      timestamp: "2026-01-05T09:00:00.000Z",
    });
    // cmi5 allowed: the template, the AU as parent and no cmi5 category (cmi5 §7.1.3).
    expect(attempted).toMatchObject({
      verb: { id: XAPI_VERBS.attempted },
      context: {
        contextActivities: { parent: [{ id: AU }], grouping: [{ id: PUBLISHER_AU }] },
        extensions: { [CMI5_IRIS.sessionId]: SESSION },
      },
      timestamp: "2026-01-05T09:00:00.001Z",
    });
    expect(attempted).not.toHaveProperty("context.contextActivities.category");
  });

  test("[standards:C-1] a fetch URL that gives no token stops reporting: no LRS request is made", async () => {
    const lms = fakeLms(normal());
    const transport: Transport = (url, request) =>
      url === FETCH
        ? Promise.resolve({ status: 200, text: async () => '{"error-code":"2","error-text":"no"}' })
        : lms.transport(url, request);
    const adapter = createCmi5Adapter({ launch, course, transport, clock: fakeClock() });
    await expect(adapter.initialize()).rejects.toThrow("no session credentials: no");
    adapter.terminate();
    await settle();
    expect(lms.requests).toEqual([]);
  });

  test("[standards:C-1] a fetch URL that never answers is given up after 10 s and aborted: reporting is off and no LRS request is made", async () => {
    const lms = fakeLms(normal());
    const asked: HttpRequest[] = [];
    const transport: Transport = (url, request) => {
      if (url !== FETCH) return lms.transport(url, request);
      asked.push(request);
      return new Promise<never>(() => {});
    };
    // A clock whose timers the test runs.
    const timers: { callback: () => void; ms: number }[] = [];
    const clock: Clock = {
      ...fakeClock(),
      setTimeout: (callback, ms) => timers.push({ callback, ms }),
      clearTimeout: () => {},
    };
    let outcome: unknown;
    const tracker = createTracker({
      adapter: createCmi5Adapter({ launch, course, transport, clock }),
      clock,
      packageVersion: "1",
      resumeCap: RESUME_CAPS.xapi,
    });
    void tracker.start().then(
      () => (outcome = "started"),
      (error: unknown) => (outcome = error),
    );
    await settle();
    expect(outcome).toBeUndefined();
    expect(asked).toHaveLength(1);
    // Only the request's own 10-second timer is waiting.
    expect(timers.map((t) => t.ms)).toEqual([REQUEST_TIMEOUT_MS]);
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
    timers.shift()?.callback();
    await settle();
    expect(String(outcome)).toContain("no session credentials: no answer in time");
    expect((asked[0]?.signal as { aborted?: boolean } | undefined)?.aborted).toBe(true);
    tracker.exit(false);
    await settle();
    expect(lms.requests).toEqual([]);
  });

  test("[standards:C-1] launch data that is missing or has no launch mode stops reporting", async () => {
    await expect(setup(fakeLms(undefined)).tracker.start()).rejects.toThrow("LMS.LaunchData");
    const noMode = fakeLms({ ...normal(), launchMode: "Sometimes" });
    await expect(setup(noMode).tracker.start()).rejects.toThrow("launchMode");
    expect(noMode.statements).toEqual([]);
  });

  for (const mode of ["Browse", "Review"]) {
    test(`[standards:C-3] ${mode}: exactly initialized then terminated, and no state is written`, async () => {
      const { tracker, verbs, requests } = setup(fakeLms(normal({ launchMode: mode })));
      const session = await tracker.start();
      expect(session.mode).toBe(mode.toLowerCase());
      tracker.entered("lessonone1");
      tracker.report(passedScore);
      tracker.saveState({ location: "lessonone1" });
      tracker.exit(true);
      await settle();
      expect(verbs()).toEqual(["initialized", "terminated"]);
      expect(requests.filter((r) => r.method === "PUT")).toEqual([]);
    });
  }
});

describe("cmi5-defined statements", () => {
  test("[standards:C-5] [standards:C-6] [standards:C-8] [standards:R14] completed, then passed, then terminated; a second passed and a failed after passed are refused", async () => {
    const { tracker, verbs, find, clock } = setup();
    await tracker.start();
    clock.advance(90_000);
    tracker.report(passedScore);
    tracker.report({ ...passedScore, score: { raw: 95, min: 0, max: 100 } });
    tracker.report({
      completion: "completed",
      success: "failed",
      score: { raw: 10, min: 0, max: 100 },
    });
    tracker.exit(true);
    await settle();
    expect(verbs()).toEqual(["initialized", "attempted", "completed", "passed", "terminated"]);
    const moveOn = { id: CMI5_IRIS.moveOnCategory };
    expect(find("completed")).toMatchObject({
      result: { completion: true, duration: "PT1M30S" },
      context: { contextActivities: { category: [{ id: CMI5_IRIS.category }, moveOn] } },
    });
    expect(find("completed")).not.toHaveProperty("result.extensions");
    expect(find("passed")).toMatchObject({
      result: { score: { scaled: 0.9, raw: 90, min: 0, max: 100 }, success: true },
      context: {
        contextActivities: { category: [{ id: CMI5_IRIS.category }, moveOn] },
        extensions: { [CMI5_IRIS.masteryScore]: 0.8, [CMI5_IRIS.sessionId]: SESSION },
      },
    });
    expect(find("terminated")).toMatchObject({ result: { duration: "PT1M30S" } });
    expect(find("terminated")).not.toHaveProperty("context.contextActivities.category.1");
    // Nothing after terminated.
    tracker.entered("lessonone1");
    await settle();
    expect(verbs().at(-1)).toBe("terminated");
  });

  test("[standards:C-4] the launch data's mastery score decides passed or failed from the scaled score", async () => {
    const low = setup();
    await low.tracker.start();
    // The course passed the learner at 75; the LMS asks for 0.8.
    low.tracker.report({
      completion: "completed",
      success: "passed",
      score: { raw: 75, min: 0, max: 100 },
    });
    low.tracker.exit(true);
    await settle();
    expect(low.verbs()).toEqual(["initialized", "attempted", "completed", "failed", "terminated"]);
    expect(low.find("failed")).toMatchObject({
      result: { success: false, score: { scaled: 0.75 } },
      context: { extensions: { [CMI5_IRIS.masteryScore]: 0.8 } },
    });

    const unjudged = setup();
    await unjudged.tracker.start();
    unjudged.tracker.report({ completion: "incomplete", score: { raw: 85, min: 0, max: 100 } });
    await settle();
    expect(unjudged.verbs().at(-1)).toBe("passed");
  });

  test("[standards:C-6] a failed result waits for the end of the session, so a pass after a retry is sent instead", async () => {
    const retried = setup();
    await retried.tracker.start();
    retried.tracker.report({
      completion: "incomplete",
      success: "failed",
      score: { raw: 40, min: 0, max: 100 },
    });
    retried.tracker.report(passedScore);
    retried.tracker.exit(true);
    await settle();
    expect(retried.verbs()).toEqual([
      "initialized",
      "attempted",
      "completed",
      "passed",
      "terminated",
    ]);

    const gaveUp = setup();
    await gaveUp.tracker.start();
    gaveUp.tracker.report({
      completion: "incomplete",
      success: "failed",
      score: { raw: 40, min: 0, max: 100 },
    });
    gaveUp.tracker.exit(false);
    await settle();
    expect(gaveUp.verbs()).toEqual(["initialized", "attempted", "failed", "terminated"]);
  });

  test("[standards:C-2] [standards:C-9] a relaunch resumes from the AU's own state and never sends completed or passed twice in a registration", async () => {
    const first = setup();
    await first.tracker.start();
    first.tracker.setLocation("#/lessons/lessonone1");
    first.tracker.report(passedScore);
    first.tracker.exit(true);
    await settle();
    const saved = JSON.parse(first.state.get("course-state") ?? "{}");
    expect(saved).toMatchObject({
      location: "#/lessons/lessonone1",
      committed: { completed: true, passed: true },
    });

    // The next launch of the same registration: a new fetch URL, the same LRS.
    const second = setup(fakeLms(normal(), first.state));
    const session = await second.tracker.start();
    expect(session.location).toBe("#/lessons/lessonone1");
    expect(session.status).toMatchObject({ completion: "completed", success: "passed" });
    second.adapter.reportStatus({ ...passedScore, score: { raw: 100, min: 0, max: 100 } });
    second.tracker.exit(true);
    await settle();
    expect(second.verbs()).toEqual(["initialized", "attempted", "terminated"]);
  });

  test("[standards:C-7] allowed statements carry the 0-100 progress extension until the course is completed", async () => {
    const { tracker, find, statements } = setup(fakeLms(normal({ moveOn: "Completed" })));
    await tracker.start();
    tracker.report({ completion: "incomplete", progress: 0.5 });
    tracker.entered("lessonone1");
    tracker.report({ completion: "completed", progress: 1 });
    tracker.left("lessonone1");
    await settle();
    expect(find("experienced")).toMatchObject({
      object: { id: "https://example.org/courses/compost/lessonone1" },
      result: { extensions: { [CMI5_IRIS.progress]: 50 } },
    });
    expect(find("completed")).not.toHaveProperty("result.extensions");
    expect(statements.at(-1)).not.toHaveProperty("result.extensions");
  });

  test("moveOn honoured: a course with nothing to judge passes on completion when the LMS waits for passed", async () => {
    const { tracker, verbs, find } = setup(
      fakeLms(normal({ moveOn: "Passed", masteryScore: undefined })),
    );
    await tracker.start();
    tracker.report({ completion: "completed" });
    await settle();
    expect(verbs().slice(-2)).toEqual(["completed", "passed"]);
    expect(find("passed")).not.toHaveProperty("result.score");
  });
});
