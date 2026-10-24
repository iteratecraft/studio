// What the SCORM 1.2 and SCORM 2004 adapters share (standards.md §3.6 P-3, §3.7 P-20): finding the
// LMS's API object, the error a refused call raises, and the writer that keeps refused writes and
// sends them again before the next commit.

/** The part of a browser window API discovery reads. */
export interface ScormWindow {
  API?: unknown;
  API_1484_11?: unknown;
  parent?: ScormWindow | null;
  opener?: ScormWindow | null;
}

/** How many parent windows discovery climbs from each start window (standards.md P-3). */
export const API_SEARCH_DEPTH = 10;

/**
 * The API object named `name`: on the window or one of its parents, then on the window that opened
 * it or one of that window's parents (standards.md P-3). Undefined when there is none.
 */
export function findApi<T>(
  win: ScormWindow,
  name: "API" | "API_1484_11",
  isApi: (value: unknown) => value is T,
): T | undefined {
  const climb = (start: ScormWindow | null | undefined) => {
    let current = start;
    for (let depth = 0; current && depth <= API_SEARCH_DEPTH; depth++) {
      try {
        const api = current[name];
        if (isApi(api)) return api;
        if (!current.parent || current.parent === current) return undefined;
        current = current.parent;
      } catch {
        // A window from another origin: the API cannot be there or above it.
        return undefined;
      }
    }
    return undefined;
  };
  let opener: ScormWindow | null | undefined;
  try {
    opener = topOf(win).opener;
  } catch {
    opener = undefined;
  }
  return climb(win) ?? climb(opener);
}

function topOf(win: ScormWindow): ScormWindow {
  let current = win;
  for (let depth = 0; depth < API_SEARCH_DEPTH; depth++) {
    const parent = current.parent;
    if (!parent || parent === current) break;
    current = parent;
  }
  return current;
}

/** A SCORM call that the LMS refused. */
export class ScormError extends Error {
  constructor(
    readonly call: string,
    readonly code: string,
    detail: string,
  ) {
    super(`SCORM ${call} failed: ${code}${detail ? ` ${detail}` : ""}`);
    this.name = "ScormError";
  }
}

/** The calls of one SCORM API the writer needs, whatever the edition names them. */
export interface ScormCalls {
  /** The name of the set call, for error messages. */
  setName: string;
  setValue(element: string, value: string): string;
  lastError(): string;
  errorString(code: string): string;
}

/**
 * Writes values. A refused write is kept and sent again by `retry`, and `raise` throws the first
 * refusal since the last `raise`, once the caller's other writes are done (standards.md P-20).
 */
export function scormWriter(calls: ScormCalls) {
  const pending = new Map<string, string>();
  let errors: ScormError[] = [];
  const error = (call: string) => {
    const code = calls.lastError();
    return new ScormError(call, code, calls.errorString(code));
  };
  const set = (element: string, value: string) => {
    if (calls.setValue(element, value) === "true") {
      pending.delete(element);
      return;
    }
    pending.set(element, value);
    errors.push(error(`${calls.setName}(${element})`));
  };
  return {
    error,
    set,
    /** Records a refused call that is not a write. */
    refused(call: string) {
      errors.push(error(call));
    },
    /** Sends every write the LMS refused before again. */
    retry() {
      for (const [element, value] of [...pending]) set(element, value);
    },
    raise() {
      const [first] = errors;
      errors = [];
      if (first) throw first;
    },
    /** Forgets refusals without throwing; the writes stay queued for the next retry. */
    forget() {
      errors = [];
    },
  };
}

/** At most `max` UTF-16 units, never splitting a surrogate pair. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = /[\uD800-\uDBFF]/.test(text[max - 1] ?? "") ? max - 1 : max;
  return text.slice(0, end);
}
