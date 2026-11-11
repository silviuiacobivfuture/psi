import type { Locale } from "./locale";

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
