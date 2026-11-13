import type { locales } from "../paraglide/runtime.js";

export type Locale = (typeof locales)[number];

/** Message options for one request's locale: `m.nav_calendar({}, at(locale))`. */
export function at(locale: Locale): { locale: Locale } {
	return { locale };
}

export function localeFrom(cookie: string | undefined): Locale {
	return cookie === "en" ? "en" : "ro";
}
