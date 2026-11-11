import type { Hono } from "hono";

/**
 * Search engines stay out unless an environment says otherwise. Staging hosts must never be
 * indexed, so the safe state is the default: every response carries `X-Robots-Tag: noindex,
 * nofollow` and `/robots.txt` disallows everything. Production sets `PSI_ALLOW_INDEXING=true`.
 * Only then does robots.txt name the sitemap (`options.sitemap`, an absolute URL): a staging
 * host never advertises its pages.
 */
export function applyIndexingPolicy(
	app: Hono,
	env: NodeJS.ProcessEnv = process.env,
	options: { sitemap?: string } = {},
): "index" | "noindex" {
	const allow = env.PSI_ALLOW_INDEXING === "true";
	const sitemap = options.sitemap !== undefined ? `Sitemap: ${options.sitemap}\n` : "";
	app.get("/robots.txt", (c) =>
		c.text(allow ? `User-agent: *\nAllow: /\n${sitemap}` : "User-agent: *\nDisallow: /\n", 200, {
			"cache-control": "public, max-age=3600",
		}),
	);
	if (!allow) {
		app.use("*", async (c, next) => {
			await next();
			c.header("X-Robots-Tag", "noindex, nofollow");
		});
	}
	return allow ? "index" : "noindex";
}
