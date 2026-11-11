import type { Locale } from "../i18n";

/** Page content in both languages: content, not interface copy, so it is data (it moves to the CMS). */
export type Localised = Record<Locale, string>;
