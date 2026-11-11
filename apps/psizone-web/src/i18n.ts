import type { locales } from "./paraglide/runtime.js";

export type Locale = (typeof locales)[number];

/** Message options for one request's locale: `m.hero_title({}, at(locale))`. */
export function at(locale: Locale): { locale: Locale } {
	return { locale };
}

/** The path prefix a locale's pages live under: Romanian at the root, English under /en. */
export function base(locale: Locale): string {
	return locale === "ro" ? "" : `/${locale}`;
}
