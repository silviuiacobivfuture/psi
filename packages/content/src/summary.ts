import { z } from "zod";
import { BrandSchema } from "./brands";
import { type Locale, LocaleSchema } from "./locale";
import { articleUrl } from "./routes";
import { articleDate, IsoDate, type ReadableArticle, Slug, TopicSchema } from "./schema";

/**
 * One article in one locale, as any estate site may show it: no body, an absolute blog URL.
 * This is what crosses from the blog to Psizone, EQ-SYNC and Hemi-Sync.
 */
export const ArticleSummary = z.object({
	/** `<brand>/<slug>`: the same across locales. */
	id: z.string().min(1),
	brand: BrandSchema,
	locale: LocaleSchema,
	slug: Slug,
	title: z.string().min(1),
	standfirst: z.string().min(1),
	topic: TopicSchema,
	status: z.enum(["published", "draft"]),
	aiDrafted: z.boolean(),
	/** The date a reader sees: published, or drafted. */
	date: IsoDate,
	publishedAt: IsoDate.nullable(),
	reviewer: z.object({ name: z.string().min(1), reviewedAt: IsoDate }).nullable(),
	readingMinutes: z.number().int().min(1),
	/** The canonical, absolute URL on the blog. */
	url: z.string().url(),
});
export type ArticleSummary = z.infer<typeof ArticleSummary>;

/** Rough reading time of a body in one locale, at about 230 words a minute. */
export function readingMinutes(a: ReadableArticle, locale: Locale): number {
	const words = a.body
		.flatMap((b) => (b.type === "list" ? b.items.map((i) => i[locale]) : [b.text[locale]]))
		.join(" ")
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
	return Math.max(1, Math.round(words / 230));
}

/** The summary of a readable article in one locale, linked under the given blog origin. */
export function summarize(a: ReadableArticle, locale: Locale, blogOrigin: string): ArticleSummary {
	return ArticleSummary.parse({
		id: `${a.brand}/${a.slug}`,
		brand: a.brand,
		locale,
		slug: a.slug,
		title: a.title[locale],
		standfirst: a.standfirst[locale],
		topic: a.topic,
		status: a.status,
		aiDrafted: a.aiDrafted,
		date: articleDate(a),
		publishedAt: a.status === "published" ? a.publishedAt : null,
		reviewer:
			a.status === "published" && a.kind === "health"
				? { name: a.reviewer.name, reviewedAt: a.reviewer.reviewedAt }
				: null,
		readingMinutes: readingMinutes(a, locale),
		url: articleUrl(locale, a.slug, blogOrigin),
	});
}
