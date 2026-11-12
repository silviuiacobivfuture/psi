import {
	createPageResolver,
	type PageResolve,
	type PageSection,
	type SitePage,
	type SitePages,
} from "@psi/guide";
import type { Locale } from "./i18n";
import { PROSE, type ProseKey } from "./pages/content-spec";
import { msg } from "./pages/prose";
import { PAGE_IDS, PAGES, type PageId } from "./routes";

/** The long-form pages and the message prefix their text lives under (`content-spec.ts`). */
const PROSE_PAGES: Readonly<Partial<Record<PageId, ProseKey>>> = {
	method: "mx",
	protocols: "pr",
	science: "sc",
	listen: "ls",
	glossary: "gl",
	who: "wh",
	safety: "sf",
	about: "ab",
};

/**
 * The programme's own pages are live site text the knowledge base also carries as programme
 * content. The science page is the one with research claims: it counts as clinical text with no
 * reviewer yet, so the guide describes it by its headings and never states it as fact.
 */
function reviewOf(id: PageId): SitePage["review"] {
	return id === "science"
		? { kind: "clinical", status: "published", reviewedBy: null, reviewedAt: null }
		: { kind: "programme", status: "published", reviewedBy: null, reviewedAt: null };
}

function maybe(locale: Locale, key: string): string | undefined {
	try {
		return msg(locale, key);
	} catch {
		return undefined;
	}
}

function sectionsOf(k: ProseKey, locale: Locale): ReadonlyArray<PageSection> {
	return PROSE[k].flatMap((s): PageSection[] => {
		const heading = maybe(locale, `${k}_${s.id}_h`);
		const lines = [
			...Array.from({ length: s.p }, (_, i) => maybe(locale, `${k}_${s.id}_p${i + 1}`)),
			...Array.from({ length: s.l }, (_, i) => {
				const item = maybe(locale, `${k}_${s.id}_l${i + 1}`);
				return item === undefined ? undefined : `- ${item}`;
			}),
		].filter((line): line is string => line !== undefined);
		return heading === undefined || lines.length === 0 ? [] : [{ heading, text: lines.join("\n") }];
	});
}

function pageOf(id: PageId, locale: Locale): SitePage | undefined {
	const k = PROSE_PAGES[id];
	if (k === undefined) return undefined;
	const sections = sectionsOf(k, locale);
	const lead = maybe(locale, `${k}_lead`);
	return {
		kind: "page",
		title: maybe(locale, `${k}_h1`) ?? id,
		path: PAGES[id][locale],
		...(lead === undefined ? {} : { lead }),
		headings: sections.flatMap((s) => (s.heading === undefined ? [] : [s.heading])),
		sections,
		review: reviewOf(id),
	};
}

/** EQ-SYNC's long-form pages, as the guide finds them. */
export const SITE_PAGES: SitePages = {
	targetOf(path) {
		const id = PAGE_IDS.find(
			(p) => PROSE_PAGES[p] !== undefined && Object.values(PAGES[p]).includes(path),
		);
		return id === undefined ? undefined : { kind: "page", id };
	},
	page(target, locale) {
		const id = PAGE_IDS.find((p) => p === target.id);
		return target.kind === "page" && id !== undefined ? pageOf(id, locale) : undefined;
	},
};

/** Where EQ-SYNC's guide finds the page the visitor is on. */
export const pageResolver: PageResolve = createPageResolver({ brand: "eqsync", site: SITE_PAGES });
