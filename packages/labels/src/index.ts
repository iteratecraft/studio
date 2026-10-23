// Label sets (ENG-09; rise.md §3 L and §4 "Label set"): every learner-facing string of the players,
// visible or read by a screen reader, by key, for one language. Player code never writes learner
// text itself; it formats a label (a lint rule enforces it, see tools/lint).
import { english } from "./en.js";

export { english };

export type LabelKey = keyof typeof english.labels;

/** Every label, resolved. */
export type Labels = Readonly<Record<LabelKey, string>>;

/** A label set: a BCP 47 language tag and texts by key. A custom set may leave keys out. */
export interface LabelSet {
  language: string;
  labels: Partial<Record<LabelKey, string>>;
}

export const LABEL_KEYS = Object.keys(english.labels) as LabelKey[];

/** The labels to use: the set's texts, and the built-in English text for each key it leaves out. */
export function resolveLabels(set?: LabelSet): Labels {
  const labels: Record<string, string> = { ...english.labels };
  for (const key of LABEL_KEYS) {
    const text = set?.labels[key];
    if (typeof text === "string") labels[key] = text;
  }
  return labels as Labels;
}

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** A label with its `{name}` placeholders filled in; a placeholder without a value is left as is. */
export function formatLabel(
  labels: Labels,
  key: LabelKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return labels[key].replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[0]))].sort();

// The same language-tag pattern as the course schema's Language.
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

export interface LabelSetError {
  /** JSON Pointer (RFC 6901) into the set; "" is the set itself. */
  path: string;
  message: string;
}

/**
 * Checks a label set from outside the player (a custom set, an import): a language tag, known keys,
 * non-empty texts, and the same placeholders as the built-in text, so the player can fill them in.
 */
export function checkLabelSet(value: unknown): LabelSetError[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(value)) return [{ path: "", message: "must be an object" }];
  const errors: LabelSetError[] = [];
  for (const key of Object.keys(value)) {
    if (key !== "language" && key !== "labels") {
      errors.push({ path: pointer("", key), message: "is not a known property" });
    }
  }
  if (typeof value.language !== "string" || !LANGUAGE.test(value.language)) {
    errors.push({ path: "/language", message: "must be a BCP 47 language tag" });
  }
  if (!isObject(value.labels)) {
    errors.push({ path: "/labels", message: "must be an object" });
    return errors;
  }
  for (const [key, text] of Object.entries(value.labels)) {
    const path = pointer("/labels", key);
    if (!Object.hasOwn(english.labels, key)) errors.push({ path, message: "is not a known label" });
    else if (typeof text !== "string") errors.push({ path, message: "must be a string" });
    else if (text.trim() === "") errors.push({ path, message: "must not be empty" });
    else {
      const expected = placeholders(english.labels[key as LabelKey]);
      if (placeholders(text).join() !== expected.join()) {
        errors.push({
          path,
          message: expected.length
            ? `must use exactly the placeholders ${expected.join(", ")}`
            : "must not use placeholders",
        });
      }
    }
  }
  return errors;
}

const pointer = (base: string, key: string) =>
  `${base}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
