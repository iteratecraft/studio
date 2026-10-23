// An in-memory xAPI LRS for tests (standards.md S-5, test subset): the statements resource and the
// activity state resource. It keeps everything in memory and checks no credentials.
// shortcut: no activity or agent profiles, no statement queries beyond statementId, no voiding,
// no attachments and no auth; the full LRS (S-5) is server work and is tested with T-3.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface StoredDocument {
  contentType: string;
  body: string;
}

export interface MemoryLrs {
  /** Statements in the order they were stored. */
  statements: Record<string, unknown>[];
  /** State documents keyed by `stateKey(...)`. */
  state: Map<string, StoredDocument>;
  /** Serves a request whose path, below the xAPI endpoint, is `resource` (e.g. `statements`). */
  handle(request: IncomingMessage, response: ServerResponse, resource: string): Promise<void>;
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const VERSION = /^(1\.0(\.\d+)?|2\.0(\.\d+)?)$/;

export function stateKey(params: URLSearchParams): string {
  return JSON.stringify(
    ["activityId", "agent", "registration", "stateId"].map((k) => params.get(k)),
  );
}

export function createMemoryLrs(): MemoryLrs {
  const statements: Record<string, unknown>[] = [];
  const state = new Map<string, StoredDocument>();

  async function handle(request: IncomingMessage, response: ServerResponse, resource: string) {
    const url = new URL(request.url ?? "/", "http://lrs");
    const send = (status: number, body?: unknown) => {
      response.statusCode = status;
      response.setHeader("X-Experience-API-Version", "1.0.3");
      if (body === undefined) return void response.end();
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(body));
    };
    if (resource === "about") return send(200, { version: ["1.0.3", "2.0.0"] });
    if (!VERSION.test(String(request.headers["x-experience-api-version"] ?? ""))) {
      return send(400, { error: "X-Experience-API-Version header is missing or unknown" });
    }
    const body = await readBody(request);
    if (body === undefined) return send(413, { error: `body is larger than ${MAX_BODY_BYTES}` });
    const method = request.method ?? "GET";

    if (resource === "statements") {
      const id = url.searchParams.get("statementId");
      if (method === "GET") {
        if (id === null) return send(200, { statements, more: "" });
        const found = statements.find((s) => s.id === id);
        return found ? send(200, found) : send(404);
      }
      if (method !== "PUT" && method !== "POST") return send(405);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return send(400, { error: "body is not JSON" });
      }
      const batch = Array.isArray(parsed) ? parsed : [parsed];
      if (method === "PUT" && (id === null || batch.length !== 1)) {
        return send(400, { error: "PUT takes one statement and a statementId parameter" });
      }
      const accepted: Record<string, unknown>[] = [];
      for (const statement of batch) {
        if (!isStatement(statement))
          return send(400, { error: "statement needs actor, verb, object" });
        const statementId = String(statement.id ?? id ?? randomUUID());
        if (statements.some((s) => s.id === statementId)) {
          return send(409, { error: `statement ${statementId} already exists` });
        }
        accepted.push({ ...statement, id: statementId, stored: new Date().toISOString() });
      }
      statements.push(...accepted);
      return method === "PUT"
        ? send(204)
        : send(
            200,
            accepted.map((s) => s.id),
          );
    }

    if (resource === "activities/state") {
      const params = url.searchParams;
      if (!params.get("activityId") || !params.get("agent")) {
        return send(400, { error: "activityId and agent are required" });
      }
      const key = stateKey(params);
      if (method === "GET") {
        if (params.get("stateId") === null) {
          const prefix = key.slice(0, key.lastIndexOf(","));
          const ids = [...state.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((k) => JSON.parse(k)[3]);
          return send(200, ids);
        }
        const document = state.get(key);
        if (!document) return send(404);
        response.setHeader("Content-Type", document.contentType);
        response.setHeader("X-Experience-API-Version", "1.0.3");
        return void response.end(document.body);
      }
      if (params.get("stateId") === null) return send(400, { error: "stateId is required" });
      if (method === "DELETE") {
        state.delete(key);
        return send(204);
      }
      if (method !== "PUT" && method !== "POST") return send(405);
      const contentType = request.headers["content-type"] ?? "application/octet-stream";
      const previous = state.get(key);
      // POST merges JSON objects into an existing JSON document (xAPI 1.0.3, Part Three 2.2).
      if (method === "POST" && previous && contentType.startsWith("application/json")) {
        try {
          const merged = { ...JSON.parse(previous.body), ...JSON.parse(body) };
          state.set(key, { contentType, body: JSON.stringify(merged) });
          return send(204);
        } catch {
          return send(400, { error: "POST can merge only JSON objects" });
        }
      }
      state.set(key, { contentType, body });
      return send(204);
    }
    return send(404);
  }

  return { statements, state, handle };
}

function isStatement(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "actor" in value &&
    "verb" in value &&
    "object" in value
  );
}

async function readBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
