import { z } from "zod";

const Origin = z
	.string()
	.url()
	.transform((u) => new URL(u).origin);

const Env = z.object({
	NODE_ENV: z.string().optional(),
	/** Shared by the CMS and the four sites (OpenBao `secret/apps/control`): signs every control call. */
	PSI_CONTROL_SECRET: z.string().min(32).optional(),
	/** The control plane's PUBLIC origin, where `/admin` sends staff (CMS_URL may be in-cluster). */
	PSI_ADMIN_URL: Origin.optional(),
	/** The CMS as this server reaches it (asked whether a signed-in person is staff). */
	CMS_URL: Origin.optional(),
});

export interface SiteControlEnv {
	secret: string | null;
	adminUrl: string;
	cmsUrl: string | null;
}

/** The live control plane; a workstation's is the local CMS. */
export const PRODUCTION_ADMIN = "https://cms.psizone.ro";
export const LOCAL_ADMIN = "http://localhost:4350";

/**
 * The control settings, every one optional: without `PSI_CONTROL_SECRET` the `/__control` routes
 * answer 503 and the Compass shows no Administrare link; `/admin` always redirects.
 */
export function readSiteControlEnv(
	env: Readonly<Record<string, string | undefined>>,
): SiteControlEnv {
	const e = Env.parse(
		Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== "")),
	);
	return {
		secret: e.PSI_CONTROL_SECRET ?? null,
		adminUrl: e.PSI_ADMIN_URL ?? (e.NODE_ENV === "production" ? PRODUCTION_ADMIN : LOCAL_ADMIN),
		cmsUrl: e.CMS_URL ?? null,
	};
}
