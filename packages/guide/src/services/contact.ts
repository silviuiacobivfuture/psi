import { ORIGINS } from "@psi/content";
import type { Brand, Locale } from "../contract";

/**
 * The centre's public numbers, as published on psizone.ro/contact (the Psizone site reads the same
 * two from the CMS settings, with these as the fallback). The guides of the other sites know them
 * too, so a failing lookup never leaves a visitor without a way to book.
 */
export const CENTRE_PHONES: ReadonlyArray<string> = ["0748 017 752", "0752 466 792"];

const WORD = /^[a-z][a-z-]{1,39}$/;

/** `/en` for English on every site; Romanian has no prefix. */
function prefix(locale: Locale): string {
	return locale === "en" ? "/en" : "";
}

/** A page of a brand's site, absolute (the guide of another site links across). */
export function pageUrl(brand: Brand, locale: Locale, path: string): string {
	return `${ORIGINS[brand]}${prefix(locale)}${path}`;
}

/**
 * Where a booking started on another site continues: Psizone's chat, opened on load by
 * `?ghid=programare`, with the service the visitor named when there is one (`serviciu`, a
 * lowercase word the chat turns into "I'd like to book <word>").
 */
export function bookingHandoffUrl(locale: Locale, service?: string): string {
	const base = `${ORIGINS.psizone}${prefix(locale)}/`;
	const word = service !== undefined && WORD.test(service) ? `&serviciu=${service}` : "";
	return `${base}?ghid=programare${word}`;
}

/**
 * Hemi-Sync's booking page, per locale, as its site serves it. The one place the two paths are
 * written: the site's route table reads them from here, and the blog's hand-over links to them.
 */
export const HEMISYNC_BOOKING_PATHS: Readonly<Record<Locale, string>> = {
	ro: "/programare",
	en: "/en/booking",
};

/** Where a booking started on the blog continues for a Hemi-Sync page: Hemi-Sync's own booking page. */
export function hemisyncBookingUrl(locale: Locale): string {
	return `${ORIGINS.hemisync}${HEMISYNC_BOOKING_PATHS[locale]}`;
}
