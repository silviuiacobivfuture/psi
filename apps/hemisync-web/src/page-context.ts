import {
	createPageResolver,
	type PageResolve,
	type PageSection,
	type SitePage,
	type SitePages,
} from "@psi/guide";
import { createPageRegistry } from "@psi/ui";
import type { Locale } from "./i18n";
import { faqGroups, hasText, plain, sections, text } from "./pages/doc";
import { PAGE_IDS, PAGES, type PageId } from "./routes";

/** The pages made of content messages, and the key their messages start with (`pages/doc.tsx`). */
const CONTENT_PAGES: Readonly<Partial<Record<PageId, string>>> = {
	club: "club",
	technology: "tech",
	history: "hist",
	glossary: "gloss",
	start: "start",
	meditation: "med",
	archive: "archive",
	exercises: "ex",
	about: "about",
	programmes: "progs",
	focus: "focus",
	faq: "faq",
};

const maybe = (key: string, locale: Locale): string | undefined =>
	hasText(key) ? plain(text(key, locale)) : undefined;

function sectionsOf(page: string, locale: Locale): ReadonlyArray<PageSection> {
	const written = sections(page).flatMap((s): PageSection[] => {
		const heading = maybe(s.heading, locale);
		const lines = s.blocks.flatMap((b) =>
			b.kind === "l"
				? b.keys.map((k) => `- ${plain(text(k, locale))}`)
				: [plain(text(b.key, locale))],
		);
		return heading === undefined || lines.length === 0 ? [] : [{ heading, text: lines.join("\n") }];
	});
	const asked = faqGroups(page).flatMap((g) =>
		g.items.map((i) => ({ heading: plain(text(i.q, locale)), text: plain(text(i.a, locale)) })),
	);
	return [...written, ...asked];
}

function pageOf(id: PageId, locale: Locale): SitePage | undefined {
	const key = CONTENT_PAGES[id];
	if (key === undefined) return undefined;
	const body = sectionsOf(key, locale);
	const lead = maybe(`${key}_lead`, locale);
	return {
		kind: "page",
		title: maybe(`${key}_h1`, locale) ?? id,
		path: PAGES[id][locale],
		...(lead === undefined ? {} : { lead }),
		headings: body.flatMap((s) => (s.heading === undefined ? [] : [s.heading])),
		sections: body,
		// Hemi-Sync's pages are programme and information text, not clinical claims.
		review: { kind: "programme", status: "published", reviewedBy: null, reviewedAt: null },
	};
}

/** Hemi-Sync's content pages, as the guide finds them. */
export const SITE_PAGES: SitePages = {
	targetOf(path) {
		const id = PAGE_IDS.find(
			(p) => CONTENT_PAGES[p] !== undefined && Object.values(PAGES[p]).includes(path),
		);
		return id === undefined ? undefined : { kind: "page", id };
	},
	page(target, locale) {
		const id = PAGE_IDS.find((p) => p === target.id);
		return target.kind === "page" && id !== undefined ? pageOf(id, locale) : undefined;
	},
};

/** Hemi-Sync's pages are programme and information text, not clinical claims: every page's text may be given. */
export const pageRegistry = createPageRegistry({ withText: () => true });

/** Where Hemi-Sync's guide finds the page the visitor is on. */
export const pageResolver: PageResolve = createPageResolver({
	brand: "hemisync",
	site: SITE_PAGES,
	rendered: pageRegistry.lookup,
});
