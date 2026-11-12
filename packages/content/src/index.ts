/**
 * The estate's content index: the articles every psi site may show of another. The blog renders
 * them; Psizone, EQ-SYNC and Hemi-Sync show their brand's latest and link to the blog. Until the
 * CMS serves it, the catalogue is typed modules parsed at boot.
 */
export { ARTICLES, EDITORIAL_POLICY, parseCatalogue } from "./articles/catalogue";
export { BRANDS, type Brand, BrandSchema } from "./brands";
export { longDate } from "./dates";
export { LOCALES, type Locale, LocaleSchema, Localized } from "./locale";
export {
	INCLUDE_DRAFTS,
	includeDraftsFrom,
	ORIGINS,
	type Origins,
	OriginsSchema,
	originsFrom,
	siteOrigin,
} from "./origins";
export {
	buildIndex,
	byTopic,
	INDEX,
	type IndexOptions,
	isVisible,
	latestFor,
	related,
	summaryFor,
} from "./query";
export { articleUrl, blogPaths, brandListingUrl } from "./routes";
export {
	Article,
	type ArticleInput,
	articleDate,
	Block,
	Cover,
	type DraftArticle,
	IsoDate,
	isPublished,
	isReadable,
	type PublishedArticle,
	type ReadableArticle,
	Slug,
	STANDFIRST_MAX_WORDS,
	Standfirst,
	TOPICS,
	type Topic,
	TopicSchema,
	wordCount,
} from "./schema";
export { ArticleSummary, readingMinutes, summarize } from "./summary";
