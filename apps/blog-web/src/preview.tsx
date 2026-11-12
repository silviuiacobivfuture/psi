import { readCmsDraft, verifyPreview } from "@psi/cms-client";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { cmsConfig } from "./content/store";
import type { Locale } from "./i18n";
import { ArticlePage } from "./pages/article";
import { PreviewIncompletePage } from "./pages/preview-incomplete";
import { themeFrom } from "./theme";

/**
 * GET /_preview/:token — the CMS's live preview, rendered by this blog's own templates. The token
 * is signed by the CMS (PREVIEW_SECRET, shared) and names one document and one locale for a few
 * hours; the draft is read from the CMS with this blog's read-only key. Never cached, never
 * indexed, framed only by the CMS. A bad or expired token is a plain 404.
 */
const Env = z.object({
	PREVIEW_SECRET: z.string().min(32).optional(),
	CMS_URL: z
		.string()
		.url()
		.transform((u) => new URL(u).origin)
		.optional(),
});
const env = Env.parse(
	Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== "")),
);

function headers(c: Context): void {
	c.header("cache-control", "no-store");
	c.header("x-robots-tag", "noindex, nofollow");
	c.header("referrer-policy", "no-referrer");
	c.header("content-security-policy", `frame-ancestors 'self' ${env.CMS_URL ?? ""}`.trim());
}

export async function previewRoute(c: Context): Promise<Response> {
	const cms = cmsConfig();
	const claims =
		env.PREVIEW_SECRET === undefined
			? null
			: verifyPreview(c.req.param("token") ?? "", env.PREVIEW_SECRET);
	if (claims === null || cms === null) return c.notFound();
	headers(c);
	const locale: Locale = claims.locale;
	const theme = themeFrom(getCookie(c, "theme"));
	const origin = new URL(c.req.url).origin;
	try {
		const m = await readCmsDraft(claims.id, { ...cms, drafts: true });
		if (!m.ok) {
			return c.html(
				<PreviewIncompletePage locale={locale} theme={theme} origin={origin} fields={m.reason} />,
				200,
			);
		}
		return c.html(
			<ArticlePage
				article={m.article}
				locale={locale}
				theme={theme}
				origin={origin}
				previewFrom={env.CMS_URL}
			/>,
		);
	} catch (err) {
		console.error(`preview: cms read failed (${String(err)})`);
		return c.notFound();
	}
}
