// The CATAPULT CTS that up.ts starts (M2-21), through its REST API (cts/service/plugins/routes/v1 in
// CATAPULT): import a course, start a conformance test, launch an AU, and read the result and the
// report the CTS's own "Download" button gives (cts/client/src/store/service/tests.js).
import { expect } from "@playwright/test";
import type { Lrs } from "../lrs/lrs.js";
import { CATAPULT_URL, CTS_USER } from "./site.ts";

/** The player's SQL LRS, as compose.yaml publishes it, with the credentials it gives the player. */
export const CATAPULT_LRS: Lrs = {
  name: "CATAPULT's LRS",
  endpoint: `http://localhost:${process.env.CATAPULT_LRS_PORT ?? "8281"}/xapi/`,
  auth: `Basic ${Buffer.from("coursesuite:coursesuite-secret").toString("base64")}`,
  // compose.yaml's LRS_XAPI_VERSION: the version the player and the CTS speak to it.
  version: "1.0.3",
};

const AUTH = `Basic ${Buffer.from(`${CTS_USER.username}:${CTS_USER.password}`).toString("base64")}`;

async function api<T>(method: string, path: string, body?: Uint8Array | object): Promise<T> {
  const binary = body instanceof Uint8Array;
  const response = await fetch(`${CATAPULT_URL}/api/v1/${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      ...(body && { "Content-Type": binary ? "application/zip" : "application/json" }),
    },
    ...(body && {
      body: binary ? new Blob([body as Uint8Array<ArrayBuffer>]) : JSON.stringify(body),
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** The CTS's course id for a cmi5 package it imported. */
export const importCourse = (zip: Uint8Array) => api<{ id: number }>("POST", "courses", zip);

/** A conformance test (a registration) of the course, for a new learner. */
export const startTest = (courseId: number) =>
  api<{ id: number; code: string }>("POST", "tests", {
    courseId,
    actor: {
      objectType: "Agent",
      name: "Test Learner",
      account: { homePage: "https://learner.example.org", name: `learner-${Date.now()}` },
    },
  });

/**
 * Launches the test's AU in Normal mode, a new session of the test's registration each time; the
 * launch URL opens it the way the CTS's frame does.
 */
export const launchAu = (testId: number, auIndex = 0) =>
  api<{ id: number; launchUrl: string }>("POST", "sessions", { testId, auIndex });

/** The registration a launch URL gives the AU (cmi5 section 8.1): the one its statements carry. */
export function registrationOf(launchUrl: string): string {
  const registration = new URL(launchUrl).searchParams.get("registration");
  if (!registration) throw new Error(`No registration in the launch URL ${launchUrl}`);
  return registration;
}

export interface Log {
  id: number;
  metadata: { summary?: string; resource?: string; sessionId?: number; violatedReqId?: string };
}

export interface Session {
  id: number;
  metadata: { violatedReqIds: string[] };
}

export interface Test {
  id: number;
  code: string;
  metadata: {
    /** "conformant", "non-conformant", "pending" or "not-started". */
    result: string;
    aus: { result: string; isSatisfied?: boolean }[];
  };
}

export const sessionOf = (id: number) => api<Session>("GET", `sessions/${id}`);
export const sessionLogs = (id: number) => api<Log[]>("GET", `sessions/${id}/logs`);
export const testOf = (id: number) => api<Test>("GET", `tests/${id}`);

/** What the CTS logged for a session, oldest first: "Statement recorded: <verb>" and so on. */
export const summaries = async (sessionId: number) =>
  (await sessionLogs(sessionId)).sort((a, b) => a.id - b.id).map((log) => log.metadata.summary);

/**
 * The session's log once the CTS has recorded `verb` (by its last path segment, such as
 * "terminated"): the AU sends its last statements while its page unloads. After 30 seconds, the log
 * as it is, so the test still saves the report before it fails.
 */
export async function loggedUntil(
  sessionId: number,
  verb: string,
): Promise<(string | undefined)[]> {
  let latest: (string | undefined)[] = [];
  await expect
    .poll(
      async () => {
        latest = await summaries(sessionId);
        return latest.some((summary) => summary?.endsWith(`/${verb}`));
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toBe(true)
    .catch(() => undefined);
  return latest;
}

/** The test's report, in the shape of the JSON file the CTS's "Download" button saves. */
export async function report(testId: number) {
  const test = await testOf(testId);
  const logs = (await api<Log[]>("GET", `tests/${testId}/logs`)).sort((a, b) => a.id - b.id);
  return {
    id: testId,
    code: test.code,
    dateCreated: new Date().toJSON(),
    metadata: test.metadata,
    logs: await Promise.all(
      logs.map(async (log) =>
        log.metadata.resource === "sessions:create" && log.metadata.sessionId !== undefined
          ? {
              ...log,
              session: {
                metadata: (await sessionOf(log.metadata.sessionId)).metadata,
                logs: (await sessionLogs(log.metadata.sessionId)).sort((a, b) => a.id - b.id),
              },
            }
          : log,
      ),
    ),
  };
}
