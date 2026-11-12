import { z } from "zod";
import { BrandSchema } from "./brands";
import { Localized } from "./locale";

/**
 * Article content as it will arrive from the CMS: localised fields and typed body blocks. Four
 * states, each with what it may carry:
 * - `in-review`: a backlog title only; nothing clinical is shown until a clinician approves it;
 * - `draft`: a written, unreviewed text, shown only where drafts are allowed (staging), noindex;
 * - `published` editorial: about how we work, no clinical reviewer;
 * - `published` health: a named author, a named clinical reviewer, a review date and sources.
 */
export const TOPICS = [
	"autism",
	"adhd",
	"adolescenti",
	"integrare-senzoriala",
	"logopedie",
	"qeeg",
	"anxietate-depresie",
	"editorial",
	"cum-lucram",
	"programul-eqsync",
	"explorarea-constiintei",
] as const;
export const TopicSchema = z.enum(TOPICS);
export type Topic = z.infer<typeof TopicSchema>;

export const Block = z.discriminatedUnion("type", [
	z.object({ type: z.literal("p"), text: Localized }),
	z.object({ type: z.literal("h2"), text: Localized }),
	z.object({ type: z.literal("quote"), text: Localized }),
	z.object({ type: z.literal("list"), items: z.array(Localized).min(1) }),
]);
export type Block = z.infer<typeof Block>;

export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Source = z.object({ label: Localized, href: z.string().url() });

/** The longest a standfirst may be, in words, in each locale: it answers the headline. */
export const STANDFIRST_MAX_WORDS = 60;

/** Words in a text, as a reader counts them. */
export function wordCount(text: string): number {
	return text.split(/\s+/u).filter((w) => w.length > 0).length;
}

/** A standfirst in both locales, each at most `STANDFIRST_MAX_WORDS` words. */
export const Standfirst = Localized.refine(
	(s) => wordCount(s.ro) <= STANDFIRST_MAX_WORDS && wordCount(s.en) <= STANDFIRST_MAX_WORDS,
	{ message: `a standfirst is at most ${STANDFIRST_MAX_WORDS} words in each locale` },
);

/** The article's cover image (from the CMS's media library): absolute URL and alt text. */
export const Cover = z.object({
	src: z.string().url(),
	alt: Localized,
	width: z.number().int().positive().nullable().default(null),
	height: z.number().int().positive().nullable().default(null),
});
export type Cover = z.infer<typeof Cover>;

const Base = {
	slug: Slug,
	brand: BrandSchema,
	topic: TopicSchema,
	title: Localized,
	/** Its number in the content-strategy backlog, when it comes from there. */
	backlogNo: z.number().int().min(1).max(20).nullable(),
	/** Written with an AI model. It is still a draft until a person has read and approved it. */
	aiDrafted: z.boolean().default(false),
};

/** Being written and clinically reviewed: no body, no author, no reviewer yet. */
const InReview = z.object({
	...Base,
	status: z.literal("in-review"),
	author: z.null(),
	reviewer: z.null(),
});

/**
 * Written, not yet reviewed. An AI-drafted text carries the files its facts come from
 * (`provenance`), so the reviewer can check every sentence; it has no author or reviewer until a
 * person signs it.
 */
const Draft = z
	.object({
		...Base,
		status: z.literal("draft"),
		kind: z.enum(["editorial", "health"]),
		aiDrafted: z.boolean(),
		/** ≤ 60 words; it answers the headline. */
		standfirst: Standfirst,
		draftedAt: IsoDate,
		body: z.array(Block).min(1),
		sources: z.array(Source).default([]),
		cover: Cover.nullable().default(null),
		provenance: z.array(z.string().trim().min(1)).default([]),
		author: z.null(),
		reviewer: z.null(),
	})
	.refine((d) => !d.aiDrafted || d.provenance.length > 0, {
		message: "an AI-drafted text names where its facts come from (provenance)",
		path: ["provenance"],
	});

const Person = z.object({ name: z.string().trim().min(1), credentials: Localized });

const PublishedBase = {
	...Base,
	status: z.literal("published"),
	/** ≤ 60 words; it answers the headline. */
	standfirst: Standfirst,
	publishedAt: IsoDate,
	body: z.array(Block).min(1),
	sources: z.array(Source).default([]),
	cover: Cover.nullable().default(null),
};

/** About how we work, not about health: written by the editors, no clinical reviewer. */
export const PublishedEditorial = z.object({
	...PublishedBase,
	kind: z.literal("editorial"),
	author: z.object({ team: Localized }),
	reviewer: z.null(),
});

/** A health article cannot be published without a named author, a clinical reviewer and a date. */
const PublishedHealth = z.object({
	...PublishedBase,
	kind: z.literal("health"),
	author: Person,
	reviewer: Person.extend({ reviewedAt: IsoDate }),
	sources: z.array(Source).min(1),
});

export const Article = z.union([InReview, Draft, PublishedEditorial, PublishedHealth]);
export type Article = z.infer<typeof Article>;
export type ArticleInput = z.input<typeof Article>;
export type PublishedArticle = Extract<Article, { status: "published" }>;
export type DraftArticle = Extract<Article, { status: "draft" }>;
/** An article with a body: what a page can render and an index can summarise. */
export type ReadableArticle = PublishedArticle | DraftArticle;

export function isPublished(a: Article): a is PublishedArticle {
	return a.status === "published";
}

export function isReadable(a: Article): a is ReadableArticle {
	return a.status === "published" || a.status === "draft";
}

/** The date a reader sees: when it was published, or when the draft was written. */
export function articleDate(a: ReadableArticle): string {
	return a.status === "published" ? a.publishedAt : a.draftedAt;
}
