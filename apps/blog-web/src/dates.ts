import type { Locale } from "./i18n";

const FORMATS: Readonly<Record<Locale, Intl.DateTimeFormat>> = {
	ro: new Intl.DateTimeFormat("ro-RO", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}),
	en: new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}),
};

/** "11 noiembrie 2026" from "2026-11-11". */
export function longDate(iso: string, locale: Locale): string {
	return FORMATS[locale].format(new Date(`${iso}T00:00:00Z`));
}

/** RFC 822 date for RSS. */
export function rfc822(iso: string): string {
	return new Date(`${iso}T08:00:00Z`).toUTCString();
}

/** The dateline under the masthead: "marți, 11 noiembrie 2026". */
export function dateline(now: Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(now);
}
