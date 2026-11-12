import {
	ARTICLES,
	type Article,
	type Brand as ArticleBrand,
	type ArticleSummary,
	buildIndex,
	INCLUDE_DRAFTS,
	ORIGINS,
} from "@psi/content";
import { type ArticleFinding, type EngineArticles, fold } from "@psi/engine";
import type { Brand } from "./contract";

/**
 * Whose articles each guide may list and recommend: the one place the segregation is written.
 * A guide not in the table lists none. Psizone is clinical and never leads to Hemi-Sync (brand
 * book 3: "Psizone's guide never recommends it for clinical questions"); EQ-SYNC is a clinical
 * programme of the same practice and may also point to Psizone's; Hemi-Sync keeps to its own; the
 * blog is the shared reading space and lists all three.
 */
export const ARTICLE_POLICY: Readonly<Record<Brand, ReadonlyArray<ArticleBrand>>> = {
	psizone: ["psizone"],
	eqsync: ["eqsync", "psizone"],
	hemisync: ["hemisync"],
	blog: ["psizone", "eqsync", "hemisync"],
};

/** Words that say "articles" or "something about" and no subject. */
const FILLER = new Set(
	(
		"aveti avem ceva articole articol blog blogul postari despre pentru care mai sau vreau " +
		"unde sunt este are the any about article articles have you something post posts blogs " +
		"what which with and for"
	).split(" "),
);
const WEIGHTS = { title: 4, keywords: 3, topic: 2, faq: 2, standfirst: 1 } as const;
const FIELDS = ["title", "keywords", "topic", "faq", "standfirst"] as const;
const PREFIX = 5;

function terms(query: string): ReadonlyArray<string> {
	return fold(query)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3 && !FILLER.has(w))
		.map((w) => w.slice(0, PREFIX));
}

interface Entry {
	summary: ArticleSummary;
	fields: Readonly<Record<keyof typeof WEIGHTS, string>>;
}

function entryOf(summary: ArticleSummary, article: Article | undefined): Entry {
	const locale = summary.locale;
	const readable = article !== undefined && "faq" in article ? article : undefined;
	return {
		summary,
		fields: {
			title: fold(summary.title),
			keywords: fold(readable?.seo?.keywords[locale].join(" ") ?? ""),
			topic: fold(summary.topic),
			faq: fold(readable?.faq.map((f) => f.q[locale]).join(" ") ?? ""),
			standfirst: fold(summary.standfirst),
		},
	};
}

function score(entry: Entry, wanted: ReadonlyArray<string>): number {
	let total = 0;
	for (const word of wanted) {
		for (const field of FIELDS) {
			if (entry.fields[field].includes(word)) total += WEIGHTS[field];
		}
	}
	return total;
}

export interface PsiArticlesOptions {
	/** The catalogue; defaults to the blog's (`ARTICLES`). */
	articles?: ReadonlyArray<Article>;
	/** Where articles link to; defaults to the blog's origin. */
	blogOrigin?: string;
	/** Whether drafts are shown, as on the blog; defaults to the blog's own policy (never in production). */
	includeDrafts?: boolean;
}

/**
 * The guides' view of the blog: the articles visible on the blog right now (the blog's own
 * visibility policy), narrowed to the brands `ARTICLE_POLICY` gives the asking guide, searched
 * lexically over title, SEO keywords, topic, FAQ questions and standfirst. Metadata and links,
 * never bodies.
 */
export function psiArticles(options: PsiArticlesOptions = {}): EngineArticles {
	const catalogue = options.articles ?? ARTICLES;
	const index = buildIndex(catalogue, {
		blogOrigin: options.blogOrigin ?? ORIGINS.blog,
		includeDrafts: options.includeDrafts ?? INCLUDE_DRAFTS,
	});
	const policy = new Map<string, ReadonlyArray<string>>(Object.entries(ARTICLE_POLICY));
	const bySlug = new Map(catalogue.map((a) => [a.slug, a]));
	const entries = index.map((s) => entryOf(s, bySlug.get(s.slug)));
	return {
		find(q): ArticleFinding {
			const allowed = policy.get(q.profile) ?? [];
			const pool = entries.filter(
				(e) => e.summary.locale === q.locale && allowed.includes(e.summary.brand),
			);
			const topics = [...new Set(pool.map((e) => e.summary.topic))].sort();
			const brands = allowed.filter((b) => pool.some((e) => e.summary.brand === b));
			const wanted = terms(q.query ?? "");
			const hits = pool
				.filter((e) => q.brand === undefined || e.summary.brand === q.brand)
				.filter((e) => q.topic === undefined || e.summary.topic === q.topic)
				.map((entry) => ({ entry, points: score(entry, wanted) }))
				.filter((h) => wanted.length === 0 || h.points > 0);
			// Keeps the index's order (newest first) among equals: sort is stable.
			hits.sort((a, b) => b.points - a.points);
			return {
				total: hits.length,
				articles: hits.slice(0, q.limit).map(({ entry: { summary: s } }) => ({
					title: s.title,
					standfirst: s.standfirst,
					topic: s.topic,
					brand: s.brand,
					url: s.url,
					readingMinutes: s.readingMinutes,
					date: s.date,
				})),
				topics,
				brands,
			};
		},
	};
}
