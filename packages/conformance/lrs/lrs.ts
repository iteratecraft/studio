// The SQL LRS instances compose.yaml starts (M2-21), for the tests: their xAPI endpoints, the
// credentials a launch link gives the course, and the statements they stored.
import { activityIdOf } from "@course-suite/format";
import { expect } from "@playwright/test";
import { TEST_LAUNCH } from "../src/run-xapi.js";
import { compost } from "../test/compost.js";

export interface Lrs {
  name: string;
  /** Ends in `/`. */
  endpoint: string;
  /** The `auth` launch-link parameter: the LRS's API key and secret (compose.yaml). */
  auth: string;
  /** The xAPI version the tests read with. */
  version: string;
}

const auth = `Basic ${Buffer.from("coursesuite:coursesuite-secret").toString("base64")}`;

/** Speaks xAPI 2.0 and 1.0.3, as SQL LRS does by default. */
export const LRS_20: Lrs = {
  name: "xAPI 2.0",
  endpoint: `http://localhost:${process.env.LRS_PORT ?? "8270"}/xapi/`,
  auth,
  version: "2.0.0",
};

/** Held to xAPI 1.0.3 (LRSQL_SUPPORTED_VERSIONS). */
export const LRS_103: Lrs = {
  name: "xAPI 1.0.3",
  endpoint: `http://localhost:${process.env.LRS103_PORT ?? "8271"}/xapi/`,
  auth,
  version: "1.0.3",
};

export type Statement = {
  id: string;
  verb: { id: string };
  object: { id: string };
  result?: Record<string, unknown>;
  context?: { registration?: string } & Record<string, unknown>;
};

async function get(lrs: Lrs, url: string): Promise<{ statements: Statement[]; more?: string }> {
  const response = await fetch(url, {
    headers: { Authorization: lrs.auth, "X-Experience-API-Version": lrs.version },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`);
  return (await response.json()) as { statements: Statement[]; more?: string };
}

/** Every statement the LRS stored for `registration`, oldest first, across its pages. */
export async function statementsOf(lrs: Lrs, registration: string): Promise<Statement[]> {
  const query = new URLSearchParams({ registration, ascending: "true" });
  let page = await get(lrs, `${lrs.endpoint}statements?${query}`);
  const all = [...page.statements];
  // `more` is a path on the LRS's host (xAPI 2.1.3).
  while (page.more) {
    page = await get(lrs, new URL(page.more, lrs.endpoint).href);
    all.push(...page.statements);
  }
  return all;
}

/**
 * Once the course's state document for `registration` (the test learner, the compost course) is in
 * the LRS and stays the same between two reads: it is written after the statements.
 */
export async function settledState(lrs: Lrs, registration: string): Promise<void> {
  const query = new URLSearchParams({
    activityId: activityIdOf(compost("xapi")),
    agent: JSON.stringify(TEST_LAUNCH.actor),
    registration,
    // The player's own state id (packages/tracking, XAPI_STATE_ID).
    stateId: "course-state",
  });
  const read = async () => {
    const response = await fetch(`${lrs.endpoint}activities/state?${query}`, {
      headers: { Authorization: lrs.auth, "X-Experience-API-Version": lrs.version },
    });
    return response.ok ? await response.text() : undefined;
  };
  let previous: string | undefined;
  await expect
    .poll(
      async () => {
        const latest = await read();
        const same = latest !== undefined && latest === previous;
        previous = latest;
        return same;
      },
      { timeout: 20_000, intervals: [1_000] },
    )
    .toBe(true);
}

/**
 * The statements for `registration` once the LRS has stored `expected` of them and no more arrive:
 * the course sends its last ones while its page unloads. After 20 seconds, whatever it holds, so
 * the caller's comparison shows what is missing.
 */
export async function settledStatements(
  lrs: Lrs,
  registration: string,
  expected: number,
): Promise<Statement[]> {
  let latest: Statement[] = [];
  let previous = -1;
  await expect
    .poll(
      async () => {
        previous = latest.length;
        latest = await statementsOf(lrs, registration);
        return latest.length >= expected && latest.length === previous;
      },
      { timeout: 20_000, intervals: [1_000] },
    )
    .toBe(true)
    .catch(() => undefined);
  return latest;
}
