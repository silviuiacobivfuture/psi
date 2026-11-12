import { ARTICLES } from "./articles/catalogue";
import type { Brand } from "./brands";
import { LOCALES, type Locale } from "./locale";
import { INCLUDE_DRAFTS, ORIGINS } from "./origins";
import { isRetired, RETIRED_SITES } from "./retired";
import { type Article, isReadable, type Topic } from "./schema";
import { type ArticleSummary, summarize } from "./summary";

export interface IndexOptions {
	/** The blog's origin the summaries link to. */
	blogOrigin: string;
	/** Drafts are shown only where they may be (staging, local); never in production. */
	includeDrafts: boolean;
	/** Brands withdrawn from every listing (default: the estate's retired sites). */
	retired?: ReadonlyArray<string>;
}

/** Whether an article may be shown at all under a draft policy. Backlog stubs always may. */
export function isVisible(a: Article, includeDrafts: boolean): boolean {
	return a.status !== "draft" || includeDrafts;
}

/** Newest first; the same day is broken by slug, so the order never depends on the source. */
function newestFirst(a: ArticleSummary, b: ArticleSummary): number {
	return b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);
}

/** Every readable, visible article in every locale, newest first. */
export function buildIndex(
	articles: ReadonlyArray<Article>,
	options: IndexOptions,
): ReadonlyArray<ArticleSummary> {
	return articles
		.filter(isReadable)
		.filter((a) => !isRetired(a.brand, options.retired ?? RETIRED_SITES))
		.filter((a) => isVisible(a, options.includeDrafts))
		.flatMap((a) => LOCALES.map((locale) => summarize(a, locale, options.blogOrigin)))
		.sort(newestFirst);
}

/** This process's index: the catalogue under its environment's origins and draft policy. */
export const INDEX: ReadonlyArray<ArticleSummary> = buildIndex(ARTICLES, {
	blogOrigin: ORIGINS.blog,
	includeDrafts: INCLUDE_DRAFTS,
});

/** A brand's newest `n` articles in one locale. */
export function latestFor(
	brand: Brand,
	locale: Locale,
	n: number,
	index: ReadonlyArray<ArticleSummary> = INDEX,
): ReadonlyArray<ArticleSummary> {
	return index.filter((a) => a.brand === brand && a.locale === locale).slice(0, Math.max(0, n));
}

/**
 * Up to `n` other articles to read next: the same brand and locale only (a Psizone article never
 * leads to another brand), the same topic first, then the newest.
 */
export function related(
	article: ArticleSummary,
	n: number,
	index: ReadonlyArray<ArticleSummary> = INDEX,
): ReadonlyArray<ArticleSummary> {
	const pool = index.filter(
		(a) => a.brand === article.brand && a.locale === article.locale && a.slug !== article.slug,
	);
	const sameTopic = pool.filter((a) => a.topic === article.topic);
	const rest = pool.filter((a) => a.topic !== article.topic);
	return [...sameTopic, ...rest].slice(0, Math.max(0, n));
}

/** One topic's articles in one locale, newest first; optionally one brand's. */
export function byTopic(
	topic: Topic,
	locale: Locale,
	brand?: Brand,
	index: ReadonlyArray<ArticleSummary> = INDEX,
): ReadonlyArray<ArticleSummary> {
	return index.filter(
		(a) => a.topic === topic && a.locale === locale && (brand === undefined || a.brand === brand),
	);
}

/** One article's summary in one locale, when it is readable and visible. */
export function summaryFor(
	slug: string,
	locale: Locale,
	index: ReadonlyArray<ArticleSummary> = INDEX,
): ArticleSummary | undefined {
	return index.find((a) => a.slug === slug && a.locale === locale);
}
