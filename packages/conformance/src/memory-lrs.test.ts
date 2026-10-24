import { afterEach, describe, expect, test } from "vitest";
import { startTestLms, type TestLms } from "./test-lms.js";

let lms: TestLms | undefined;
afterEach(async () => {
  await lms?.close();
  lms = undefined;
});

const headers = { "X-Experience-API-Version": "1.0.3", "Content-Type": "application/json" };
const agent = JSON.stringify({ mbox: "mailto:learner@example.org" });
const statement = {
  actor: { mbox: "mailto:learner@example.org" },
  verb: { id: "http://adlnet.gov/expapi/verbs/completed" },
  object: { id: "https://example.org/course" },
};

describe("in-memory LRS (S-5 test subset)", () => {
  test("stores statements by POST and PUT and returns them by id", async () => {
    lms = await startTestLms();
    const posted = await fetch(`${lms.xapiEndpoint}statements`, {
      method: "POST",
      headers,
      body: JSON.stringify([statement, statement]),
    });
    expect(posted.status).toBe(200);
    const ids = (await posted.json()) as string[];
    expect(ids).toHaveLength(2);

    const id = "6f2a3b40-0c1d-4e5f-8a9b-0123456789ab";
    const put = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(statement),
    });
    expect(put.status).toBe(204);
    // The same statement again changes nothing; another one under the same id is a conflict.
    const again = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(statement),
    });
    expect(again.status).toBe(204);
    const other = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...statement, verb: { id: "http://adlnet.gov/expapi/verbs/passed" } }),
    });
    expect(other.status).toBe(409);

    const got = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, { headers });
    expect(await got.json()).toMatchObject({ ...statement, id });
    expect(lms.lrs.statements.map((s) => s.id)).toEqual([...ids, id]);
  });

  test("rejects requests without a version header and invalid statements", async () => {
    lms = await startTestLms();
    const noVersion = await fetch(`${lms.xapiEndpoint}statements`, { method: "POST", body: "{}" });
    expect(noVersion.status).toBe(400);
    const invalid = await fetch(`${lms.xapiEndpoint}statements`, {
      method: "POST",
      headers,
      body: JSON.stringify({ verb: {} }),
    });
    expect(invalid.status).toBe(400);
    expect(lms.lrs.statements).toEqual([]);
  });

  test("[standards:X-7] lists its versions, speaks the version asked for, and refuses others", async () => {
    lms = await startTestLms(undefined, { lrsOptions: { versions: ["1.0.3"] } });
    const about = await fetch(`${lms.xapiEndpoint}about`);
    expect(await about.json()).toEqual({ version: ["1.0.3"] });
    const post = (version: string) =>
      fetch(`${lms?.xapiEndpoint}statements`, {
        method: "POST",
        headers: { ...headers, "X-Experience-API-Version": version },
        body: JSON.stringify(statement),
      });
    const old = await post("1.0.1");
    expect(old.status).toBe(200);
    expect(old.headers.get("X-Experience-API-Version")).toBe("1.0.3");
    expect((await post("2.0.0")).status).toBe(400);
  });

  test("requires the credentials it was given, except for about", async () => {
    lms = await startTestLms(undefined, { lrsOptions: { auth: "Basic c2VjcmV0" } });
    const post = (auth?: string) =>
      fetch(`${lms?.xapiEndpoint}statements`, {
        method: "POST",
        headers: { ...headers, ...(auth && { Authorization: auth }) },
        body: JSON.stringify(statement),
      });
    expect((await post()).status).toBe(401);
    expect((await post("Basic other")).status).toBe(401);
    expect((await post("Basic c2VjcmV0")).status).toBe(200);
    expect((await fetch(`${lms.xapiEndpoint}about`)).status).toBe(200);
    expect(lms.lrs.requests.map((r) => `${r.method} ${r.resource} ${r.status}`)).toEqual([
      "POST statements 401",
      "POST statements 401",
      "POST statements 200",
      "GET about 200",
    ]);
  });

  test("answers cross-origin preflights", async () => {
    lms = await startTestLms();
    const preflight = await fetch(`${lms.xapiEndpoint}statements`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  test("[standards:X-7] refuses a statement that breaks the rules of the version asked for", async () => {
    lms = await startTestLms();
    const post = (version: string, body: unknown) =>
      fetch(`${lms?.xapiEndpoint}statements`, {
        method: "POST",
        headers: { ...headers, "X-Experience-API-Version": version },
        body: JSON.stringify(body),
      });
    const single = {
      ...statement,
      context: { contextActivities: { parent: { id: "https://example.org/course" } } },
    };
    expect((await post("1.0.3", single)).status).toBe(200);
    const refused = await post("2.0.0", single);
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("must be an array");
    expect((await post("1.0.3", { ...statement, timestamp: "yesterday" })).status).toBe(400);
  });

  test("rejects a batch that repeats an id and a PUT whose id differs from statementId", async () => {
    lms = await startTestLms();
    const id = "6f2a3b40-0c1d-4e5f-8a9b-0123456789ab";
    const twice = await fetch(`${lms.xapiEndpoint}statements`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        { ...statement, id },
        { ...statement, id },
      ]),
    });
    expect(twice.status).toBe(400);
    const other = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
    const mismatch = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...statement, id: other }),
    });
    expect(mismatch.status).toBe(400);
    expect(lms.lrs.statements).toEqual([]);
  });

  test("merges only JSON objects into activity state", async () => {
    lms = await startTestLms();
    const params = new URLSearchParams({
      activityId: "https://example.org/course",
      agent,
      stateId: "bookmark",
    });
    const url = `${lms.xapiEndpoint}activities/state?${params}`;
    await fetch(url, { method: "PUT", headers, body: '{"page":1}' });
    expect((await fetch(url, { method: "POST", headers, body: "[1,2]" })).status).toBe(400);
    expect((await fetch(url, { method: "POST", headers, body: "null" })).status).toBe(400);
    expect(await (await fetch(url, { headers })).json()).toEqual({ page: 1 });
  });

  test("stores, merges, lists and deletes activity state", async () => {
    lms = await startTestLms();
    const url = (stateId?: string) => {
      const params = new URLSearchParams({ activityId: "https://example.org/course", agent });
      if (stateId) params.set("stateId", stateId);
      return `${lms?.xapiEndpoint}activities/state?${params}`;
    };
    expect(
      (await fetch(url("bookmark"), { method: "PUT", headers, body: '{"page":1}' })).status,
    ).toBe(204);
    await fetch(url("bookmark"), { method: "POST", headers, body: '{"seen":true}' });
    expect(await (await fetch(url("bookmark"), { headers })).json()).toEqual({
      page: 1,
      seen: true,
    });
    expect(await (await fetch(url(), { headers })).json()).toEqual(["bookmark"]);
    await fetch(url("bookmark"), { method: "DELETE", headers });
    expect((await fetch(url("bookmark"), { headers })).status).toBe(404);
  });
});
