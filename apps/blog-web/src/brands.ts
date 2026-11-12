import {
	BRANDS as ALL_BRANDS,
	type Brand,
	BrandSchema,
	isRetired,
	live,
	ORIGINS,
} from "@psi/content";

/**
 * The brands the blog publishes for (the filter chips, the feeds): `@psi/content`'s list without
 * the retired ones.
 */
export const BRANDS: ReadonlyArray<Brand> = live(ALL_BRANDS);
export { BrandSchema };
export type BlogBrand = Brand;

/**
 * Each brand's own site (PSIZONE_URL, EQSYNC_URL, HEMISYNC_URL; local defaults are the dev ports):
 * every article leads back there.
 */
export const SITES: Readonly<Record<BlogBrand, string>> = {
	psizone: ORIGINS.psizone,
	eqsync: ORIGINS.eqsync,
	hemisync: ORIGINS.hemisync,
};

/** `?brand=` on the index: a live brand filters, anything else (a retired one too) means all brands. */
export function brandFrom(query: string | undefined): BlogBrand | undefined {
	const parsed = BrandSchema.safeParse(query);
	return parsed.success && !isRetired(parsed.data) ? parsed.data : undefined;
}
