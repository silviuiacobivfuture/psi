import { z } from "zod";
import type { Brand } from "./brands";

type Env = Readonly<Record<string, string | undefined>>;

const Origin = z
	.string()
	.url()
	.transform((s) => s.replace(/\/+$/, ""));

/** Where each estate site answers. Absolute, without a trailing slash. */
export const OriginsSchema = z.object({
	blog: Origin,
	psizone: Origin,
	eqsync: Origin,
	hemisync: Origin,
});
export type Origins = z.infer<typeof OriginsSchema>;

/**
 * The sites' origins from the environment. Local defaults are the dev ports of blog-web,
 * psizone-web, eqsync-web and hemisync-web; deployments set BLOG_URL, PSIZONE_URL, EQSYNC_URL and
 * HEMISYNC_URL (live blog: https://blog.psizone.ro).
 */
export function originsFrom(env: Env): Origins {
	return OriginsSchema.parse({
		blog: env.BLOG_URL ?? "http://localhost:4340",
		psizone: env.PSIZONE_URL ?? "http://localhost:4310",
		eqsync: env.EQSYNC_URL ?? "http://localhost:4320",
		hemisync: env.HEMISYNC_URL ?? "http://localhost:4330",
	});
}

const SiteEnv = z.enum(["production", "staging"]);

/**
 * Whether unreviewed drafts may be shown. `SITE_ENV` decides when it is set. Unset, a host that
 * may be indexed (`PSI_ALLOW_INDEXING=true`, production) never shows drafts, and every other host
 * (staging and local, all noindex) does, so the owner can review them where they will live.
 */
export function includeDraftsFrom(env: Env): boolean {
	const parsed = SiteEnv.safeParse(env.SITE_ENV);
	if (parsed.success) return parsed.data === "staging";
	return env.PSI_ALLOW_INDEXING !== "true";
}

/** This process's origins and draft policy, read once at boot. */
export const ORIGINS: Origins = originsFrom(process.env);
export const INCLUDE_DRAFTS: boolean = includeDraftsFrom(process.env);

/** A brand's own site. */
export function siteOrigin(brand: Brand, origins: Origins = ORIGINS): string {
	return origins[brand];
}
