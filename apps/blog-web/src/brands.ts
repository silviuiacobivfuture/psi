import { BRANDS, type Brand, BrandSchema, ORIGINS } from "@psi/content";

/** The three brands the blog publishes for; the list itself lives in `@psi/content`. */
export { BRANDS, BrandSchema };
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

/** `?brand=` on the index: a known brand filters, anything else means all brands. */
export function brandFrom(query: string | undefined): BlogBrand | undefined {
	const parsed = BrandSchema.safeParse(query);
	return parsed.success ? parsed.data : undefined;
}
