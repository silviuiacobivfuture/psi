import { BrandSchema, IsoDate, LocaleSchema, Slug, TopicSchema } from "@psi/content";
import { z } from "zod";

/**
 * The estate's first-party reading analytics, as the blog's collector hands them to a store:
 * daily COUNTERS, never events about a person. A counter names a day, an article and what was
 * counted; there is no field for an address, a device, a referrer, an identifier or a time of day,
 * and `.strict()` refuses any extra key, so no such field can be added by accident.
 */
export const METRICS = [
	"view",
	"depth_25",
	"depth_50",
	"depth_75",
	"depth_100",
	"guide_asked",
	"guide_unanswered",
	"guide_opened",
	"guide_nudge_shown",
	"guide_nudge_clicked",
] as const;
export const MetricSchema = z.enum(METRICS);
export type Metric = z.infer<typeof MetricSchema>;

/** The read-depth thresholds a reader's scroll is bucketed into (per cent of the article). */
export const DEPTHS = [25, 50, 75, 100] as const;
export type Depth = (typeof DEPTHS)[number];

export const CounterKey = z
	.object({
		/** UTC day. */
		day: IsoDate,
		/** The article's brand; the guide's questions are counted under "blog". */
		brand: z.union([BrandSchema, z.literal("blog")]),
		/** The article; empty for site-wide counters (the guide). */
		slug: z.union([Slug, z.literal("")]),
		locale: LocaleSchema,
		topic: TopicSchema.nullable(),
		metric: MetricSchema,
	})
	.strict();
export type CounterKey = z.infer<typeof CounterKey>;

export const Counter = CounterKey.extend({
	count: z.number().int().min(1).max(1_000_000),
}).strict();
export type Counter = z.infer<typeof Counter>;

/** One flush from a collector: at most a few thousand counters. */
export const CounterBatch = z.object({ counters: z.array(Counter).min(1).max(5000) }).strict();
export type CounterBatch = z.infer<typeof CounterBatch>;

/** A stable string for a counter's key (the collector's in-memory map). */
export function counterId(k: CounterKey): string {
	return [k.day, k.brand, k.slug, k.locale, k.topic ?? "", k.metric].join("|");
}
