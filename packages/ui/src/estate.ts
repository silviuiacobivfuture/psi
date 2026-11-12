/**
 * The psi estate's four public sites. Each app resolves the canonical origin of every site from
 * the environment (parsed with zod at the app's boundary; this package ships no parser) and links
 * to the others only through what is built here: the footer's estate row and a compass group.
 * The policy is `docs/brands/linking.md`.
 *
 * A retired site (`RETIRED_SITES`, the one switch, defined in `@psi/content/retired`) stays
 * declared here, so stored data and types still parse, but it is no longer linked or required.
 */
import { isRetired, live, RETIRED_SITES } from "@psi/content/retired";

export { isRetired, live, RETIRED_SITES };

/** The sites, in the order every footer lists them. */
export const ESTATE_SITES = ["psizone", "eqsync", "hemisync", "blog"] as const;
export type EstateSite = (typeof ESTATE_SITES)[number];

/** The sites that are not retired: what is linked, listed and required at boot. */
export function liveSites(
	retired: ReadonlyArray<string> = RETIRED_SITES,
): ReadonlyArray<EstateSite> {
	return live(ESTATE_SITES, retired);
}

/** One canonical origin per site, without a trailing slash (`https://blog.psizone.ro`). */
export type EstateOrigins = Readonly<Record<EstateSite, string>>;

/** The environment variable that holds each site's canonical origin. */
export const ESTATE_ENV: Readonly<Record<EstateSite, string>> = {
	psizone: "PSIZONE_URL",
	eqsync: "EQSYNC_URL",
	hemisync: "HEMISYNC_URL",
	blog: "BLOG_URL",
};

/** Local development: the dev port of each app. Deployments override every one of them. */
export const ESTATE_LOCAL: EstateOrigins = {
	psizone: "http://localhost:4310",
	eqsync: "http://localhost:4320",
	hemisync: "http://localhost:4330",
	blog: "http://localhost:4340",
};

/**
 * The raw value for every site (the variable, or the local default), for the app to parse. In
 * production a missing variable is an error for every live site (a local default there would
 * link visitors to localhost; it once did, for the blog); a retired site's is optional.
 */
export function estateInput(
	env: NodeJS.ProcessEnv = process.env,
	retired: ReadonlyArray<string> = RETIRED_SITES,
): Record<EstateSite, string> {
	if (env.NODE_ENV === "production") {
		const missing = liveSites(retired).filter((s) => (env[ESTATE_ENV[s]] ?? "").trim() === "");
		if (missing.length > 0) {
			throw new Error(
				`estate: ${missing.map((s) => ESTATE_ENV[s]).join(", ")} must be set in production`,
			);
		}
	}
	return {
		psizone: env[ESTATE_ENV.psizone] ?? ESTATE_LOCAL.psizone,
		eqsync: env[ESTATE_ENV.eqsync] ?? ESTATE_LOCAL.eqsync,
		hemisync: env[ESTATE_ENV.hemisync] ?? ESTATE_LOCAL.hemisync,
		blog: env[ESTATE_ENV.blog] ?? ESTATE_LOCAL.blog,
	};
}

export interface EstateLink {
	site: EstateSite;
	label: string;
	href: string;
	/** The site the visitor is on. */
	current: boolean;
}

/**
 * Every site's home in the visitor's language: `localePrefix` is "" for Romanian (at the root)
 * and "/en" for English, which every site serves under the same prefix.
 */
export function estateLinks(
	origins: EstateOrigins,
	labels: Readonly<Record<EstateSite, string>>,
	current: EstateSite,
	localePrefix: string,
	retired: ReadonlyArray<string> = RETIRED_SITES,
): ReadonlyArray<EstateLink> {
	return liveSites(retired).map((site) => ({
		site,
		label: labels[site],
		href: `${origins[site]}${localePrefix || "/"}`,
		current: site === current,
	}));
}
