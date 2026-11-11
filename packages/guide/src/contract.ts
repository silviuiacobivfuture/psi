import type { Brand, Locale, Passage, Source } from "@psi/knowledge";
import { z } from "zod";

/**
 * The knowledge contract, from `@psi/knowledge` (type-only: nothing of that package runs inside
 * the guide unless the app hands a `Knowledge` in). Whatever a `Knowledge` returns is parsed here
 * with `PassagesSchema` before the guide trusts it.
 */
export type { Brand, Knowledge, Locale, Passage, Source } from "@psi/knowledge";

export const BrandSchema: z.ZodType<Brand> = z.enum(["psizone", "eqsync", "hemisync", "blog"]);
export const LocaleSchema: z.ZodType<Locale> = z.enum(["ro", "en"]);

export const SourceSchema: z.ZodType<Source> = z.object({
	id: z.string().min(1),
	title: z.string(),
	url: z.string(),
	reviewedBy: z.string().nullable(),
	reviewedAt: z.string().nullable(),
});

export const PassageSchema: z.ZodType<Passage> = z.object({
	source: SourceSchema,
	text: z.string(),
	score: z.number(),
});

export const PassagesSchema: z.ZodType<ReadonlyArray<Passage>> = z.array(PassageSchema).readonly();
