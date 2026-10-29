// Id minting (ADR-0002, "Ids").
import type { Course } from "./course.js";
import { activityIdOf } from "./publish.js";

// The format package has no DOM or Node typings; Web Crypto is global in both.
const webCrypto = () =>
  (
    globalThis as unknown as {
      crypto: { getRandomValues(array: Uint8Array): Uint8Array; randomUUID(): string };
    }
  ).crypto;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const LETTERS_AND_DIGITS = `${LETTERS}0123456789`;

/** A new project id: a random version 4 UUID. */
export function newProjectId(): string {
  return webCrypto().randomUUID();
}

/**
 * A new content id: a lowercase letter and 9 lowercase letters or digits, about 51 random bits.
 * Pass the ids already in the document; a collision is drawn again.
 */
export function newContentId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = randomChars(LETTERS, 1) + randomChars(LETTERS_AND_DIGITS, 9);
    if (!taken.has(id)) return id;
  }
}

/** Save as, save as template, send to library: a new project id, content ids kept. */
export function withNewProjectId(course: Course): Course {
  return { ...course, id: newProjectId() };
}

/**
 * The xAPI and cmi5 activity IRI of the course, or of an entry or question in it (standards.md E-16):
 * the author's `publish.activityId`, or `urn:uuid:` and the project id; then `/` and each content id.
 * Built only from stable ids, so every republish keeps them and a text edit never changes them.
 */
export function activityIri(course: Course, ...ids: string[]): string {
  const base = activityIdOf(course);
  return ids.length === 0 ? base : [base.replace(/\/+$/, ""), ...ids].join("/");
}

function randomChars(alphabet: string, count: number): string {
  // Bytes at or above the largest multiple of the alphabet size are dropped, so no character is
  // more likely than another.
  const limit = 256 - (256 % alphabet.length);
  const bytes = new Uint8Array(count * 2);
  let out = "";
  while (out.length < count) {
    for (const byte of webCrypto().getRandomValues(bytes)) {
      if (byte < limit && out.length < count) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}
