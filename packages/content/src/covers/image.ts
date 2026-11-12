import { z } from "zod";

/** One encoded width of a cover. `src` is a path under the blog's origin, content-hashed. */
const Variant = z.object({ width: z.number().int().positive(), src: z.string().min(1) });

/**
 * A cover as tools/images writes it: AVIF, WebP and JPEG at responsive widths, the exact size of
 * the largest, and the dominant colour painted while it loads. Plain data, so any site can show it.
 */
export const CoverImage = z.object({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	placeholder: z.string().min(1),
	avif: z.array(Variant).min(1),
	webp: z.array(Variant).min(1),
	jpeg: z.array(Variant).min(1),
});
export type CoverImage = z.infer<typeof CoverImage>;

/** The same, read-only: what the generated manifest holds. */
export type CoverAsset = {
	readonly [K in keyof CoverImage]: CoverImage[K] extends ReadonlyArray<infer V>
		? ReadonlyArray<Readonly<V>>
		: CoverImage[K];
};

/** Where a cover comes from, as tools/images copies it from packages/design/imagery/credits.json. */
export const CoverCredit = z.object({
	title: z.string(),
	author: z.string(),
	sourceUrl: z.string().url(),
	licence: z.string(),
	licenceUrl: z.string().url(),
	attributionRequired: z.boolean(),
	modifications: z.string(),
});
export type CoverCredit = z.infer<typeof CoverCredit>;
