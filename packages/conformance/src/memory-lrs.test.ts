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
    const again = await fetch(`${lms.xapiEndpoint}statements?statementId=${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(statement),
    });
    expect(again.status).toBe(409);

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
