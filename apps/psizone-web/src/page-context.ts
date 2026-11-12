import { createPageResolver, type PageResolve, type SitePage, type SitePages } from "@psi/guide";
import { FAQ } from "./content/faq";
import { HUBS } from "./content/hubs";
import { METHODS } from "./content/methods";
import { RICH_HUBS, RICH_METHODS } from "./content/rich";
import type { RichPage } from "./content/rich/types";
import { VISIT_STEPS } from "./content/visit";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** Hubs and methods are clinical text written ahead of review: the page says so, and so do we. */
const CLINICAL_DRAFT = {
	kind: "clinical",
	status: "draft",
	reviewedBy: null,
	reviewedAt: null,
} as const;
/** The first visit and the FAQ restate what the site already publishes; they carry no clinical claim. */
const OPERATIONAL = {
	kind: "operational",
	status: "published",
	reviewedBy: null,
	reviewedAt: null,
} as const;

const STATIC_PAGES: ReadonlyArray<{ id: string; path: string }> = [
	{ id: "prima-vizita", path: "/prima-vizita" },
	{ id: "intrebari-frecvente", path: "/intrebari-frecvente" },
];

function headingsOf(rich: RichPage | undefined, locale: Locale): ReadonlyArray<string> {
	return rich === undefined ? [] : rich.sections.map((s) => s.h2[locale]);
}

function hubPage(id: string, locale: Locale): SitePage | undefined {
	const hub = HUBS.find((h) => h.id === id);
	if (hub === undefined) return undefined;
	const o = at(locale);
	const rich = RICH_HUBS[id];
	return {
		kind: "hub",
		title: hub.title(o),
		path: `${base(locale)}${hub.path}`,
		lead: rich?.lead[locale] ?? hub.text(o),
		headings: headingsOf(rich, locale),
		review: CLINICAL_DRAFT,
	};
}

function methodPage(id: string, locale: Locale): SitePage | undefined {
	const method = METHODS.find((x) => x.id === id);
	if (method === undefined) return undefined;
	const rich = RICH_METHODS[id];
	return {
		kind: "method",
		title: method.name[locale],
		path: `${base(locale)}${method.path}`,
		lead: rich?.lead[locale] ?? method.lead[locale],
		headings: headingsOf(rich, locale),
		review: CLINICAL_DRAFT,
	};
}

function staticPage(id: string, locale: Locale): SitePage | undefined {
	const o = at(locale);
	const path = STATIC_PAGES.find((p) => p.id === id)?.path;
	if (path === undefined) return undefined;
	if (id === "prima-vizita") {
		return {
			kind: "page",
			title: m.visit_title({}, o),
			path: `${base(locale)}${path}`,
			lead: m.visit_lead({}, o),
			headings: VISIT_STEPS.map((s) => s.title[locale]),
			sections: VISIT_STEPS.map((s) => ({ heading: s.title[locale], text: s.text[locale] })),
			review: OPERATIONAL,
		};
	}
	return {
		kind: "page",
		title: m.faq_title({}, o),
		path: `${base(locale)}${path}`,
		lead: m.faq_lead({}, o),
		headings: FAQ.map((e) => e.q[locale]),
		sections: FAQ.map((e) => ({ heading: e.q[locale], text: e.a[locale] })),
		review: OPERATIONAL,
	};
}

/** The path without the English prefix: the site serves one content under both locales' routes. */
function plain(path: string): string {
	return path.replace(/^\/en(?=\/|$)/, "") || "/";
}

/** Psizone's hubs, methods and information pages, as the guide finds them. */
export const SITE_PAGES: SitePages = {
	targetOf(path) {
		const p = plain(path);
		const hub = HUBS.find((h) => h.path === p);
		if (hub !== undefined) return { kind: "hub", id: hub.id };
		const method = METHODS.find((x) => x.path === p);
		if (method !== undefined) return { kind: "method", id: method.id };
		const page = STATIC_PAGES.find((x) => x.path === p);
		return page === undefined ? undefined : { kind: "page", id: page.id };
	},
	page(target, locale) {
		if (target.kind === "hub") return hubPage(target.id, locale);
		if (target.kind === "method") return methodPage(target.id, locale);
		return staticPage(target.id, locale);
	},
};

/** Where Psizone's guide finds the page the visitor is on (articles are the blog's, not read here). */
export const pageResolver: PageResolve = createPageResolver({ brand: "psizone", site: SITE_PAGES });
