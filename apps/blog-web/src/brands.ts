import { z } from "zod";

/** The three brands the blog publishes for. */
export const BRANDS = ["psizone", "eqsync", "hemisync"] as const;
export const BrandSchema = z.enum(BRANDS);
export type BlogBrand = z.infer<typeof BrandSchema>;

const SiteConfig = z.object({
	psizone: z.string().url(),
	eqsync: z.string().url(),
	hemisync: z.string().url(),
});

/**
 * Each brand's own site: the article's one next step leads there. Local defaults match the dev
 * ports of psizone-web, eqsync-web and hemisync-web; deployments override them by environment.
 */
export const SITES: Readonly<Record<BlogBrand, string>> = SiteConfig.parse({
	psizone: process.env.PSIZONE_URL ?? "http://localhost:4310",
	eqsync: process.env.EQSYNC_URL ?? "http://localhost:4320",
	hemisync: process.env.HEMISYNC_URL ?? "http://localhost:4330",
});

/** `?brand=` on the index: a known brand filters, anything else means all brands. */
export function brandFrom(query: string | undefined): BlogBrand | undefined {
	const parsed = BrandSchema.safeParse(query);
	return parsed.success ? parsed.data : undefined;
}
