import { describe, expect, test } from "vitest";
import {
  createTranslator,
  english,
  PSEUDO_LOCALES,
  pseudoLocalise,
  pseudoStrings,
} from "./strings.js";

describe("createTranslator", () => {
  test("gives the English text without a translation", () => {
    expect(createTranslator("en")("dialog.close")).toBe("Close");
  });

  test("gives the translation's text, and English for keys it leaves out", () => {
    const t = createTranslator("de", { "dialog.close": "Schließen" });
    expect(t("dialog.close")).toBe("Schließen");
    expect(t("toast.dismiss")).toBe("Dismiss");
  });

  test("picks plural forms by the language's own rules", () => {
    // Arabic has all six CLDR categories; the translation names three and falls back to other.
    const t = createTranslator("ar", {
      "list.items": {
        zero: "zero {count}",
        one: "one {count}",
        two: "two {count}",
        other: "x {count}",
      },
    });
    expect(t("list.items", { count: 0 })).toBe("zero 0");
    expect(t("list.items", { count: 1 })).toBe("one 1");
    expect(t("list.items", { count: 2 })).toBe("two 2");
    expect(t("list.items", { count: 3 })).toBe("x 3");
    const pl = createTranslator("pl", {
      "list.items": {
        one: "{count} element",
        few: "{count} elementy",
        many: "{count} elementów",
        other: "{count} elementu",
      },
    });
    expect([1, 2, 5, 22, 1.5].map((count) => pl("list.items", { count }))).toEqual([
      "1 element",
      "2 elementy",
      "5 elementów",
      "22 elementy",
      "1,5 elementu",
    ]);
  });

  test("uses English plural rules for the English fallback", () => {
    // Arabic says "few" for 3; the English forms have only one and other.
    expect(createTranslator("ar")("list.items", { count: 3 })).toBe("3 items");
    expect(createTranslator("en")("list.items", { count: 1 })).toBe("1 item");
    expect(createTranslator("en")("list.items", { count: 1200 })).toBe("1,200 items");
  });

  test("leaves a placeholder without a value as it is", () => {
    expect(createTranslator("en")("list.items")).toBe("{count} items");
  });
});

describe("pseudo-localisation", () => {
  test("accents letters, keeps placeholders and lengthens the text by about 40 %", () => {
    expect(pseudoLocalise("Close {name}")).toBe("[Çľòšè {name}~~~~~]");
  });

  test("covers every key and plural form of the catalogue", () => {
    const pseudo = pseudoStrings();
    expect(Object.keys(pseudo)).toEqual(Object.keys(english));
    const t = createTranslator(PSEUDO_LOCALES[0], pseudo);
    expect(t("list.items", { count: 1 })).toBe("[1 ìţèɱ~~~~~]");
    expect(t("list.items", { count: 2 })).toBe("[2 ìţèɱš~~~~~~]");
  });
});
