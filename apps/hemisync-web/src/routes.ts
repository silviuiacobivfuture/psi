import type { Locale } from "./i18n";

/** Every page beyond the home and the programme pages. */
export const PAGE_IDS = [
	"programmes",
	"exercises",
	"technology",
	"focus",
	"club",
	"faq",
	"about",
	"contact",
	"terms",
	"privacy",
	"cookies",
	"trademarks",
	"history",
	"glossary",
	"start",
	"meditation",
	"archive",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/**
 * The route table (docs/plans/hemisync-web.md §3): the live Romanian paths are kept at the root,
 * English lives under /en with translated segments. The sitemap and hreflang read from here.
 */
export const PAGES: Readonly<Record<PageId, Readonly<Record<Locale, string>>>> = {
	programmes: { ro: "/programe", en: "/en/programmes" },
	exercises: { ro: "/descarcari", en: "/en/free-exercises" },
	technology: { ro: "/tehnologia", en: "/en/technology" },
	focus: { ro: "/nivelurile-focus", en: "/en/focus-levels" },
	club: { ro: "/club", en: "/en/dolphin-energy-club" },
	faq: { ro: "/intrebari-frecvente", en: "/en/faq" },
	about: { ro: "/despre", en: "/en/about" },
	contact: { ro: "/contact", en: "/en/contact" },
	terms: { ro: "/termeni-si-conditii", en: "/en/legal/terms" },
	privacy: { ro: "/politica-de-confidentialitate", en: "/en/legal/privacy" },
	cookies: { ro: "/despre-cookie-uri", en: "/en/legal/cookies" },
	trademarks: { ro: "/marci-si-licente", en: "/en/legal/trademarks" },
	history: { ro: "/istoria-hemi-sync", en: "/en/history-of-hemi-sync" },
	glossary: { ro: "/glosar", en: "/en/glossary" },
	start: { ro: "/cum-incepi", en: "/en/getting-started" },
	meditation: { ro: "/hemi-sync-si-meditatia", en: "/en/hemi-sync-and-meditation" },
	archive: { ro: "/programe/arhiva", en: "/en/programmes/archive" },
};

/** The programmes with a page of their own, in the home's order. */
export const PROGRAMME_SLUGS = ["gateway-voyage", "sync-creation", "lucid-dreaming"] as const;
export type ProgrammeSlug = (typeof PROGRAMME_SLUGS)[number];

/**
 * The workshop types carried over from the old psizone.ro pages, each with one archive of its
 * editions. Slugs are per locale (plan §3: `/programe/<slug>`, `/en/programmes/<slug>`).
 */
export const WORKSHOP_IDS = [
	"consciousness",
	"advanced",
	"optimise",
	"creative",
	"connection",
	"obe",
	"online",
] as const;
export type WorkshopId = (typeof WORKSHOP_IDS)[number];

const WORKSHOP_SLUGS: Readonly<Record<WorkshopId, Readonly<Record<Locale, string>>>> = {
	consciousness: { ro: "explorarea-constiintei", en: "consciousness-exploration" },
	advanced: { ro: "excursie-avansata", en: "advanced-excursion" },
	optimise: { ro: "optimise-your-life", en: "optimise-your-life" },
	creative: { ro: "creative-life", en: "creative-life" },
	connection: { ro: "deep-connection", en: "deep-connection" },
	obe: { ro: "out-of-body", en: "out-of-body" },
	online: { ro: "ateliere-online", en: "online-workshops" },
};

/** A workshop type's page path in one locale. */
export function workshopHref(locale: Locale, id: WorkshopId): string {
	return locale === "ro"
		? `/programe/${WORKSHOP_SLUGS[id].ro}`
		: `/en/programmes/${WORKSHOP_SLUGS[id].en}`;
}

/** A page's path in one locale, with an optional in-page anchor. */
export function href(locale: Locale, id: PageId, anchor?: string): string {
	const path = PAGES[id][locale];
	return anchor === undefined ? path : `${path}#${anchor}`;
}
