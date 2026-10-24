// An in-memory xAPI LRS for tests (standards.md S-5, test subset): the about, statements and
// activity state resources, for xAPI 1.0.3 and 2.0. It checks every statement against the rules of
// the version the request names (xapi-statement.ts), can require one Authorization value, answers
// cross-origin requests (a course opened from disk or another host), and logs every request.
// shortcut: no activity or agent profiles, no statement queries beyond statementId, no voiding and
// no attachments; the full LRS (S-5) is server work and is tested with T-3.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { statementProblems, type XapiVersion } from "./xapi-statement.js";

export interface StoredDocument {
  contentType: string;
  body: string;
}

export interface MemoryLrsOptions {
  /** Versions the about resource lists and requests may name. Default 1.0.3 and 2.0.0. */
  versions?: string[];
  /** When set, every request but `about` must carry this Authorization header. */
  auth?: string;
}

export interface LrsRequest {
  method: string;
  /** Resource below the endpoint, such as `statements` or `activities/state`. */
  resource: string;
  status: number;
}

export interface MemoryLrs {
  /** Statements in the order they were stored. */
  statements: Record<string, unknown>[];
  /** State documents keyed by `stateKey(...)`. */
  state: Map<string, StoredDocument>;
  /** Every request, in the order they were answered. */
  requests: LrsRequest[];
  /** Requests received and not answered yet. */
  readonly pending: number;
  /** Serves a request whose path, below the xAPI endpoint, is `resource` (e.g. `statements`). */
  handle(request: IncomingMessage, response: ServerResponse, resource: string): Promise<void>;
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;
/** `1.0` or `2.0` from a version such as `1.0.3`. */
const family = (version: string) =>
  /^(1\.0|2\.0)(\.\d+)?$/.exec(version)?.[1] as XapiVersion | undefined;

export function stateKey(params: URLSearchParams): string {
  return JSON.stringify(
    ["activityId", "agent", "registration", "stateId"].map((k) => params.get(k)),
  );
}

export function createMemoryLrs(options: MemoryLrsOptions = {}): MemoryLrs {
  const versions = options.versions ?? ["1.0.3", "2.0.0"];
  const statements: Record<string, unknown>[] = [];
  const state = new Map<string, StoredDocument>();
  const requests: LrsRequest[] = [];
  let pending = 0;

  async function handle(request: IncomingMessage, response: ServerResponse, resource: string) {
    pending++;
    try {
      await serve(request, response, resource);
    } finally {
      pending--;
      requests.push({ method: request.method ?? "GET", resource, status: response.statusCode });
    }
  }

  async function serve(request: IncomingMessage, response: ServerResponse, resource: string) {
    const url = new URL(request.url ?? "/", "http://lrs");
    const asked = family(String(request.headers["x-experience-api-version"] ?? ""));
    const spoken = versions.find((v) => family(v) === asked);
    // Any origin may call, as a course opened from disk or another host does.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Expose-Headers", "X-Experience-API-Version");
    const send = (status: number, body?: unknown) => {
      response.statusCode = status;
      response.setHeader("X-Experience-API-Version", spoken ?? versions[0] ?? "1.0.3");
      if (body === undefined) return void response.end();
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(body));
    };
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Experience-API-Version",
      );
      return send(204);
    }
    if (resource === "about") return send(200, { version: versions });
    if (!asked || !spoken) {
      return send(400, { error: "X-Experience-API-Version header is missing or not supported" });
    }
    if (options.auth !== undefined && request.headers.authorization !== options.auth) {
      return send(401, { error: "unknown credentials" });
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
        const problems = statementProblems(statement, asked);
        if (problems.length > 0) return send(400, { error: problems.join("; ") });
        if (method === "PUT" && statement.id !== undefined && statement.id !== id) {
          return send(400, { error: "statement id differs from the statementId parameter" });
        }
        const statementId = String(statement.id ?? id ?? randomUUID());
        if (accepted.some((s) => s.id === statementId)) {
          return send(400, { error: `statement ${statementId} appears twice in the batch` });
        }
        // The same statement again is a no-op; another one under a stored id is a conflict (xAPI
        // 1.0.3 Part Three 2.1). Statements are compared as sent: our client resends them unchanged.
        const existing = statements.find((s) => s.id === statementId);
        if (existing) {
          const { stored: _, ...sent } = existing;
          if (JSON.stringify(sent) === JSON.stringify({ ...statement, id: statementId })) continue;
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
        const before = parseObject(previous.body);
        const update = parseObject(body);
        if (!before || !update) return send(400, { error: "POST can merge only JSON objects" });
        state.set(key, { contentType, body: JSON.stringify({ ...before, ...update }) });
        return send(204);
      }
      state.set(key, { contentType, body });
      return send(204);
    }
    return send(404);
  }

  return {
    statements,
    state,
    requests,
    get pending() {
      return pending;
    },
    handle,
  };
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

/** The JSON object in `text`, or undefined when it is not JSON or not an object. */
function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
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
