import { z } from "zod";
import { BrandSchema } from "../brands";
import type { Locale } from "../i18n";

/**
 * Article content as it will arrive from the CMS: localised fields, typed body blocks. Interface
 * text goes through Paraglide; this is content, so it carries its own `ro` and `en`.
 */
export const Localized = z.object({ ro: z.string().trim().min(1), en: z.string().trim().min(1) });
export type Localized = z.infer<typeof Localized>;

export function pick(text: Localized, locale: Locale): string {
	return text[locale];
}

export const TOPICS = [
	"autism",
	"adhd",
	"adolescenti",
	"integrare-senzoriala",
	"logopedie",
	"qeeg",
	"anxietate-depresie",
	"editorial",
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

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Base = {
	slug: Slug,
	brand: BrandSchema,
	topic: TopicSchema,
	title: Localized,
	/** Its number in the content-strategy backlog, when it comes from there. */
	backlogNo: z.number().int().min(1).max(20).nullable(),
};

/**
 * Being written and clinically reviewed. It carries no body, no author and no reviewer yet:
 * nothing clinical may be shown until a named clinician has approved it.
 */
const InReview = z.object({
	...Base,
	status: z.literal("in-review"),
	author: z.null(),
	reviewer: z.null(),
});

const Person = z.object({ name: z.string().trim().min(1), credentials: Localized });

const PublishedBase = {
	...Base,
	status: z.literal("published"),
	/** ≤ 60 words; it answers the headline. */
	standfirst: Localized,
	publishedAt: IsoDate,
	body: z.array(Block).min(1),
	sources: z.array(z.object({ label: Localized, href: z.string().url() })).default([]),
};

/** About how we work, not about health: written by the editors, no clinical reviewer. */
const PublishedEditorial = z.object({
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
	sources: z.array(z.object({ label: Localized, href: z.string().url() })).min(1),
});

export const Article = z.union([InReview, PublishedEditorial, PublishedHealth]);
export type Article = z.infer<typeof Article>;
export type PublishedArticle = Extract<Article, { status: "published" }>;
