import {
	type Article,
	ARTICLES as CATALOGUE,
	type DraftArticle,
	INCLUDE_DRAFTS,
	isPublished,
	isReadable,
	isVisible,
	type PublishedArticle,
	type ReadableArticle,
	readingMinutes,
	type Topic,
} from "@psi/content";
import type { BlogBrand } from "../brands";

export { isPublished, isReadable, readingMinutes };

/**
 * The articles this blog may show: published ones, backlog titles, and drafts only where drafts
 * are allowed (staging and local; never production, see `includeDraftsFrom`).
 */
export const ARTICLES: ReadonlyArray<Article> = CATALOGUE.filter((a) =>
	isVisible(a, INCLUDE_DRAFTS),
);

export function findArticle(slug: string): Article | undefined {
	return ARTICLES.find((a) => a.slug === slug);
}

/** What the index is narrowed to (`?brand=`, `?topic=`); unset means everything. */
export interface ArticleFilter {
	brand?: BlogBrand;
	topic?: Topic;
}

function matches(a: Article, f: ArticleFilter): boolean {
	return (
		(f.brand === undefined || a.brand === f.brand) && (f.topic === undefined || a.topic === f.topic)
	);
}

/** Published articles, newest first. */
export function published(f: ArticleFilter = {}): ReadonlyArray<PublishedArticle> {
	return ARTICLES.filter(isPublished)
		.filter((a) => matches(a, f))
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/** Unreviewed drafts (staging only), newest first, for the owner to review. */
export function drafts(f: ArticleFilter = {}): ReadonlyArray<DraftArticle> {
	return ARTICLES.filter((a): a is DraftArticle => a.status === "draft")
		.filter((a) => matches(a, f))
		.sort((a, b) => b.draftedAt.localeCompare(a.draftedAt) || a.slug.localeCompare(b.slug));
}

/** Articles still being written and reviewed, in backlog order. */
export function inProgress(f: ArticleFilter = {}): ReadonlyArray<Article> {
	return ARTICLES.filter((a) => a.status === "in-review")
		.filter((a) => matches(a, f))
		.sort((a, b) => (a.backlogNo ?? 99) - (b.backlogNo ?? 99));
}

/** Topics that have at least one article, in the order they first appear. */
export function usedTopics(): ReadonlyArray<Topic> {
	return [...new Set(ARTICLES.map((a) => a.topic))];
}

export type { ReadableArticle };
