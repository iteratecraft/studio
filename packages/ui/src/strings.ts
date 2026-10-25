// UI string catalogue of the editors (ENG-12). Editor text lives here, by key, with the built-in
// English as the fallback; learner text lives in @course-suite/labels and never mixes with it.
// A translation is a partial catalogue for one BCP 47 language: any language Intl knows works,
// right-to-left ones included, and plurals follow that language's Intl.PluralRules categories.

/** A text with plural forms, picked by the `count` value: CLDR categories, `other` required. */
export type PluralMessage = { readonly other: string } & {
  readonly [category in Exclude<Intl.LDMLPluralRule, "other">]?: string;
};

export type Message = string | PluralMessage;

/** The built-in English catalogue. Our own wording; `{name}` is a placeholder filled at run time. */
export const english = {
  "dialog.close": "Close",
  "toast.dismiss": "Dismiss",
  "list.items": { one: "{count} item", other: "{count} items" },
} as const satisfies Record<string, Message>;

export type StringKey = keyof typeof english;

/** A translation: some or all keys, each a text or plural forms in the translation's language. */
export type Strings = { readonly [key in StringKey]?: Message };

export type Translate = (
  key: StringKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/**
 * A function that gives the text for a key in `locale`: the translation's text when it has the
 * key, else the English one. Numbers in placeholders are formatted for the locale; a placeholder
 * without a value stays as it is, so a missing value shows instead of vanishing.
 */
export function createTranslator(locale: string, strings: Strings = {}): Translate {
  const plurals = new Intl.PluralRules(locale);
  const englishPlurals = new Intl.PluralRules("en");
  const numbers = new Intl.NumberFormat(locale);
  return (key, values = {}) => {
    const own = strings[key];
    const message: Message = own ?? english[key];
    let text: string;
    if (typeof message === "string") text = message;
    else {
      // The English forms follow English rules: Arabic "few" must not look for an English "few".
      const category = (own ? plurals : englishPlurals).select(Number(values.count));
      text = message[category] ?? message.other;
    }
    return text.replace(PLACEHOLDER, (placeholder, name: string) => {
      if (!Object.hasOwn(values, name)) return placeholder;
      const value = values[name];
      return typeof value === "number" ? numbers.format(value) : String(value);
    });
  };
}

/**
 * The pseudo-languages: English with accents and about 40 % more length, to find layout bugs and
 * text that skips the catalogue; left to right (en-XA) and right to left (ar-XB).
 */
export const PSEUDO_LOCALES = ["en-XA", "ar-XB"] as const;

const ACCENTED = "àƀçðèƒĝĥìĵķľɱñòþǫŕšţùṽŵẋýžÀƁÇÐÈƑĜĤÌĴĶĽṀÑÒÞǪŔŠŢÙṼŴẊÝŽ";
const PLAIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Accents every letter outside placeholders and pads the text, in brackets to spot cut-offs. */
export function pseudoLocalise(text: string): string {
  const accented = text.replace(/\{[A-Za-z]+\}|[A-Za-z]/g, (match) =>
    match.length > 1 ? match : (ACCENTED[PLAIN.indexOf(match)] ?? match),
  );
  return `[${accented}${"~".repeat(Math.ceil(text.length * 0.4))}]`;
}

/** The whole English catalogue, pseudo-localised. */
export function pseudoStrings(): Strings {
  return Object.fromEntries(
    Object.entries(english).map(([key, message]) => [
      key,
      typeof message === "string"
        ? pseudoLocalise(message)
        : Object.fromEntries(Object.entries(message).map(([c, text]) => [c, pseudoLocalise(text)])),
    ]),
  );
}
