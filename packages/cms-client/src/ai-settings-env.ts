import { z } from "zod";
import { type AiSettingsClient, createAiSettingsClient, type Site } from "./ai-settings";

const Env = z.object({
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
	CMS_API_KEY: z.string().min(1).optional(),
});

/**
 * A site's AI-settings client from its environment (`CMS_URL` and the site's read-only
 * `CMS_API_KEY`), or null when either is missing: the site then runs without the CMS (its guide
 * falls back to `PSI_GUIDE_SETTINGS` in development, else the defaults). 60 s cache, last known on
 * failure, then the defaults; the revalidation webhook calls `invalidate`.
 */
export function aiSettingsFromEnv(
	env: Readonly<Record<string, string | undefined>>,
	site: Site,
	onError: (message: string) => void = (m) => console.warn(m),
): AiSettingsClient | null {
	const e = Env.parse(
		Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")),
	);
	if (e.CMS_URL === undefined || e.CMS_API_KEY === undefined) return null;
	return createAiSettingsClient({ cmsUrl: e.CMS_URL, apiKey: e.CMS_API_KEY, site, onError });
}
