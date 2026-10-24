// LRS client shared by the xAPI adapter and, next, the cmi5 adapter (STD-06; standards.md X-5,
// X-7, rule 16, ADR-0004): it talks only to the endpoint it is given. Statements go out in the order
// they were sent, one request at a time; state documents are written after them, the latest version
// of each. A failed request is retried after 100, 400, 400, 600 and 600 ms, then every 5 seconds
// while the client reports itself offline, until it goes through.
import type { Clock } from "./tracker.js";

/** What the client needs from `fetch`; tests pass their own. */
export interface HttpRequest {
  method: "GET" | "PUT" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** The request outlives the page (`fetch` keepalive), for the last writes of a closing course. */
  keepalive?: boolean;
}
export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}
export type Transport = (url: string, request: HttpRequest) => Promise<HttpResponse>;

/** Waits before each retry of a failed request (standards.md X-5). */
export const RETRY_DELAYS_MS = [100, 400, 400, 600, 600] as const;
/** Wait between retries once the client is offline. */
export const OFFLINE_RETRY_MS = 5_000;
/** Statements kept while the LRS cannot be reached; later ones are dropped with an error. */
export const MAX_QUEUED_STATEMENTS = 1_000;
/** Statements per request. */
const BATCH = 50;

/** The xAPI version the client speaks when the LRS does not say it supports 2.0. */
export const XAPI_VERSION = "1.0.3";

/** A request the LRS refused, or one that failed every retry. */
export class LrsError extends Error {
  constructor(
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "LrsError";
  }
}

export interface LrsOptions {
  /** The LRS endpoint, ending in `/`. */
  endpoint: string;
  /** The `Authorization` header value, such as `Basic ...`. */
  auth: string;
  clock: Clock;
  transport?: Transport;
  /** Called with false once the fast retries have failed, and with true when a request goes through again. */
  onConnection?: (online: boolean) => void;
  /** Called when the LRS refuses a request for good, or a statement is dropped. Default: the console. */
  onError?: (error: unknown) => void;
}

export interface Lrs {
  /** The version the client speaks: 1.0.3, or 2.0.0 once `connect` found the LRS supports it. */
  readonly version: string;
  /** Asks the LRS which xAPI versions it supports (standards.md X-7). Never fails. */
  connect(): Promise<void>;
  /** A state document, or undefined when there is none. Retried like a send; throws `LrsError`. */
  getState(params: StateParams): Promise<string | undefined>;
  /** Queues a statement; it is sent after every statement queued before it. */
  send(statement: object): void;
  /** Queues a state document; a later write of the same document replaces a pending one. */
  putState(params: StateParams, body: string): void;
  /** Sends everything still queued at once, with keepalive, for a page that is going away. */
  close(): void;
}

/** Query parameters of the state resource: activityId, agent (JSON), registration, stateId. */
export type StateParams = Record<string, string>;

// No DOM typings in this package; fetch is global in browsers and Node.
const globalFetch: Transport = (url, request) =>
  (globalThis as unknown as { fetch: Transport }).fetch(url, {
    ...request,
    cache: "no-store",
  } as HttpRequest);

const logError = (error: unknown) =>
  (globalThis as { console?: { error(error: unknown): void } }).console?.error(error);

const query = (params: StateParams) =>
  Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

type Outcome = "sent" | "retry" | "refused";

export function createLrs(options: LrsOptions): Lrs {
  const { endpoint, clock } = options;
  const transport = options.transport ?? globalFetch;
  const onError = options.onError ?? logError;
  let version: string = XAPI_VERSION;
  const statements: object[] = [];
  const states = new Map<string, string>();
  let busy = false;
  let failures = 0;
  let offline = false;
  let closed = false;
  let full = false;
  let timer: unknown;
  /** Statements in the batch on its way or waiting for a retry; a retry sends the same batch. */
  let batchSize = 0;

  const headers = (body: boolean): Record<string, string> => ({
    "X-Experience-API-Version": version,
    Authorization: options.auth,
    ...(body && { "Content-Type": "application/json" }),
  });

  /** One request: sent, worth retrying (no answer, 408, 429, 5xx) or refused for good. */
  async function request(path: string, init: HttpRequest): Promise<[Outcome, HttpResponse?]> {
    let response: HttpResponse;
    try {
      response = await transport(endpoint + path, init);
    } catch {
      return ["retry"];
    }
    const { status } = response;
    if (status < 300) return ["sent", response];
    if (status === 408 || status === 429 || status >= 500) return ["retry", response];
    return ["refused", response];
  }

  const wait = (failed: number) =>
    new Promise<void>((resolve) => {
      timer = clock.setTimeout(resolve, RETRY_DELAYS_MS[failed - 1] ?? OFFLINE_RETRY_MS);
    });

  function online(isOnline: boolean) {
    if (offline === !isOnline) return;
    offline = !isOnline;
    options.onConnection?.(isOnline);
  }

  /** Sends the next queued request, then the one after, until the queue is empty. */
  function pump() {
    if (busy || closed) return;
    const next = nextRequest();
    if (!next) return;
    const [path, init, done] = next;
    busy = true;
    void request(path, init).then(async ([outcome, response]) => {
      if (closed) return;
      if (outcome === "retry") {
        failures++;
        if (failures > RETRY_DELAYS_MS.length) online(false);
        // Still busy while waiting, so a new statement does not cut the wait short.
        await wait(failures);
        busy = false;
        return pump();
      }
      busy = false;
      failures = 0;
      online(true);
      // A statement the LRS already holds (409) was sent before; the ids keep it from repeating.
      if (outcome === "refused" && !(path === "statements" && response?.status === 409)) {
        onError(
          new LrsError(
            response?.status,
            `The LRS refused ${init.method} ${path}: ${response?.status}`,
          ),
        );
      }
      done();
      pump();
    });
  }

  function nextRequest(): [string, HttpRequest, () => void] | undefined {
    if (statements.length > 0) {
      // The same batch again after a failure: had the first try reached the LRS, a larger batch
      // would come back 409 and take the new statements with it.
      const batch = statements.slice(0, batchSize || BATCH);
      batchSize = batch.length;
      return [
        "statements",
        { method: "POST", headers: headers(true), body: JSON.stringify(batch) },
        () => {
          statements.splice(0, batch.length);
          batchSize = 0;
        },
      ];
    }
    const first = states.entries().next();
    if (first.done) return undefined;
    const [params, body] = first.value;
    return [
      `activities/state?${params}`,
      { method: "PUT", headers: headers(true), body },
      () => {
        // A newer version written while this one was on its way is still to send.
        if (states.get(params) === body) states.delete(params);
      },
    ];
  }

  return {
    get version() {
      return version;
    },

    async connect() {
      const [outcome, response] = await request("about", { method: "GET", headers: {} });
      if (outcome !== "sent" || !response) return;
      try {
        const about = JSON.parse(await response.text()) as { version?: unknown };
        if (
          Array.isArray(about.version) &&
          about.version.some((v) => /^2\.0(\.|$)/.test(String(v)))
        ) {
          version = "2.0.0";
        }
      } catch {
        // An unreadable answer: keep 1.0.3, which every 1.0 LRS accepts.
      }
    },

    async getState(params) {
      for (let failed = 0; ; ) {
        const [outcome, response] = await request(`activities/state?${query(params)}`, {
          method: "GET",
          headers: headers(false),
        });
        if (outcome === "sent" && response) return response.text();
        if (response?.status === 404) return undefined;
        if (outcome === "refused" || ++failed > RETRY_DELAYS_MS.length) {
          throw new LrsError(
            response?.status,
            `The LRS state could not be read: ${response?.status ?? "no answer"}`,
          );
        }
        await wait(failed);
      }
    },

    send(statement) {
      if (closed) return;
      if (statements.length >= MAX_QUEUED_STATEMENTS) {
        if (!full)
          onError(
            new LrsError(undefined, "Too many statements are waiting; later ones are dropped."),
          );
        full = true;
        return;
      }
      statements.push(statement);
      pump();
    },

    putState(params, body) {
      if (closed) return;
      states.set(query(params), body);
      pump();
    },

    close() {
      if (closed) return;
      closed = true;
      clock.clearTimeout(timer);
      // A batch still on its way is sent again on its own; the LRS keeps one statement per id.
      for (let i = 0; i < statements.length; ) {
        const size = i === 0 && batchSize > 0 ? batchSize : BATCH;
        const body = JSON.stringify(statements.slice(i, i + size));
        i += size;
        void request("statements", {
          method: "POST",
          headers: headers(true),
          body,
          keepalive: true,
        });
      }
      for (const [params, body] of states) {
        void request(`activities/state?${params}`, {
          method: "PUT",
          headers: headers(true),
          body,
          keepalive: true,
        });
      }
    },
  };
}
