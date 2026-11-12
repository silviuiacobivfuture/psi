import type { Brand, Locale } from "../contract";
import type { Kind, KnowledgeEntryInput } from "../entry";

/** Every demo entry's id starts with this; the guide drops such sources when demo is off. */
export const DEMO_ID_PREFIX = "demo-";
/** Every demo entry's title starts with this, so a demo-sourced answer shows it in its sources. */
export const DEMO_TITLE_PREFIX = "[DEMO] ";
/** Every demo entry's page sits under this path (no such page exists on any site). */
export const DEMO_URL_PREFIX = "/demo/";
/** The reviewer stamped on clinical-kind demo entries, so the retrievability rule is exercised. */
export const DEMO_REVIEWER = "DEMO Reviewer";
export const DEMO_REVIEWED_AT = "2026-11-01";

/** A fictional entry for local development: plainly marked in its id, title, URL and body. */
export interface DemoEntry extends KnowledgeEntryInput {
	readonly demo: true;
}

/** One demo passage as its file writes it; `demoSet` adds the markings. */
export interface DemoDraft {
	/** `[a-z0-9-]`; the id becomes `demo-<brand>-<locale>-<slug>`. */
	slug: string;
	kind: Kind;
	title: string;
	/** Markdown lines. */
	body: ReadonlyArray<string>;
	/**
	 * Clinical-kind entries carry the demo reviewer by default; `false` leaves one unreviewed, so
	 * the ingest must skip it (`clinical-unreviewed`).
	 */
	reviewed?: boolean;
}

const NOTICE: Readonly<Record<Locale, string>> = {
	ro: "_[DEMO] Text demonstrativ, fictiv: nu descrie un serviciu real._",
	en: "_[DEMO] Fictional demo text: it does not describe a real service._",
};

/** True for an id the demo set owns. */
export function isDemoId(id: string): boolean {
	return id.startsWith(DEMO_ID_PREFIX);
}

/** Marks a brand's and locale's drafts as demo entries: id, title, URL, body notice and flag. */
export function demoSet(
	brand: Brand,
	locale: Locale,
	drafts: ReadonlyArray<DemoDraft>,
): ReadonlyArray<DemoEntry> {
	return drafts.map((d): DemoEntry => {
		const reviewed = d.kind === "clinical" && d.reviewed !== false;
		return {
			id: `${DEMO_ID_PREFIX}${brand}-${locale}-${d.slug}`,
			brand,
			locale,
			kind: d.kind,
			title: `${DEMO_TITLE_PREFIX}${d.title}`,
			url: `${DEMO_URL_PREFIX}${brand}/${locale}/${d.slug}`,
			body: [...d.body, "", NOTICE[locale]].join("\n"),
			status: "published",
			reviewedBy: reviewed ? DEMO_REVIEWER : null,
			reviewedAt: reviewed ? DEMO_REVIEWED_AT : null,
			demo: true,
		};
	});
}
