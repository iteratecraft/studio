import type { Course, Interaction } from "@course-suite/format";
import { describe, expect, test } from "vitest";
import {
  type Clock,
  createTracker,
  createXapiAdapter,
  type HttpRequest,
  isoDuration,
  OFFLINE_RETRY_MS,
  RESUME_CAPS,
  RETRY_DELAYS_MS,
  readXapiLaunch,
  type Transport,
  XAPI_STATE_ID,
  XAPI_VERBS,
  type XapiLaunch,
} from "./index.js";

const ENDPOINT = "https://lrs.example.org/xapi/";
const REGISTRATION = "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const course: Course = {
  schemaVersion: "1.0",
  id: "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en-GB",
  publish: { standard: "xapi", activityId: "https://example.org/courses/compost" },
  entries: [
    { id: "lessonone1", kind: "lesson", title: "Why compost", blocks: [] },
    {
      id: "quizfinal1",
      kind: "quiz",
      title: "Final check",
      questions: [
        {
          id: "qbrown0001",
          kind: "single-choice",
          prompt: "<p>Is cardboard a green or a brown?</p>",
          answers: [
            { id: "abrown0001", text: "Brown", correct: true },
            { id: "agreen0001", text: "Green", correct: false },
          ],
        },
      ],
    },
  ],
  media: [],
};

const launch: XapiLaunch = {
  endpoint: ENDPOINT,
  auth: "Basic dGVzdDp0ZXN0",
  actor: { objectType: "Agent", name: "Sam", mbox: "mailto:sam@example.org" },
  registration: REGISTRATION,
};

/** A clock that moves only when the test advances it, running timers in time order. */
function fakeClock() {
  let now = Date.UTC(2026, 0, 5, 9);
  let nextHandle = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock & { advance(ms: number): Promise<void> } = {
    now: () => now,
    setTimeout(callback, ms) {
      timers.set(++nextHandle, { at: now + ms, callback });
      return nextHandle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await settle();
        const due = [...timers]
          .filter(([, t]) => t.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
      await settle();
    },
  };
  return clock;
}

/** Lets queued promise callbacks run. */
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

interface Sent extends HttpRequest {
  path: string;
  params: Record<string, string>;
}

/** An LRS behind a fake `fetch`: `failNext` requests fail without an answer, `status` answers instead. */
function fakeLrs(versions = ["1.0.3"]) {
  const requests: Sent[] = [];
  const statements: Record<string, unknown>[] = [];
  const state = new Map<string, string>();
  const lrs = { requests, statements, state, failNext: 0, status: undefined as number | undefined };
  const transport: Transport = async (url, request) => {
    const [path = "", search = ""] = url.slice(ENDPOINT.length).split("?");
    const params = Object.fromEntries(
      search
        .split("&")
        .filter(Boolean)
        .map((pair) => pair.split("=").map(decodeURIComponent) as [string, string]),
    );
    requests.push({ ...request, path, params });
    const answer = (status: number, body = "") => ({ status, text: async () => body });
    if (lrs.failNext > 0) {
      lrs.failNext--;
      throw new TypeError("Failed to fetch");
    }
    if (lrs.status !== undefined) return answer(lrs.status);
    if (path === "about") return answer(200, JSON.stringify({ version: versions }));
    if (path === "statements") {
      statements.push(...(JSON.parse(request.body ?? "[]") as Record<string, unknown>[]));
      return answer(200, "[]");
    }
    const key = `${params.activityId} ${params.agent} ${params.registration} ${params.stateId}`;
    if (request.method === "PUT") {
      state.set(key, request.body ?? "");
      return answer(204);
    }
    const stored = state.get(key);
    return stored === undefined ? answer(404) : answer(200, stored);
  };
  return { lrs, transport };
}

let ids = 0;
function setup(lrs = fakeLrs(), extra: { online?: boolean[]; errors?: unknown[] } = {}) {
  const clock = fakeClock();
  const adapter = createXapiAdapter({
    launch,
    course,
    clock,
    transport: lrs.transport,
    uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    onConnection: (online) => extra.online?.push(online),
    onError: (error) => extra.errors?.push(error),
  });
  const tracker = createTracker({
    adapter,
    clock,
    packageVersion: "1",
    resumeCap: RESUME_CAPS.xapi,
    resumeDelayMs: 100,
    saveIntervalMs: 20_000,
  });
  const verbs = () =>
    lrs.lrs.statements.map((s) => {
      const verb = Object.entries(XAPI_VERBS).find(
        ([, id]) => id === (s.verb as { id: string }).id,
      );
      return `${verb?.[0]} ${(s.object as { id: string }).id}`;
    });
  return { ...lrs, requests: lrs.lrs.requests, clock, adapter, tracker, verbs };
}

describe("launch link", () => {
  const params = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  });

  test("[standards:X-1] reads endpoint, auth, actor and registration", () => {
    expect(
      readXapiLaunch(
        params({
          endpoint: "https://lrs.example.org/xapi",
          auth: "Basic abc",
          actor: '{"name":"Sam","mbox":"mailto:sam@example.org"}',
          registration: REGISTRATION,
        }),
      ),
    ).toEqual({
      endpoint: "https://lrs.example.org/xapi/",
      auth: "Basic abc",
      actor: { objectType: "Agent", name: "Sam", mbox: "mailto:sam@example.org" },
      registration: REGISTRATION,
    });
  });

  test("[standards:X-1] reads the older actor form with arrays and account field names", () => {
    const read = readXapiLaunch(
      params({
        endpoint: ENDPOINT,
        auth: "Basic abc",
        actor:
          '{"name":["Sam"],"account":[{"accountServiceHomePage":"https://lms.example.org","accountName":"sam-7"}]}',
      }),
    );
    expect(read).toMatchObject({
      actor: { name: "Sam", account: { homePage: "https://lms.example.org", name: "sam-7" } },
    });
    expect(read).not.toHaveProperty("registration");
  });

  test("[standards:X-1] without an endpoint, credentials or learner reporting is off, with the reason", () => {
    const full = { endpoint: ENDPOINT, auth: "Basic abc", actor: '{"mbox":"mailto:a@b.c"}' };
    expect(readXapiLaunch(params({ ...full, endpoint: "" }))).toHaveProperty("error");
    expect(readXapiLaunch(params({ auth: full.auth, actor: full.actor }))).toHaveProperty("error");
    expect(readXapiLaunch(params({ endpoint: ENDPOINT, actor: full.actor }))).toHaveProperty(
      "error",
    );
    expect(readXapiLaunch(params({ endpoint: ENDPOINT, auth: full.auth }))).toHaveProperty("error");
    expect(readXapiLaunch(params({ ...full, actor: '{"name":"no id"}' }))).toHaveProperty("error");
    expect(readXapiLaunch(params({ ...full, endpoint: "file:///lrs" }))).toHaveProperty("error");
    expect(readXapiLaunch(params({ ...full, registration: "seven" }))).toHaveProperty("error");
  });

  test("[standards:E-17] the author's LRS is used only when the link names none, and its credentials never go elsewhere", () => {
    const author = { endpoint: "https://author-lrs.example.org/", auth: "Basic author" };
    const actor = '{"mbox":"mailto:a@b.c"}';
    expect(readXapiLaunch(params({ actor }), author)).toMatchObject(author);
    expect(
      readXapiLaunch(params({ endpoint: ENDPOINT, auth: "Basic link", actor }), author),
    ).toMatchObject({
      endpoint: ENDPOINT,
      auth: "Basic link",
    });
    // A link endpoint without its own credentials does not borrow the author's.
    expect(readXapiLaunch(params({ endpoint: ENDPOINT, actor }), author)).toHaveProperty("error");
  });
});

describe("statements", () => {
  test("[standards:X-1] [standards:X-3] [standards:X-6] [standards:X-7] first launch: version, state read, then attempted with completion false", async () => {
    const { tracker, lrs, requests } = setup();
    const session = await tracker.start();
    await settle();
    expect(session.status).toEqual({ completion: "not-attempted", success: "unknown" });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET about",
      "GET activities/state",
      "POST statements",
    ]);
    expect(requests[1]?.params).toEqual({
      activityId: "https://example.org/courses/compost",
      agent: JSON.stringify(launch.actor),
      registration: REGISTRATION,
      stateId: XAPI_STATE_ID,
    });
    expect(requests[2]?.headers).toEqual({
      "X-Experience-API-Version": "1.0.3",
      Authorization: "Basic dGVzdDp0ZXN0",
      "Content-Type": "application/json",
    });
    expect(lrs.statements).toEqual([
      {
        id: expect.stringMatching(UUID),
        actor: launch.actor,
        verb: { id: XAPI_VERBS.attempted, display: { "en-US": "attempted" } },
        object: {
          objectType: "Activity",
          id: "https://example.org/courses/compost",
          definition: {
            type: "http://adlnet.gov/expapi/activities/course",
            name: { "en-GB": "Compost basics" },
          },
        },
        result: { completion: false },
        context: { registration: REGISTRATION, language: "en-GB" },
        timestamp: "2026-01-05T09:00:00.000Z",
      },
    ]);
  });

  test("[standards:X-7] speaks xAPI 2.0 to an LRS that supports it", async () => {
    const { tracker, requests } = setup(fakeLrs(["1.0.3", "2.0.0"]));
    await tracker.start();
    await settle();
    expect(requests.at(-1)?.headers["X-Experience-API-Version"]).toBe("2.0.0");
  });

  test("[standards:X-2] [standards:X-3] lessons: experienced, then left with its duration, inside the course", async () => {
    const { tracker, lrs, clock, verbs } = setup();
    await tracker.start();
    tracker.entered("lessonone1");
    await clock.advance(72_260);
    tracker.left("lessonone1");
    await settle();
    expect(verbs()).toEqual([
      "attempted https://example.org/courses/compost",
      "experienced https://example.org/courses/compost/lessonone1",
      "left https://example.org/courses/compost/lessonone1",
    ]);
    const [, experienced, left] = lrs.statements;
    expect(experienced).toMatchObject({
      object: {
        definition: {
          type: "http://adlnet.gov/expapi/activities/module",
          name: { "en-GB": "Why compost" },
        },
      },
      context: {
        registration: REGISTRATION,
        contextActivities: {
          parent: [{ id: "https://example.org/courses/compost" }],
          grouping: [{ id: "https://example.org/courses/compost" }],
        },
        language: "en-GB",
      },
    });
    expect(experienced).not.toHaveProperty("result");
    expect(left).toMatchObject({
      verb: { id: "http://activitystrea.ms/schema/1.0/leave" },
      result: { duration: "PT1M12.26S" },
    });
  });

  test("[standards:X-2] [rise:R10] an answer, the quiz result and the course result, each with its own shape", async () => {
    const { tracker, lrs, clock, verbs } = setup();
    await tracker.start();
    await clock.advance(90_000);
    const answer: Interaction = {
      id: "Final_check_Is_cardboard_a_green_or_a_brown?_1",
      weighting: 1,
      result: "correct",
      type: "choice",
      response: ["Brown"],
      correctResponse: ["Brown"],
    };
    tracker.recordInteraction(answer, { quiz: "quizfinal1", question: "qbrown0001" });
    tracker.quizScored("quizfinal1", { score: 100, passed: true });
    tracker.report({
      completion: "completed",
      success: "passed",
      score: { raw: 100, min: 0, max: 100 },
    });
    await settle();
    expect(verbs().slice(1)).toEqual([
      "answered https://example.org/courses/compost/quizfinal1/qbrown0001",
      "passed https://example.org/courses/compost/quizfinal1",
      "passed https://example.org/courses/compost",
    ]);
    const [, answered, quiz, result] = lrs.statements;
    expect(answered).toMatchObject({
      object: {
        definition: {
          type: "http://adlnet.gov/expapi/activities/cmi.interaction",
          name: { "en-GB": "Is cardboard a green or a brown?" },
          interactionType: "choice",
          correctResponsesPattern: ["Brown"],
        },
      },
      result: { success: true, response: "Brown" },
    });
    expect(quiz).toMatchObject({
      result: { score: { scaled: 1, raw: 100, min: 0, max: 100 }, success: true, completion: true },
    });
    expect(result).toMatchObject({
      result: {
        score: { scaled: 1, raw: 100, min: 0, max: 100 },
        success: true,
        completion: true,
        duration: "PT1M30S",
      },
    });
    expect(result).not.toHaveProperty("context.contextActivities");
  });

  test("[standards:X-2] completed is sent once; failed then passed are each sent once", async () => {
    const { tracker, verbs } = setup();
    await tracker.start();
    tracker.report({ completion: "incomplete", progress: 0.5 });
    tracker.report({
      completion: "incomplete",
      success: "failed",
      score: { raw: 40, min: 0, max: 100 },
    });
    tracker.report({
      completion: "completed",
      success: "passed",
      score: { raw: 80, min: 0, max: 100 },
    });
    tracker.report({ progress: 1 });
    await settle();
    expect(verbs().map((line) => line.split(" ")[0])).toEqual(["attempted", "failed", "passed"]);
  });
});

describe("state", () => {
  test("[standards:X-4] resume, bookmark, time and status go to one state document, and a relaunch resumes from it", async () => {
    const first = setup();
    await first.tracker.start();
    first.tracker.setLocation("#/lessons/lessonone1");
    first.tracker.saveState({ location: "lessonone1", done: ["lessonone1"] });
    await first.clock.advance(20_000);
    expect(first.requests.filter((r) => r.method === "PUT")).toHaveLength(1);
    first.tracker.exit(false);
    await settle();
    const [document] = [...first.lrs.state.values()];
    const saved = JSON.parse(document ?? "{}");
    expect(saved).toEqual({
      resume: expect.stringMatching(/^1\./),
      location: "#/lessons/lessonone1",
      language: "en-GB",
      totalTimeMs: 20_000,
    });

    // The same learner and registration: the adapter reads it all back.
    const second = setup({ ...first, transport: first.transport });
    const session = await second.tracker.start();
    expect(session.location).toBe("#/lessons/lessonone1");
    expect(session.totalTimeMs).toBe(20_000);
    expect(session.resume).toMatchObject({ status: "ok", state: { location: "lessonone1" } });
    await settle();
    // Not the first attempt any more: attempted carries no result.
    expect(first.lrs.statements.at(-1)).not.toHaveProperty("result");
    second.tracker.exit(false);
    await settle();
    expect(JSON.parse([...first.lrs.state.values()][0] ?? "{}").totalTimeMs).toBe(20_000);
  });

  test("[standards:X-4] a state document that cannot be read stops tracking instead of overwriting it", async () => {
    const lrs = fakeLrs();
    const { tracker, clock, requests } = setup(lrs);
    lrs.lrs.failNext = 100;
    const started = tracker.start();
    const failed = expect(started).rejects.toThrow("could not be read");
    await clock.advance(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    await failed;
    tracker.exit(false);
    await settle();
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  });
});

describe("delivery", () => {
  test("[standards:X-5] a failed send is retried after 100, 400 and 400 ms, as the same batch, and delivered once, in order", async () => {
    const lrs = fakeLrs();
    const { tracker, clock, verbs, requests } = setup(lrs);
    await tracker.start();
    await settle();
    lrs.lrs.failNext = 3;
    tracker.entered("lessonone1");
    tracker.left("lessonone1");
    await settle();
    const tries = () => requests.filter((r) => r.path === "statements").length;
    expect(tries()).toBe(2);
    await clock.advance(99);
    expect(tries()).toBe(2);
    await clock.advance(1);
    expect(tries()).toBe(3);
    await clock.advance(800);
    // The retries carry only the statement that failed; the next one follows on its own.
    expect(tries()).toBe(6);
    const sizes = requests
      .filter((r) => r.path === "statements")
      .map((r) => JSON.parse(r.body ?? "[]").length);
    expect(sizes).toEqual([1, 1, 1, 1, 1, 1]);
    expect(verbs()).toEqual([
      "attempted https://example.org/courses/compost",
      "experienced https://example.org/courses/compost/lessonone1",
      "left https://example.org/courses/compost/lessonone1",
    ]);
  });

  test("[standards:X-5] after the quick retries it reports offline, keeps retrying, then delivers everything in order", async () => {
    const lrs = fakeLrs();
    const online: boolean[] = [];
    const { tracker, clock, verbs } = setup(lrs, { online });
    await tracker.start();
    await settle();
    lrs.lrs.failNext = 1_000;
    tracker.entered("lessonone1");
    await clock.advance(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    expect(online).toEqual([false]);
    tracker.left("lessonone1");
    tracker.entered("quizfinal1");
    await clock.advance(3 * OFFLINE_RETRY_MS);
    expect(verbs()).toHaveLength(1);
    lrs.lrs.failNext = 0;
    await clock.advance(OFFLINE_RETRY_MS);
    expect(online).toEqual([false, true]);
    expect(verbs().map((line) => line.split(" ")[0])).toEqual([
      "attempted",
      "experienced",
      "left",
      "experienced",
    ]);
    expect(new Set(lrs.lrs.statements.map((s) => s.id)).size).toBe(4);
  });

  test("[standards:X-5] a statement the LRS already holds is not sent again; a refused one is reported and skipped", async () => {
    const lrs = fakeLrs();
    const errors: unknown[] = [];
    const { tracker, requests } = setup(lrs, { errors });
    await tracker.start();
    await settle();
    lrs.lrs.status = 409;
    tracker.entered("lessonone1");
    await settle();
    lrs.lrs.status = 400;
    tracker.left("lessonone1");
    await settle();
    lrs.lrs.status = undefined;
    tracker.entered("quizfinal1");
    await settle();
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("400");
    expect(requests.filter((r) => r.path === "statements")).toHaveLength(4);
  });

  test("[standards:R9] [standards:R16] a closing page sends what is still queued with keepalive, only to the LRS", async () => {
    const lrs = fakeLrs();
    const { tracker, requests } = setup(lrs);
    await tracker.start();
    await settle();
    lrs.lrs.failNext = 1;
    tracker.entered("lessonone1");
    tracker.saveState({ location: "lessonone1" });
    tracker.left("lessonone1");
    tracker.exit(false);
    await settle();
    // The batch that was on its way goes again on its own, then the rest, then the state.
    const last = requests.slice(-3);
    expect(last.map((r) => `${r.method} ${r.path} ${r.keepalive}`)).toEqual([
      "POST statements true",
      "POST statements true",
      "PUT activities/state true",
    ]);
    expect(last.slice(0, 2).map((r) => JSON.parse(r.body ?? "[]").length)).toEqual([1, 1]);
    // Nothing after the session ends.
    tracker.entered("quizfinal1");
    await settle();
    expect(requests.slice(-3)).toEqual(last);
  });
});

test("ISO 8601 durations to the hundredth of a second", () => {
  expect(isoDuration(0)).toBe("PT0S");
  expect(isoDuration(1_234)).toBe("PT1.23S");
  expect(isoDuration(72_260)).toBe("PT1M12.26S");
  expect(isoDuration(3_600_000)).toBe("PT1H");
  expect(isoDuration(3_723_450)).toBe("PT1H2M3.45S");
});
