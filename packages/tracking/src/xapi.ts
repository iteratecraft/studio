// xAPI run-time adapter with the Blocks profile (STD-06, M1-25; standards.md §3.8 X-1..X-7, §4.3,
// §4.4): reads the LRS, learner and registration from the launch link, keeps resume data, bookmark,
// time and status in one LRS state document, and reports what the learner does as statements. It
// sends nothing anywhere but the LRS the launch names, or the one the author set (rule 16, ADR-0004).
import {
  activityIri,
  type Course,
  type Interaction,
  plainText,
  type Question,
} from "@course-suite/format";
import { createLrs, type Lrs, type StateParams, type Transport } from "./lrs.js";
import {
  type Clock,
  type Launch,
  type QuestionRef,
  type QuizAttempt,
  type Status,
  systemClock,
  type TrackingAdapter,
} from "./tracker.js";

/** Verbs of our statement set (standards.md §4.4). */
export const XAPI_VERBS = {
  attempted: "http://adlnet.gov/expapi/verbs/attempted",
  experienced: "http://adlnet.gov/expapi/verbs/experienced",
  left: "http://activitystrea.ms/schema/1.0/leave",
  answered: "http://adlnet.gov/expapi/verbs/answered",
  completed: "http://adlnet.gov/expapi/verbs/completed",
  passed: "http://adlnet.gov/expapi/verbs/passed",
  failed: "http://adlnet.gov/expapi/verbs/failed",
} as const;
export type XapiVerb = keyof typeof XAPI_VERBS;

/** Activity types: the course, each lesson or quiz, each question (standards.md E-15). */
export const XAPI_ACTIVITY_TYPES = {
  course: "http://adlnet.gov/expapi/activities/course",
  module: "http://adlnet.gov/expapi/activities/module",
  interaction: "http://adlnet.gov/expapi/activities/cmi.interaction",
} as const;

/** The state document that holds the learner's progress in this course. */
export const XAPI_STATE_ID = "course-state";

/** An xAPI agent: a name and exactly one identifier. */
export interface Agent {
  objectType?: "Agent";
  name?: string;
  mbox?: string;
  mbox_sha1sum?: string;
  openid?: string;
  account?: { homePage: string; name: string };
}

/** An LRS the author set at publish, for courses launched without one (standards.md E-17). */
export interface LrsSettings {
  endpoint: string;
  auth?: string;
}

/** Where and for whom the course reports. */
export interface XapiLaunch {
  /** Ends in `/`. */
  endpoint: string;
  auth: string;
  actor: Agent;
  registration?: string;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The launch-link parameters `endpoint`, `auth`, `actor` and `registration` (standards.md X-1). An
 * LRS the author set is used only when the link names none; its credentials never go to another
 * endpoint. Without an endpoint, credentials or a learner, reporting is off: the reason is returned.
 */
export function readXapiLaunch(
  params: { get(name: string): string | null },
  author?: LrsSettings,
): XapiLaunch | { error: string } {
  const linked = params.get("endpoint");
  const endpoint = linked ?? author?.endpoint;
  const auth = linked === null ? author?.auth : params.get("auth");
  if (!endpoint) return { error: "The launch link names no LRS endpoint." };
  if (!/^https?:\/\/[^/]/i.test(endpoint)) {
    return { error: "The LRS endpoint is not an http or https address." };
  }
  if (!auth) return { error: "The launch link gives no LRS credentials (auth)." };
  const actor = toAgent(params.get("actor"));
  if (!actor) return { error: "The launch link names no valid learner (actor)." };
  const registration = params.get("registration");
  if (registration !== null && !UUID.test(registration)) {
    return { error: "The launch link's registration is not a UUID." };
  }
  return {
    endpoint: endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
    auth,
    actor,
    ...(registration !== null && { registration }),
  };
}

/**
 * The learner from the `actor` parameter, with one identifier. Older launch links wrap each value
 * in an array and name account fields `accountServiceHomePage` and `accountName`.
 */
export function toAgent(json: string | null): Agent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json ?? "");
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const first = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);
  const text = (key: string) => {
    const found = first(key);
    return typeof found === "string" && found !== "" ? found : undefined;
  };
  const name = text("name");
  const agent: Agent = { objectType: "Agent", ...(name && { name }) };
  const mbox = text("mbox");
  const sha1 = text("mbox_sha1sum");
  const openid = text("openid");
  const account = first("account") as Record<string, unknown> | undefined;
  const homePage = account?.homePage ?? account?.accountServiceHomePage;
  const accountName = account?.name ?? account?.accountName;
  if (mbox) return { ...agent, mbox: mbox.startsWith("mailto:") ? mbox : `mailto:${mbox}` };
  if (sha1) return { ...agent, mbox_sha1sum: sha1 };
  if (openid) return { ...agent, openid };
  if (typeof homePage === "string" && homePage && typeof accountName === "string" && accountName) {
    return { ...agent, account: { homePage, name: accountName } };
  }
  return undefined;
}

export interface XapiAdapterOptions {
  launch: XapiLaunch;
  course: Course;
  clock?: Clock;
  transport?: Transport;
  /** Statement ids; default random version 4 UUIDs. */
  uuid?: () => string;
  /** False once sending has failed past the quick retries (the offline banner), true when it works again. */
  onConnection?: (online: boolean) => void;
  /** The LRS refused a request for good. Default: the console. */
  onError?: (error: unknown) => void;
}

/** What the state document holds (standards.md §4.4 "State documents"). */
export interface Progress {
  resume?: string;
  location?: string;
  language?: string;
  /** Time in every session so far, in milliseconds. */
  totalTimeMs?: number;
  /** What was last reported, so a relaunch does not report it again. */
  status?: Status;
}

export const NOT_ATTEMPTED: Status = { completion: "not-attempted", success: "unknown" };

/**
 * The xAPI adapter. Its methods queue statements and state writes and return at once; the LRS client
 * sends them in order and retries (standards.md X-5). `initialize` throws when the state document
 * cannot be read, so a session never overwrites progress it could not load.
 */
export function createXapiAdapter(options: XapiAdapterOptions): TrackingAdapter & { lrs: Lrs } {
  const { launch, course } = options;
  const clock = options.clock ?? systemClock;
  const uuid = options.uuid ?? uuidV4;
  const language = course.sourceLanguage ?? course.labelSet?.language ?? "en";
  const courseId = activityIri(course);
  const lrs = createLrs({
    endpoint: launch.endpoint,
    auth: launch.auth,
    clock,
    ...(options.transport && { transport: options.transport }),
    ...(options.onConnection && { onConnection: options.onConnection }),
    ...(options.onError && { onError: options.onError }),
  });
  const stateParams: StateParams = {
    activityId: courseId,
    agent: JSON.stringify(launch.actor),
    ...(launch.registration && { registration: launch.registration }),
    stateId: XAPI_STATE_ID,
  };
  const activities = activitiesOf(course, language);
  const progress: Progress = {};
  let earlierMs = 0;
  let startedAt = 0;
  let stored: string | undefined;
  const opened = new Map<string, number>();

  const totalMs = () => earlierMs + clock.now() - startedAt;

  function send(verb: XapiVerb, object: Activity, result?: Record<string, unknown>) {
    const inCourse = object.id !== courseId;
    lrs.send({
      id: uuid(),
      actor: launch.actor,
      verb: { id: XAPI_VERBS[verb], display: { "en-US": verb } },
      object: { objectType: "Activity", ...object },
      ...(result && { result }),
      context: {
        ...(launch.registration && { registration: launch.registration }),
        // Parent and grouping are the course for everything in it (standards.md §4.4).
        ...(inCourse && {
          contextActivities: { parent: [{ id: courseId }], grouping: [{ id: courseId }] },
        }),
        language,
      },
      timestamp: new Date(clock.now()).toISOString(),
    });
  }

  const courseActivity = (): Activity => ({
    id: courseId,
    definition: {
      type: XAPI_ACTIVITY_TYPES.course,
      name: { [language]: course.title },
      ...(course.description && { description: { [language]: plainText(course.description) } }),
    },
  });

  const activity = (...ids: string[]): Activity => ({
    id: activityIri(course, ...ids),
    definition: activities.get(ids.join("/")) ?? { type: XAPI_ACTIVITY_TYPES.module },
  });

  return {
    lrs,

    async initialize(): Promise<Launch> {
      await lrs.connect();
      const text = await lrs.getState(stateParams);
      Object.assign(progress, readProgress(text));
      stored = text;
      earlierMs = progress.totalTimeMs ?? 0;
      startedAt = clock.now();
      progress.language = language;
      // Course start; completion false only on the first attempt (standards.md §4.4).
      send("attempted", courseActivity(), text === undefined ? { completion: false } : undefined);
      const result: Launch = { mode: "normal", status: progress.status ?? NOT_ATTEMPTED };
      if (progress.resume !== undefined) result.resume = progress.resume;
      if (progress.location !== undefined) result.location = progress.location;
      if (earlierMs > 0) result.totalTimeMs = earlierMs;
      return result;
    },

    writeResume(payload) {
      progress.resume = payload;
    },

    writeLocation(location) {
      progress.location = location;
    },

    reportStatus(status) {
      const before = progress.status ?? NOT_ATTEMPTED;
      progress.status = status;
      // Passed or failed, else completed, once each change (standards.md §4.3, §4.4).
      const verb =
        status.success !== "unknown" && status.success !== before.success
          ? status.success
          : status.completion === "completed" && before.completion !== "completed"
            ? "completed"
            : undefined;
      if (!verb) return false;
      send(verb, courseActivity(), {
        ...(status.score && { score: score(status.score) }),
        ...(status.success !== "unknown" && { success: status.success === "passed" }),
        completion: status.completion === "completed",
        duration: isoDuration(totalMs()),
      });
      return true;
    },

    reportInteraction(interaction, question?: QuestionRef) {
      if (!question) return;
      send(
        "answered",
        interactionActivity(activity(question.quiz, question.question), interaction),
        {
          success: interaction.result === "correct",
          response: response(interaction.type, interaction.response),
        },
      );
    },

    reportEntered(page) {
      opened.set(page, clock.now());
      send("experienced", activity(page));
    },

    reportLeft(page) {
      const since = opened.get(page);
      opened.delete(page);
      send(
        "left",
        activity(page),
        since === undefined ? undefined : { duration: isoDuration(clock.now() - since) },
      );
    },

    reportQuiz(quiz, attempt: QuizAttempt) {
      send(attempt.passed ? "passed" : "failed", activity(quiz), {
        score: score({ raw: attempt.score, min: 0, max: 100 }),
        success: attempt.passed,
        completion: true,
      });
    },

    writeSessionTime(ms) {
      progress.totalTimeMs = earlierMs + ms;
    },

    setExit() {
      // xAPI has no exit value: the state document already says where the learner is.
    },

    commit() {
      const body = JSON.stringify(progress);
      if (body === stored) return;
      lrs.putState(stateParams, body);
      stored = body;
    },

    terminate() {
      lrs.close();
    },
  };
}

export interface Activity {
  id: string;
  definition: Record<string, unknown>;
}

/** Definitions of every lesson, quiz and quiz question, by content id path (`quiz/question`). */
export function activitiesOf(
  course: Course,
  language: string,
): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();
  const name = (text: string) => ({ [language]: text });
  for (const entry of course.entries) {
    if (entry.kind === "section") continue;
    found.set(entry.id, { type: XAPI_ACTIVITY_TYPES.module, name: name(entry.title) });
    if (entry.kind !== "quiz") continue;
    for (const item of entry.questions) {
      const questions = item.kind === "draw" ? item.pool.map((pooled) => pooled.question) : [item];
      for (const question of questions) {
        found.set(`${entry.id}/${question.id}`, {
          type: XAPI_ACTIVITY_TYPES.interaction,
          name: name(plainText(question.prompt)),
          interactionType: interactionType(question),
        });
      }
    }
  }
  return found;
}

/** The xAPI interaction type of a question (rise.md rule 10). */
export function interactionType(question: Question): Interaction["type"] {
  return question.kind === "fill-in"
    ? "fill-in"
    : question.kind === "matching"
      ? "matching"
      : "choice";
}

export function interactionActivity(activity: Activity, interaction: Interaction): Activity {
  const patterns =
    interaction.type === "fill-in"
      ? interaction.correctResponse
      : [response(interaction.type, interaction.correctResponse)];
  return {
    ...activity,
    definition: {
      ...activity.definition,
      interactionType: interaction.type,
      correctResponsesPattern: patterns,
    },
  };
}

/** xAPI response text: choices joined by `[,]`, matching pairs as `source[.]target`. */
export function response(type: Interaction["type"], value: Interaction["response"]): string {
  if (typeof value === "string") return value;
  if (type === "matching") {
    return (value as [string, string][]).map((pair) => pair.join("[.]")).join("[,]");
  }
  return (value as string[]).join("[,]");
}

/** Score with scaled = raw ÷ max (standards.md rule 12). */
export function score(value: { raw: number; min: number; max: number }) {
  return { scaled: value.max > 0 ? value.raw / value.max : 0, ...value };
}

/** An ISO 8601 duration such as `PT1H2M3.45S`, to the hundredth of a second (xAPI). */
export function isoDuration(ms: number): string {
  const centis = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor(centis / 6_000) % 60;
  const seconds = (centis % 6_000) / 100;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds || !(hours || minutes) ? `${seconds}S` : ""}`;
}

export function readProgress(text: string | undefined): Progress {
  if (text === undefined) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const progress: Progress = {};
  if (typeof raw.resume === "string") progress.resume = raw.resume;
  if (typeof raw.location === "string") progress.location = raw.location;
  if (typeof raw.totalTimeMs === "number" && raw.totalTimeMs >= 0)
    progress.totalTimeMs = raw.totalTimeMs;
  if (isStatus(raw.status)) progress.status = raw.status;
  return progress;
}

function isStatus(value: unknown): value is Status {
  const status = value as Partial<Status> | null;
  return (
    typeof status === "object" &&
    status !== null &&
    ["not-attempted", "incomplete", "completed", "unknown"].includes(String(status.completion)) &&
    ["unknown", "passed", "failed"].includes(String(status.success))
  );
}

// No DOM typings here; Web Crypto is global in browsers and Node, and getRandomValues also works
// on pages that are not a secure context.
export function uuidV4(): string {
  const bytes = (
    globalThis as unknown as { crypto: { getRandomValues(array: Uint8Array): Uint8Array } }
  ).crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
