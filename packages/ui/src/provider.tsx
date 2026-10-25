import { createContext, type ReactNode, useContext, useMemo } from "react";
import { I18nProvider } from "react-aria-components";
import {
  createTranslator,
  PSEUDO_LOCALES,
  pseudoStrings,
  type Strings,
  type Translate,
} from "./strings.js";

export { isRTL, useLocale } from "react-aria-components";

const StringsContext = createContext<Translate>(createTranslator("en"));

export interface UiProviderProps {
  /** BCP 47 language of the editor UI; sets number formats, plurals and reading direction. */
  locale?: string;
  /** The translation for `locale`; keys it leaves out fall back to English. */
  strings?: Strings;
  children: ReactNode;
}

/**
 * Gives the kit its language: React Aria's built-in control texts and directions, and the
 * catalogue for our own texts. The pseudo-languages get the pseudo-localised catalogue.
 */
export function UiProvider({ locale = "en", strings, children }: UiProviderProps) {
  const translate = useMemo(
    () =>
      createTranslator(
        locale,
        strings ?? ((PSEUDO_LOCALES as readonly string[]).includes(locale) ? pseudoStrings() : {}),
      ),
    [locale, strings],
  );
  return (
    <I18nProvider locale={locale}>
      <StringsContext value={translate}>{children}</StringsContext>
    </I18nProvider>
  );
}

/** The catalogue lookup for the nearest UiProvider (English without one). */
export const useStrings = (): Translate => useContext(StringsContext);
