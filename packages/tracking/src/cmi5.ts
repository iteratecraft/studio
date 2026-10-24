// cmi5 run-time adapter (STD-07, M1-27; standards.md §3.9 C-1..C-9, §4.3, rule 14): an xAPI adapter
// with the cmi5 launch, session and statement rules. It reads the launch link, trades the one-time
// fetch URL for its LRS credentials, reads the launch data the LMS stored, and reports the session
// with the cmi5-defined statements initialized, completed, passed or failed, and terminated, with
// what the learner does as cmi5-allowed statements between them. Satisfied is the LMS's to send. It
// talks only to the fetch URL and the LRS the launch link names (rule 16, ADR-0004).
import { activityIri } from "@course-suite/format";
import {
  createLrs,
  globalFetch,
  type Lrs,
  LrsError,
  RequestTimeout,
  type StateParams,
  timedRequest,
} from "./lrs.js";
import type { Clock, Launch, Mode, QuestionRef, Status, TrackingAdapter } from "./tracker.js";
import { systemClock } from "./tracker.js";
import {
  type Activity,
  type Agent,
  activitiesOf,
  interactionActivity,
  isoDuration,
  NOT_ATTEMPTED,
  type Progress,
  readProgress,
  response,
  score,
  toAgent,
  UUID,
  uuidV4,
  XAPI_ACTIVITY_TYPES,
  XAPI_STATE_ID,
  XAPI_VERBS,
  type XapiAdapterOptions,
} from "./xapi.js";

/** The cmi5-defined verbs an AU sends (cmi5 §9.3). */
export const CMI5_VERBS = {
  initialized: "http://adlnet.gov/expapi/verbs/initialized",
  completed: XAPI_VERBS.completed,
  passed: XAPI_VERBS.passed,
  failed: XAPI_VERBS.failed,
  terminated: "http://adlnet.gov/expapi/verbs/terminated",
} as const;
export type Cmi5Verb = keyof typeof CMI5_VERBS;

/** Context categories and extensions of cmi5 statements (cmi5 §9.5.5, §9.6). */
export const CMI5_IRIS = {
  category: "https://w3id.org/xapi/cmi5/context/categories/cmi5",
  moveOnCategory: "https://w3id.org/xapi/cmi5/context/categories/moveon",
  progress: "https://w3id.org/xapi/cmi5/result/extensions/progress",
  masteryScore: "https://w3id.org/xapi/cmi5/context/extensions/masteryscore",
  sessionId: "https://w3id.org/xapi/cmi5/context/extensions/sessionid",
} as const;

/** The state document the LMS writes before each launch (cmi5 §10). */
export const CMI5_LAUNCH_DATA = "LMS.LaunchData";
/** The agent profile document with the learner's preferences (cmi5 §11). */
export const CMI5_PREFERENCES = "cmi5LearnerPreferences";

/** What the LMS waits for before it counts the AU as done (cmi5 §13.1.4). */
export const MOVE_ON = [
  "Passed",
  "Completed",
  "CompletedAndPassed",
  "CompletedOrPassed",
  "NotApplicable",
] as const;
export type MoveOn = (typeof MOVE_ON)[number];

/** The cmi5 launch-link parameters (cmi5 §8.1). */
export interface Cmi5Launch {
  /** Ends in `/`. */
  endpoint: string;
  /** The one-time URL that hands out the LRS credentials. */
  fetch: string;
  actor: Agent;
  registration: string;
  /** The AU's activity id for this LMS, the object of every cmi5-defined statement. */
  activityId: string;
}

const HTTP = /^https?:\/\/[^/]/i;
const IRI = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;

/**
 * The launch-link parameters `endpoint`, `fetch`, `actor`, `registration` and `activityId`
 * (standards.md C-1). Without any of them reporting is off: the reason is returned.
 */
export function readCmi5Launch(params: {
  get(name: string): string | null;
}): Cmi5Launch | { error: string } {
  const endpoint = params.get("endpoint") ?? "";
  const fetch = params.get("fetch") ?? "";
  const registration = params.get("registration") ?? "";
  const activityId = params.get("activityId") ?? "";
  if (!HTTP.test(endpoint))
    return { error: "The launch link names no http or https LRS endpoint." };
  if (!HTTP.test(fetch)) return { error: "The launch link names no http or https fetch URL." };
  const actor = toAgent(params.get("actor"));
  if (!actor) return { error: "The launch link names no valid learner (actor)." };
  if (!UUID.test(registration)) return { error: "The launch link's registration is not a UUID." };
  if (!IRI.test(activityId)) return { error: "The launch link's activityId is not an IRI." };
  return {
    endpoint: endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
    fetch,
    actor,
    registration,
    activityId,
  };
}

/** What the adapter uses from LMS.LaunchData (cmi5 §10.2). */
interface LaunchData {
  contextTemplate: Record<string, unknown>;
  mode: Mode;
  moveOn?: MoveOn;
  /** Scaled, 0 to 1. */
  masteryScore?: number;
  returnURL?: string;
}

/** What the AU's own state document holds: the xAPI progress and what it reported for good (C-2). */
interface Cmi5Progress extends Progress {
  /** cmi5-defined verbs sent once per registration (cmi5 §9.3). */
  committed?: { completed?: boolean; passed?: boolean };
}

export interface Cmi5AdapterOptions extends Omit<XapiAdapterOptions, "launch"> {
  launch: Cmi5Launch;
}

export interface Cmi5Adapter extends TrackingAdapter {
  /** Where the LMS wants the learner after the session (launch data returnURL), once initialized. */
  readonly returnUrl: string | undefined;
}

type Result = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The cmi5 adapter. `initialize` throws when the fetch URL gives no credentials or the launch data
 * cannot be read, so a session reports nothing rather than something an LMS would refuse.
 */
export function createCmi5Adapter(options: Cmi5AdapterOptions): Cmi5Adapter {
  const { launch, course } = options;
  const clock: Clock = options.clock ?? systemClock;
  const uuid = options.uuid ?? uuidV4;
  const transport = options.transport ?? globalFetch;
  const language = course.sourceLanguage ?? course.labelSet?.language ?? "en";
  const activities = activitiesOf(course, language);
  const agent = JSON.stringify(launch.actor);
  const stateParams = (stateId: string): StateParams => ({
    activityId: launch.activityId,
    agent,
    registration: launch.registration,
    stateId,
  });
  const progress: Cmi5Progress = {};
  /** cmi5-defined verbs sent in this session. */
  const sent = new Set<Cmi5Verb>();
  const opened = new Map<string, number>();
  let lrs: Lrs | undefined;
  let data: LaunchData | undefined;
  let earlierMs = 0;
  let startedAt = 0;
  let lastStamp = 0;
  let stored: string | undefined;
  /** A failed result waits for the end of the session, so a pass after a retry can still be sent. */
  let failed: { result: Result; mastery: boolean } | undefined;

  const totalMs = () => earlierMs + clock.now() - startedAt;

  /** Timestamps never repeat, so an LMS that orders statements by them sees the order sent (cmi5 §9.3). */
  function timestamp() {
    lastStamp = Math.max(clock.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  }

  /** The 0-100 progress extension; never on or after completed (cmi5 §9.5.5.1, standards.md C-7). */
  function withProgress(result: Result = {}): Result | undefined {
    const share = progress.status?.progress;
    if (share === undefined || progress.committed?.completed) {
      return Object.keys(result).length > 0 ? result : undefined;
    }
    return { ...result, extensions: { [CMI5_IRIS.progress]: Math.round(share * 100) } };
  }

  /**
   * One statement with the launch data's context template, which nothing here overwrites (cmi5
   * §10.2.1). cmi5-defined statements carry the cmi5 category, and the moveOn category when they
   * report success or completion; allowed ones name the AU as their parent instead (§7.1.3, §9.6.2).
   */
  function send(
    verb: { id: string; name: string },
    object: Activity | { id: string },
    result: Result | undefined,
    defined: { mastery?: boolean } | undefined,
  ) {
    if (!lrs || !data) return;
    const template = data.contextTemplate;
    const given = isObject(template.contextActivities) ? template.contextActivities : {};
    const ours: Record<string, { id: string }[]> = defined
      ? {
          category: [
            { id: CMI5_IRIS.category },
            ...(result && ("success" in result || "completion" in result)
              ? [{ id: CMI5_IRIS.moveOnCategory }]
              : []),
          ],
        }
      : { parent: [{ id: launch.activityId }] };
    const contextActivities: Record<string, unknown[]> = {};
    for (const kind of ["parent", "grouping", "category", "other"]) {
      const list = given[kind];
      const all = [...(Array.isArray(list) ? list : list ? [list] : []), ...(ours[kind] ?? [])];
      if (all.length > 0) contextActivities[kind] = all;
    }
    const extensions = {
      ...(defined?.mastery && { [CMI5_IRIS.masteryScore]: data.masteryScore }),
      ...(isObject(template.extensions) ? template.extensions : {}),
    };
    lrs.send({
      id: uuid(),
      actor: launch.actor,
      verb: { id: verb.id, display: { "en-US": verb.name } },
      object: { objectType: "Activity", ...object },
      ...(result && { result }),
      context: {
        registration: launch.registration,
        language,
        ...template,
        ...(Object.keys(contextActivities).length > 0 && { contextActivities }),
        ...(Object.keys(extensions).length > 0 && { extensions }),
      },
      timestamp: timestamp(),
    });
  }

  /**
   * A cmi5-defined statement about the AU, or false when the rules refuse it (standards.md C-3, C-6,
   * rule 14): each verb once per session; never passed and failed together; completed and passed once
   * per registration and failed never after passed; outside Normal mode only initialized and
   * terminated; nothing after terminated.
   */
  function sendDefined(verb: Cmi5Verb, result?: Result, mastery = false): boolean {
    const committed = progress.committed ?? {};
    const judged = verb === "passed" || verb === "failed";
    if (
      !data ||
      sent.has(verb) ||
      sent.has("terminated") ||
      (judged && (sent.has("passed") || sent.has("failed") || committed.passed)) ||
      (verb === "completed" && committed.completed) ||
      (verb !== "initialized" && verb !== "terminated" && data.mode !== "normal")
    ) {
      return false;
    }
    send({ id: CMI5_VERBS[verb], name: verb }, { id: launch.activityId }, result, { mastery });
    sent.add(verb);
    if (verb === "completed" || verb === "passed") {
      progress.committed = { ...committed, [verb]: true };
    }
    return true;
  }

  /** A cmi5-allowed statement, only in Normal mode and only between initialized and terminated. */
  function sendAllowed(
    verb: keyof typeof XAPI_VERBS,
    object: Activity | { id: string },
    result?: Result,
  ) {
    if (data?.mode !== "normal" || !sent.has("initialized") || sent.has("terminated")) return;
    send({ id: XAPI_VERBS[verb], name: verb }, object, withProgress(result), undefined);
  }

  /**
   * Passed or failed: by the launch data's mastery score when there is a score (standards.md C-4),
   * else as the course reported it. A course with nothing to judge passes on completion when the
   * LMS waits for passed, so it can still count the course done.
   */
  function verdict(status: Status): { passed: boolean; mastery: boolean } | undefined {
    const mastery = data?.masteryScore;
    if (status.score && mastery !== undefined) {
      const scaled = score(status.score).scaled;
      return { passed: scaled >= mastery, mastery: true };
    }
    if (status.success !== "unknown")
      return { passed: status.success === "passed", mastery: false };
    const waitsForPassed = data?.moveOn === "Passed" || data?.moveOn === "CompletedAndPassed";
    if (
      status.completion === "completed" &&
      waitsForPassed &&
      course.publish?.tracking?.kind !== "quiz"
    ) {
      return { passed: true, mastery: false };
    }
    return undefined;
  }

  const activity = (...ids: string[]): Activity => ({
    id: activityIri(course, ...ids),
    definition: activities.get(ids.join("/")) ?? { type: XAPI_ACTIVITY_TYPES.module },
  });

  /**
   * POSTs once to the fetch URL for the LRS credentials (cmi5 §8.2), given up like an LRS request
   * after REQUEST_TIMEOUT_MS, so a fetch URL that never answers cannot hold the course on its
   * loading screen.
   */
  async function fetchToken(): Promise<string> {
    let status: number | undefined;
    let body: unknown;
    let timedOut = false;
    try {
      const answer = await timedRequest(transport, clock, launch.fetch, {
        method: "POST",
        headers: {},
      });
      status = answer.status;
      body = JSON.parse(answer.body);
    } catch (error) {
      // No answer, or one that is not JSON: reported below.
      timedOut = error instanceof RequestTimeout;
    }
    const token = isObject(body) ? body["auth-token"] : undefined;
    if (status === 200 && typeof token === "string" && token !== "") return token;
    const reason = isObject(body) && body["error-text"] ? body["error-text"] : status;
    throw new LrsError(
      status,
      `The LMS gave no session credentials: ${reason ?? (timedOut ? "no answer in time" : "no answer")}`,
    );
  }

  return {
    get returnUrl() {
      return data?.returnURL;
    },

    async initialize(): Promise<Launch> {
      const token = await fetchToken();
      lrs = createLrs({
        endpoint: launch.endpoint,
        auth: `Basic ${token}`,
        clock,
        transport,
        ...(options.onConnection && { onConnection: options.onConnection }),
        ...(options.onError && { onError: options.onError }),
      });
      await lrs.connect();
      const launchData = readLaunchData(await lrs.getState(stateParams(CMI5_LAUNCH_DATA)));
      // shortcut: preferences are read as cmi5 §11 asks and not applied; a course has one language
      // and no audio setting yet. Apply them with multi-language output (UI-PUBCOLLAB-R14).
      await lrs.getAgentProfile({ agent, profileId: CMI5_PREFERENCES }).catch(() => undefined);
      const text = await lrs.getState(stateParams(XAPI_STATE_ID));
      Object.assign(progress, readCmi5Progress(text));
      stored = text;
      data = launchData;
      earlierMs = progress.totalTimeMs ?? 0;
      startedAt = clock.now();
      progress.language = language;
      sendDefined("initialized");
      sendAllowed("attempted", { id: launch.activityId });
      const result: Launch = { mode: launchData.mode, status: progress.status ?? NOT_ATTEMPTED };
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
      if (data?.mode !== "normal" || sent.has("terminated")) return false;
      progress.status = status;
      const duration = isoDuration(totalMs());
      // Completed before passed or failed (standards.md C-5).
      if (status.completion === "completed")
        sendDefined("completed", { completion: true, duration });
      const judged = verdict(status);
      if (judged) {
        const result: Result = {
          ...(status.score && { score: score(status.score) }),
          success: judged.passed,
          duration,
        };
        if (!judged.passed) failed = { result, mastery: judged.mastery };
        else if (sendDefined("passed", withProgress(result), judged.mastery)) failed = undefined;
      }
      return true;
    },

    reportInteraction(interaction, question?: QuestionRef) {
      if (!question) return;
      sendAllowed(
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
      sendAllowed("experienced", activity(page));
    },

    reportLeft(page) {
      const since = opened.get(page);
      opened.delete(page);
      sendAllowed(
        "left",
        activity(page),
        since === undefined ? undefined : { duration: isoDuration(clock.now() - since) },
      );
    },

    writeSessionTime(ms) {
      progress.totalTimeMs = earlierMs + ms;
    },

    setExit() {
      // cmi5 has no exit value: terminated ends the session.
    },

    commit() {
      const body = JSON.stringify(progress);
      if (!lrs || data?.mode !== "normal" || body === stored) return;
      lrs.putState(stateParams(XAPI_STATE_ID), body);
      stored = body;
    },

    terminate() {
      if (!lrs || sent.has("terminated")) return;
      if (failed) sendDefined("failed", withProgress(failed.result), failed.mastery);
      // The time since initialized (standards.md C-8, cmi5 §9.5.4.1).
      sendDefined("terminated", withProgress({ duration: isoDuration(clock.now() - startedAt) }));
      lrs.close();
    },
  };
}

/** LMS.LaunchData, which must exist and carry a context template and a launch mode (cmi5 §10). */
function readLaunchData(text: string | undefined): LaunchData {
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "");
  } catch {
    // Reported below.
  }
  if (!isObject(raw) || !isObject(raw.contextTemplate)) {
    throw new Error(
      `The LMS launch data (${CMI5_LAUNCH_DATA}) is missing or has no context template.`,
    );
  }
  const mode: Mode | undefined =
    raw.launchMode === "Normal"
      ? "normal"
      : raw.launchMode === "Browse"
        ? "browse"
        : raw.launchMode === "Review"
          ? "review"
          : undefined;
  if (!mode) throw new Error(`The LMS launch data has no valid launchMode.`);
  const data: LaunchData = { contextTemplate: raw.contextTemplate, mode };
  if ((MOVE_ON as readonly unknown[]).includes(raw.moveOn)) data.moveOn = raw.moveOn as MoveOn;
  const mastery = raw.masteryScore;
  if (typeof mastery === "number" && mastery >= 0 && mastery <= 1) data.masteryScore = mastery;
  if (typeof raw.returnURL === "string" && raw.returnURL !== "") data.returnURL = raw.returnURL;
  return data;
}

function readCmi5Progress(text: string | undefined): Cmi5Progress {
  const progress: Cmi5Progress = readProgress(text);
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "");
  } catch {
    return progress;
  }
  const committed = isObject(raw) ? raw.committed : undefined;
  if (isObject(committed)) {
    progress.committed = {
      ...(committed.completed === true && { completed: true }),
      ...(committed.passed === true && { passed: true }),
    };
  }
  return progress;
}
