import {
	type AiSettingsClient,
	createAiSettingsClient,
	handleRevalidate,
	REVALIDATE_PATH,
} from "@psi/cms-client";
import type { Hono } from "hono";
import { z } from "zod";
import { beaconRoute, startAnalytics } from "./analytics/index";
import { refreshContent, startContent } from "./content/store";
import { previewRoute } from "./preview";
import { siteSettings } from "./site-settings";

/**
 * Everything this site exchanges with the shared CMS (cms.psizone.ro; locally http://localhost:4350),
 * in one place so the other three sites can copy it:
 * - POST /__cms/revalidate — the CMS's signed webhook (CMS_REVALIDATE_SECRET): an article was
 *   published, changed or withdrawn → re-read the articles; a brand's AI settings changed →
 *   forget the cached settings;
 * - GET /_preview/:token — the CMS's live preview through this blog's templates;
 * - POST /_a — the reading beacon (first-party analytics);
 * - the blog's AI settings (`aiSettings`), 60 s cache, last known, then the defaults.
 */
const Env = z.object({
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
	CMS_API_KEY: z.string().min(1).optional(),
	CMS_REVALIDATE_SECRET: z.string().min(32).optional(),
});
const env = Env.parse(
	Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== "")),
);

/** The blog's AI settings from the CMS; null when this site has no CMS key. */
export const aiSettings: AiSettingsClient | null =
	env.CMS_URL !== undefined && env.CMS_API_KEY !== undefined
		? createAiSettingsClient({
				cmsUrl: env.CMS_URL,
				apiKey: env.CMS_API_KEY,
				site: "blog",
				onError: (m) => console.warn(m),
			})
		: null;

export function registerCmsRoutes(app: Hono): void {
	app.post(REVALIDATE_PATH, (c) =>
		handleRevalidate(c.req.raw, env.CMS_REVALIDATE_SECRET, {
			articles: async () => {
				await refreshContent();
			},
			"ai-settings": (e) => {
				if (e.sites.includes("blog")) aiSettings?.invalidate();
			},
			"site-settings": async (e) => {
				if (!e.sites.includes("blog") || siteSettings === null) return;
				siteSettings.invalidate();
				await siteSettings.refresh();
			},
		}),
	);
	app.get("/_preview/:token", previewRoute);
	app.post("/_a", beaconRoute);
}

/** Before serving: the first read of the CMS (bounded), then the refresh and flush timers. */
export async function startCms(): Promise<void> {
	await startContent();
	startAnalytics();
	if (aiSettings !== null) void aiSettings.get();
}
