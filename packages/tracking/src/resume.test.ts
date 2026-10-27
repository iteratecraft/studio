import { describe, expect, test } from "vitest";
import {
  checkResume,
  DROP_ORDER,
  decodeResume,
  encodeResume,
  pruneResume,
  RESUME_CAPS,
  type ResumeState,
} from "./index.js";

// Property-style tests run on states from a seeded generator, so a failure is reproducible.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const CHARS = `${LETTERS}0123456789`;
const pick = (random: Random, text: string) => text.charAt(Math.floor(random() * text.length));
const int = (random: Random, max: number) => Math.floor(random() * (max + 1));
const many = <T>(random: Random, max: number, make: () => T) =>
  Array.from({ length: int(random, max) }, make);

function contentId(random: Random): string {
  let id = pick(random, LETTERS);
  for (let i = 0; i < 9; i++) id += pick(random, CHARS);
  return id;
}

/** Any UTF-16 text, including halves of surrogate pairs and control characters. */
const anyText = (random: Random) =>
  many(random, 12, () => pick(random, "ab Z9_-.~\"'\\{}[]%+=é漢\u{1F600}\u0000\u2028")).join("");

/** Mostly content ids; sometimes an id from elsewhere, to exercise the text form. */
const anyId = (random: Random) => (random() < 0.9 ? contentId(random) : anyText(random));

const anyNumber = (random: Random) =>
  [0, int(random, 100), random() * 10_000, -random(), 1e21 * random(), 5e-7][int(random, 5)] ?? 0;

const set = (random: Random, max: number) =>
  [...new Set(many(random, max, () => anyId(random)))].sort();

function record<T>(random: Random, max: number, value: () => T): Record<string, T> | undefined {
  const entries = many(random, max, () => [anyId(random), value()] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** A random state in canonical form: sets sorted, no empty parts. */
function anyState(random: Random, size = 4): ResumeState {
  const state: Record<string, unknown> = {
    location: random() < 0.7 ? anyId(random) : undefined,
    language: random() < 0.3 ? anyText(random) : undefined,
    done: set(random, size * 4),
    visited: record(random, size, () => set(random, size)),
    answers: record(random, size, () => {
      const kind = int(random, 2);
      if (kind === 0) return random() < 0.5 ? anyId(random) : anyText(random);
      if (kind === 1) return set(random, 4);
      return record(random, 4, () => anyId(random)) ?? {};
    }),
    draws: record(random, 2, () => many(random, size, () => anyId(random))),
    attempts: record(random, 2, () => many(random, 3, () => int(random, 100))),
    variables: record(
      random,
      size,
      () => [true, false, anyNumber(random), anyText(random)][int(random, 3)],
    ),
    media: record(random, size, () => anyNumber(random)),
    scroll: record(random, size, () => anyNumber(random)),
  };
  for (const [key, value] of Object.entries(state)) {
    const empty = Array.isArray(value) ? value.length === 0 : value === undefined;
    if (empty) delete state[key];
  }
  return state as ResumeState;
}

const NO_CAP = { packageVersion: "7", cap: Number.POSITIVE_INFINITY };

function encode(state: ResumeState, options = NO_CAP): string {
  const result = encodeResume(state, options);
  if (!result.ok) throw new Error("did not fit");
  return result.payload;
}

// The random-state loops take well under a second alone, but CI runs every package's tests at once
// on a few cores, where this file has taken 15 to 24 s: those blocks get a budget for that.
const LOOPS = 30_000;

describe("round trip", { timeout: LOOPS }, () => {
  test("10,000 random states decode to the same state and package version", () => {
    const random = seeded(1);
    for (let i = 0; i < 10_000; i++) {
      const state = anyState(random);
      const decoded = decodeResume(encode(state));
      expect(decoded, `state ${i}`).toEqual({ status: "ok", state, packageVersion: "7" });
    }
    // About 1.3 s locally but over the 5 s default on the shared Windows CI runner.
  }, 30_000);

  test("payloads use only URL-safe base64 characters after the format version", () => {
    const random = seeded(2);
    for (let i = 0; i < 1_000; i++) {
      expect(encode(anyState(random))).toMatch(/^1\.[A-Za-z0-9_-]*$/);
    }
  });

  test("an empty state round trips", () => {
    expect(decodeResume(encode({}))).toEqual({ status: "ok", state: {}, packageVersion: "7" });
  });

  test("[rise:R22] a video's playback position is kept in the progress data", () => {
    const state = { media: { vid0000001: 83.25 } };
    expect(decodeResume(encode(state))).toMatchObject({ state });
  });
});

describe("canonical form", () => {
  test("the same state gives the same payload whatever the order of keys and sets", () => {
    const a: ResumeState = {
      done: ["bbbbbbbbbb", "aaaaaaaaaa", "bbbbbbbbbb"],
      variables: { vvvvvvvvv1: 1, vvvvvvvvv0: "x" },
      visited: { scene00001: ["s2s2s2s2s2", "s1s1s1s1s1"] },
    };
    const b: ResumeState = {
      visited: { scene00001: ["s1s1s1s1s1", "s2s2s2s2s2"] },
      variables: { vvvvvvvvv0: "x", vvvvvvvvv1: 1 },
      done: ["aaaaaaaaaa", "bbbbbbbbbb"],
    };
    expect(encode(a)).toBe(encode(b));
  });

  test("[standards:R4] the same answers give the same payload whatever order they were given in", () => {
    const a: ResumeState = {
      answers: {
        match00001: { pair000002: "pair000001", pair000001: "pair000002" },
        multi00001: ["answer0002", "answer0001", "answer0002"],
      },
    };
    const b: ResumeState = {
      answers: {
        multi00001: ["answer0001", "answer0002"],
        match00001: { pair000001: "pair000002", pair000002: "pair000001" },
      },
    };
    expect(encode(a)).toBe(encode(b));
    expect(decodeResume(encode(a))).toMatchObject({ state: b });
  });

  test("empty parts and numbers that cannot be stored are left out", () => {
    const state: ResumeState = {
      done: [],
      media: { aaaaaaaaaa: Number.NaN, bbbbbbbbbb: 4 },
      scroll: { cccccccccc: Number.POSITIVE_INFINITY },
      variables: { dddddddddd: Number.NaN, eeeeeeeeee: false },
    };
    expect(decodeResume(encode(state))).toMatchObject({
      state: { media: { bbbbbbbbbb: 4 }, variables: { eeeeeeeeee: false } },
    });
  });

  test("ids are stored, never positions: a reordered course reads the same state", () => {
    const state = { done: ["lesson0002", "lesson0001"], location: "lesson0002" };
    expect(decodeResume(encode(state))).toMatchObject({
      state: { done: ["lesson0001", "lesson0002"], location: "lesson0002" },
    });
  });
});

describe("size caps", { timeout: LOOPS }, () => {
  test("the caps per target", () => {
    expect(RESUME_CAPS).toEqual({
      scorm12: 4_096,
      scorm2004_2nd: 4_000,
      scorm2004: 64_000,
      xapi: 32_000,
    });
  });

  test("a payload never exceeds the cap, over 2,000 random states and caps", () => {
    const random = seeded(3);
    for (let i = 0; i < 2_000; i++) {
      const state = anyState(random, 12);
      const cap = 10 + int(random, 1_500);
      const result = encodeResume(state, { packageVersion: "7", cap });
      if (result.ok) expect(result.payload.length).toBeLessThanOrEqual(cap);
      else expect(result.size).toBeGreaterThan(cap);
      // Parts are dropped in the fixed order only.
      expect(DROP_ORDER.filter((part) => result.dropped.includes(part))).toEqual(result.dropped);
    }
    // About 0.5 s locally but over the 5 s default on the shared Windows CI runner, where every
    // package's tests run at once; as for the round trip above.
  }, 30_000);

  test("a part is dropped only when the payload is over the cap without it dropped", () => {
    const random = seeded(4);
    for (let i = 0; i < 500; i++) {
      const state = anyState(random, 12);
      const full = encode(state).length;
      const result = encodeResume(state, { packageVersion: "7", cap: full });
      expect(result).toEqual({ ok: true, payload: encode(state), dropped: [] });
    }
  }, 30_000);

  test("parts drop in the fixed order: scroll, then media, then visits of finished sections", () => {
    const state: ResumeState = {
      done: ["scene00001"],
      visited: { scene00001: ["slide00001", "slide00002"], scene00002: ["slide00003"] },
      media: { video00001: 12.5 },
      scroll: { lesson0001: 0.5 },
    };
    const sizes = [
      encode(state).length,
      encode({ ...state, scroll: {} }).length,
      encode({ ...state, scroll: {}, media: {} }).length,
    ];
    const fit = (cap: number) => encodeResume(state, { packageVersion: "7", cap });

    expect(fit(sizes[0] as number)).toMatchObject({ ok: true, dropped: [] });
    expect(fit((sizes[0] as number) - 1)).toMatchObject({ ok: true, dropped: ["scroll"] });
    expect(fit((sizes[1] as number) - 1)).toMatchObject({ ok: true, dropped: ["scroll", "media"] });
    const last = fit((sizes[2] as number) - 1);
    expect(last).toMatchObject({ ok: true, dropped: ["scroll", "media", "finished-visits"] });
    // Visits of the unfinished scene, and everything else, are kept.
    expect(decodeResume(last.ok ? last.payload : "")).toMatchObject({
      state: { done: ["scene00001"], visited: { scene00002: ["slide00003"] } },
    });
  });

  test("a state over the cap with every part dropped is not encoded", () => {
    const state: ResumeState = { done: ["aaaaaaaaaa", "bbbbbbbbbb"], scroll: { cccccccccc: 1 } };
    const result = encodeResume(state, { packageVersion: "7", cap: 5 });
    expect(result).toMatchObject({ ok: false, dropped: ["scroll"] });
    if (!result.ok) expect(result.size).toBeGreaterThan(5);
  });

  test("a large finished course fits SCORM 1.2's cap, losing only visits of finished scenes", () => {
    // 120 slides in 10 scenes, all visited and done, 60 variables, 3 quizzes of 10 questions.
    const random = seeded(5);
    const ids = (n: number) => Array.from({ length: n }, () => contentId(random));
    const scenes = ids(10);
    const slides = scenes.map(() => ids(12));
    const quizzes = ids(3);
    const state: ResumeState = {
      location: slides[9]?.[11] as string,
      done: [...scenes, ...slides.flat()],
      visited: Object.fromEntries(scenes.map((id, i) => [id, slides[i] as string[]])),
      answers: Object.fromEntries(ids(30).map((id) => [id, ids(1)[0] as string])),
      draws: Object.fromEntries(quizzes.map((id) => [id, ids(10)])),
      attempts: Object.fromEntries(quizzes.map((id) => [id, [60, 80]])),
      variables: Object.fromEntries(ids(60).map((id, i) => [id, i % 2 ? i : "some text"])),
    };
    const result = encodeResume(state, { packageVersion: "2026-10-24", cap: RESUME_CAPS.scorm12 });
    // Each content id takes 53 bits, so about 460 ids fit in 4,096 characters.
    expect(result).toMatchObject({ ok: true, dropped: ["finished-visits"] });
  });
});

describe("versions", { timeout: LOOPS }, () => {
  test("[rise:R12] the envelope keeps the package version, so an update is detected", () => {
    const payload = encode({ done: ["lesson0001"] }, { packageVersion: "3", cap: 100 });
    expect(decodeResume(payload)).toMatchObject({ status: "ok", packageVersion: "3" });
  });

  test("nothing stored is a first launch", () => {
    expect(decodeResume("")).toEqual({ status: "empty" });
  });

  test("a payload from a newer format is reported as newer, not read", () => {
    const body = encode({ done: ["lesson0001"] }).slice(2);
    expect(decodeResume(`2.${body}`)).toEqual({ status: "newer", format: 2 });
    expect(decodeResume(`10.${body}`)).toEqual({ status: "newer", format: 10 });
  });

  test("an unknown older format, another tool's data or a damaged payload is invalid", () => {
    const payload = encode({ done: ["lesson0001"], variables: { score00001: 5 } });
    for (const text of [
      `0.${payload.slice(2)}`,
      '{"v":1,"d":"x"}',
      "1",
      "1.",
      payload.slice(0, -1),
      `${payload}A`,
      `${payload.slice(0, -1)}!`,
      payload.replace(/^1\./, "1.%"),
    ]) {
      expect(decodeResume(text), text).toEqual({ status: "invalid" });
    }
  });

  test("random damage never throws", () => {
    const random = seeded(6);
    for (let i = 0; i < 2_000; i++) {
      const payload = encode(anyState(random));
      const at = 2 + int(random, payload.length - 2);
      const damaged = payload.slice(0, at) + pick(random, CHARS) + payload.slice(at + 1);
      expect(["ok", "invalid"]).toContain(decodeResume(damaged).status);
    }
  });
});

describe("pruneResume", () => {
  test("ids removed by a republish are ignored instead of failing", () => {
    const state: ResumeState = {
      location: "gone000001",
      done: ["kept000001", "gone000002"],
      visited: { kept000001: ["kept000002", "gone000003"], gone000004: ["kept000003"] },
      answers: { kept000004: "a", gone000005: "b" },
      draws: { quiz000001: ["kept000005", "gone000006"], quiz000002: ["kept000006"] },
      attempts: { quiz000001: [50], gone000007: [90] },
      variables: { kept000007: 1, gone000008: 2 },
      media: { gone000009: 3 },
      scroll: { kept000008: 4 },
    };
    const exists = (id: string) => !id.startsWith("gone");
    expect(pruneResume(state, exists)).toEqual({
      done: ["kept000001"],
      visited: { kept000001: ["kept000002"] },
      answers: { kept000004: "a" },
      draws: { quiz000002: ["kept000006"] },
      attempts: { quiz000001: [50] },
      variables: { kept000007: 1 },
      scroll: { kept000008: 4 },
    });
  });
});

describe("checkResume", () => {
  const state: ResumeState = { done: ["aaaaaaaaaa", "bbbbbbbbbb"], scroll: { cccccccccc: 0.5 } };
  const size = encode(state).length;

  test("no warning when the state fits whole", () => {
    expect(checkResume(state, { packageVersion: "7", cap: size })).toEqual([]);
  });

  test("warns the author which parts are not saved, with the size it needs", () => {
    const [warning, ...rest] = checkResume(state, { packageVersion: "7", cap: size - 1 });
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({
      code: "parts-dropped",
      size,
      cap: size - 1,
      dropped: ["scroll"],
    });
    expect(warning?.message).toContain("scroll positions");
  });

  test("warns the author when progress cannot be saved at all", () => {
    expect(checkResume(state, { packageVersion: "7", cap: 3 })).toMatchObject([
      { code: "over-cap", size, cap: 3, dropped: ["scroll"] },
    ]);
  });
});
