import type { Locale } from "../i18n";
import type { WorkshopId } from "../routes";

/**
 * Every past edition the old Psizone pages (and the live hemi-sync.ro calendar) name, one record
 * per edition. `year: null` means the page gives only the day and month; the year is never
 * guessed (the 2019 pages carry only their publication date). No price, no organiser, no
 * testimonial: those stay on the old pages.
 */
export interface Edition {
	type: WorkshopId;
	/** The year, or null when it is not confirmed. */
	year: number | null;
	/** Month (1–12) and day the edition starts and ends. */
	from: readonly [month: number, day: number];
	to: readonly [month: number, day: number];
	/** A city or place; absent for online editions. */
	place?: string;
	online?: boolean;
	/** The old page's title is the only source of the dates (year unconfirmed). */
	poster?: "optimise" | "online";
}

export const EDITIONS: ReadonlyArray<Edition> = [
	{ type: "online", year: 2025, from: [6, 7], to: [6, 8], online: true, poster: "online" },
	{ type: "consciousness", year: 2026, from: [2, 27], to: [3, 1], place: "Plaiul Foii" },
	{ type: "consciousness", year: 2023, from: [5, 13], to: [5, 14], place: "Galați" },
	{ type: "optimise", year: 2023, from: [4, 1], to: [4, 2], place: "Galați", poster: "optimise" },
	{ type: "consciousness", year: null, from: [11, 23], to: [11, 24], place: "Constanța" },
	{ type: "consciousness", year: null, from: [11, 9], to: [11, 10], place: "Iași" },
	{ type: "consciousness", year: null, from: [9, 28], to: [9, 29], place: "Galați" },
];

/** The editions of one type, newest first, those without a confirmed year last. */
export function editionsOf(type?: WorkshopId): ReadonlyArray<Edition> {
	const list = type === undefined ? EDITIONS : EDITIONS.filter((e) => e.type === type);
	return [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

/** ISO dates of an edition with a confirmed year. */
export function isoRange(e: Edition): { start: string; end: string } | null {
	if (e.year === null) return null;
	const pad = (n: number): string => String(n).padStart(2, "0");
	return {
		start: `${e.year}-${pad(e.from[0])}-${pad(e.from[1])}`,
		end: `${e.year}-${pad(e.to[0])}-${pad(e.to[1])}`,
	};
}

/** "13–14 mai 2023" or, without a year, "9–10 noiembrie". */
export function dateLabel(e: Edition, locale: Locale): string {
	const fmt = new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		day: "numeric",
		month: "long",
		...(e.year === null ? {} : { year: "numeric" }),
		timeZone: "UTC",
	});
	// Without a year, 2000 is only a leap-year carrier for the formatter; it is never printed.
	const year = e.year ?? 2000;
	return fmt.formatRange(
		new Date(Date.UTC(year, e.from[0] - 1, e.from[1])),
		new Date(Date.UTC(year, e.to[0] - 1, e.to[1])),
	);
}
