import {
	ARTICLES,
	type Article,
	articleUrl,
	blogPaths,
	INCLUDE_DRAFTS,
	isReadable,
	isVisible,
	LOCALES,
	ORIGINS,
	type ReadableArticle,
} from "@psi/content";
import { fold, PAGE_KINDS, PAGE_LIMITS, type PageContext, type PageKind } from "@psi/engine";
import { type ReviewState, retrievability } from "@psi/knowledge";
import { z } from "zod";
import { ARTICLE_POLICY } from "./articles";
import type { Brand, Locale } from "./contract";

/*
 * The page the visitor is on, for the guide. The browser sends only a REFERENCE (the page's path,
 * and where the page knows it, a typed target); the server looks the reference up in its own
 * content and builds the context the engine reads. Nothing the browser sends is ever page text.
 */

/** What a page is, by the id its site gives it: an article's slug, or a hub, method or page id. */
export type PageTarget =
	| { kind: "article"; slug: string }
	| { kind: Exclude<PageKind, "article">; id: string };

/** A page reference as the server understands it: the path, and the typed target when known. */
export interface PageRef {
	path: string;
	target?: PageTarget;
}

const PATH = /^\/[A-Za-z0-9\-._~/]{0,199}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

const RawRefSchema = z.object({
	path: z.string().optional(),
	kind: z.string().optional(),
	slug: z.string().optional(),
	id: z.string().optional(),
});

/** A path the guide may remember or look up: site-relative, plain characters, bounded. */
export function parsePagePath(raw: unknown): string | undefined {
	return typeof raw === "string" && PATH.test(raw) && !raw.includes("//") ? raw : undefined;
}

/**
 * Parses the reference a page posted (the request boundary). Anything malformed is no reference
 * at all, never a refused question: the guide then simply knows nothing of the page.
 */
export function parsePageRef(raw: unknown): PageRef | undefined {
	const parsed = RawRefSchema.safeParse(raw);
	if (!parsed.success) return undefined;
	const { kind, slug, id } = parsed.data;
	const path = parsePagePath(parsed.data.path);
	const typed = PAGE_KINDS.find((k) => k === kind);
	let target: PageTarget | undefined;
	if (typed === "article" && slug !== undefined && ID.test(slug)) {
		target = { kind: "article", slug };
	} else if (typed !== undefined && typed !== "article" && id !== undefined && ID.test(id)) {
		target = { kind: typed, id };
	}
	if (path === undefined && target === undefined) return undefined;
	return { path: path ?? "", ...(target === undefined ? {} : { target }) };
}

/** A block of a page's text under its heading. */
export interface PageSection {
	heading?: string;
	text: string;
}

/**
 * One non-article page of a site, in one locale, as its site's own content gives it. `review` is
 * what the knowledge base's rule reads (`retrievability`): only a published page that rule lets
 * through ever has its text sent; a clinical page with no reviewer, or a draft, never does.
 */
export interface SitePage {
	kind: Exclude<PageKind, "article">;
	title: string;
	/** The page's path in this locale, site-relative. */
	path: string;
	lead?: string;
	headings: ReadonlyArray<string>;
	/** The page's text, in reading order; read only when `review` makes it retrievable. */
	sections?: ReadonlyArray<PageSection>;
	review: ReviewState;
}

/** A site's non-article pages: how a path maps to a target, and the page for a target. */
export interface SitePages {
	targetOf(path: string): Exclude<PageTarget, { kind: "article" }> | undefined;
	page(target: Exclude<PageTarget, { kind: "article" }>, locale: Locale): SitePage | undefined;
}

/** Resolves a page reference, for the question being asked, to the context the engine reads. */
export type PageResolve = (
	ref: PageRef,
	locale: Locale,
	question: string,
) => PageContext | undefined;

/** The length the excerpt aims at; the engine's schema allows more. */
export const EXCERPT_CHARS = 2_000;

const DEICTIC = new Set(
	(
		"acest acesta articol articolul pagina pagini asta aceasta despre spune spun zici zice mai " +
		"multe putin detalii rezuma rezumat this that article page about tell more what does say " +
		"summarise summarize explain"
	).split(" "),
);

function wanted(question: string): ReadonlyArray<string> {
	return fold(question)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3 && !DEICTIC.has(w))
		.map((w) => w.slice(0, 5));
}

function cut(text: string, max: number): string {
	if (text.length <= max) return text;
	const head = text.slice(0, max);
	const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("\n"));
	return `${(stop > max * 0.5 ? head.slice(0, stop + 1) : head.replace(/\s+\S*$/, "")).trimEnd()}…`;
}

/**
 * About `max` characters of a page's text: the sections that share the most words with the
 * question first (the opening ones when the question names no subject, like "tell me more about
 * this"), kept in reading order, the last one cut at a sentence.
 */
export function excerptOf(
	sections: ReadonlyArray<PageSection>,
	question: string,
	max: number = EXCERPT_CHARS,
): string {
	const terms = wanted(question);
	const scored = sections.map((section, order) => {
		const hay = fold(`${section.heading ?? ""} ${section.text}`);
		return { section, order, points: terms.filter((t) => hay.includes(t)).length };
	});
	const ranked = [...scored].sort((a, b) => b.points - a.points || a.order - b.order);
	const chosen: Array<(typeof scored)[number]> = [];
	let left = max;
	for (const entry of ranked) {
		if (left <= 80 && chosen.length > 0) break;
		const rendered = renderSection(entry.section);
		chosen.push({ ...entry, section: { ...entry.section, text: cut(rendered, left) } });
		left -= Math.min(rendered.length, left) + 2;
	}
	return chosen
		.sort((a, b) => a.order - b.order)
		.map((c) => c.section.text)
		.join("\n\n");
}

function renderSection(section: PageSection): string {
	return section.heading === undefined ? section.text : `${section.heading}\n${section.text}`;
}

function blockText(block: ReadableArticle["body"][number], locale: Locale): string {
	switch (block.type) {
		case "list":
			return block.items.map((item) => `- ${item[locale]}`).join("\n");
		case "quote":
			return `> ${block.text[locale]}`;
		case "p":
		case "h2":
			return block.text[locale];
		default: {
			const never: never = block;
			return never;
		}
	}
}

/** An article's body as sections: the opening, then one per h2, then its questions and answers. */
function articleSections(article: ReadableArticle, locale: Locale): ReadonlyArray<PageSection> {
	const out: Array<PageSection> = [];
	let current: { heading?: string; lines: Array<string> } = { lines: [] };
	const flush = (): void => {
		if (current.lines.length > 0) {
			out.push({
				...(current.heading === undefined ? {} : { heading: current.heading }),
				text: current.lines.join("\n"),
			});
		}
	};
	for (const block of article.body) {
		if (block.type === "h2") {
			flush();
			current = { heading: block.text[locale], lines: [] };
		} else current.lines.push(blockText(block, locale));
	}
	flush();
	for (const f of article.faq) out.push({ heading: f.q[locale], text: f.a[locale] });
	return out;
}

function bounded(headings: ReadonlyArray<string>): ReadonlyArray<string> {
	return headings
		.map((h) => h.trim().slice(0, PAGE_LIMITS.heading))
		.filter((h) => h !== "")
		.slice(0, PAGE_LIMITS.headings);
}

function leadOf(text: string | undefined): { lead?: string } {
	const lead = text?.trim().slice(0, PAGE_LIMITS.lead) ?? "";
	return lead === "" ? {} : { lead };
}

/**
 * The context of one article for one question. A backlog title (`in-review`) is its title alone.
 * A draft is its title, standfirst and headings, stated as unreviewed. Only a published article
 * the knowledge rule lets through has an excerpt of its body, chosen for the question.
 */
export function articleContext(
	article: Article,
	locale: Locale,
	question: string,
	url: string,
): PageContext {
	const title = article.title[locale];
	if (!isReadable(article))
		return { kind: "article", status: "in-review", title, url, headings: [] };
	const headings = bounded([
		...article.body.flatMap((b) => (b.type === "h2" ? [b.text[locale]] : [])),
		...article.faq.map((f) => f.q[locale]),
	]);
	const lead = leadOf(article.standfirst[locale]);
	if (article.status === "draft") {
		return { kind: "article", status: "draft", title, url, ...lead, headings };
	}
	const verdict = retrievability({
		kind: article.kind === "health" ? "clinical" : "editorial",
		status: "published",
		reviewedBy: article.reviewer?.name ?? null,
		reviewedAt: article.reviewer?.reviewedAt ?? null,
	});
	if (!verdict.retrievable) {
		return { kind: "article", status: "in-review", title, url, ...lead, headings };
	}
	const excerpt = excerptOf(articleSections(article, locale), question);
	return {
		kind: "article",
		status: "published",
		title,
		url,
		...lead,
		headings,
		...(excerpt === "" ? {} : { excerpt }),
	};
}

/** The context of a site's own page: its text only when the knowledge rule makes it retrievable. */
export function sitePageContext(page: SitePage, question: string): PageContext {
	const verdict = retrievability(page.review);
	const head = {
		kind: page.kind,
		title: page.title,
		url: page.path,
		...leadOf(page.lead),
		headings: bounded(page.headings),
	};
	if (!verdict.retrievable) {
		return { ...head, status: verdict.reason === "draft" ? "draft" : "in-review" };
	}
	const excerpt = excerptOf(page.sections ?? [], question);
	return { ...head, status: "published", ...(excerpt === "" ? {} : { excerpt }) };
}

/** The slug of an article path of the blog (either locale), or undefined for any other path. */
export function articleSlugOf(path: string): string | undefined {
	for (const locale of LOCALES) {
		const [before = "", after = ""] = blogPaths.article(locale, "\0").split("\0");
		if (path.startsWith(before) && path.endsWith(after) && path.length > before.length) {
			const slug = path.slice(before.length, path.length - after.length);
			if (ID.test(slug)) return slug;
		}
	}
	return undefined;
}

export interface PageResolverOptions {
	/** The guide's brand: which articles it may read (`ARTICLE_POLICY`). */
	brand: Brand;
	/** The articles the site shows; defaults to the repository's catalogue. */
	article?: (slug: string) => Article | undefined;
	/** Whether drafts are shown, as on the blog; defaults to the blog's own policy (never in production). */
	includeDrafts?: boolean;
	/** The blog's origin article addresses use; defaults to the estate's. */
	blogOrigin?: string;
	/** The site's other pages. */
	site?: SitePages;
}

/**
 * The resolver a site hands its `/ghid` route. An article is found through the site's own articles
 * under the blog's visibility policy and this brand's `ARTICLE_POLICY` (an article of a brand the
 * guide may not recommend is no page at all, and so is an unknown slug); any other page through the
 * site's own pages. A path alone is mapped to a target by the server's own routes.
 */
export function createPageResolver(options: PageResolverOptions): PageResolve {
	const allowed = ARTICLE_POLICY[options.brand];
	const findArticle = options.article ?? ((slug: string) => ARTICLES.find((a) => a.slug === slug));
	const includeDrafts = options.includeDrafts ?? INCLUDE_DRAFTS;
	const origin = options.blogOrigin ?? ORIGINS.blog;
	return (ref, locale, question) => {
		const slug = ref.target?.kind === "article" ? ref.target.slug : articleSlugOf(ref.path);
		if (slug !== undefined && (ref.target === undefined || ref.target.kind === "article")) {
			const article = findArticle(slug);
			if (article === undefined || !allowed.includes(article.brand)) return undefined;
			if (!isVisible(article, includeDrafts)) return undefined;
			return articleContext(article, locale, question, articleUrl(locale, slug, origin));
		}
		const target =
			ref.target !== undefined && ref.target.kind !== "article"
				? ref.target
				: options.site?.targetOf(ref.path);
		if (target === undefined) return undefined;
		const page = options.site?.page(target, locale);
		return page === undefined ? undefined : sitePageContext(page, question);
	};
}
