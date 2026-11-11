import type { Locale } from "./i18n";

/** "11 noiembrie 2026" from "2026-11-11"; one formatter for the whole estate. */
export { longDate } from "@psi/content";

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
