import { readCmsArticles } from "@psi/cms-client";
import {
	type Article,
	type ArticleSummary,
	buildIndex,
	INCLUDE_DRAFTS,
	isRetired,
	isVisible,
	ORIGINS,
	ARTICLES as REPO,
} from "@psi/content";
import { z } from "zod";

/**
 * The articles this blog shows, as one in-memory snapshot pages read synchronously.
 *
 * - `CMS_URL` unset: the repository's catalogue (@psi/content), as before.
 * - `CMS_URL` set: the CMS's articles (REST, through @psi/cms-client's contract), merged over the
 *   repository's: an article the CMS has wins on its slug; the repository's others stay until
 *   they are imported into the CMS (docs/plans/blog-platform.md). Published articles only, unless
 *   drafts may be shown here (SITE_ENV=staging; then with the read-only `CMS_API_KEY`).
 *
 * The snapshot is replaced only by a successful read, so a CMS outage keeps the last good one;
 * it refreshes every CMS_REFRESH_SECONDS and at once when the CMS's webhook says so.
 */
const Env = z.object({
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
	CMS_API_KEY: z.string().min(1).optional(),
	CMS_REFRESH_SECONDS: z.coerce.number().int().min(10).max(86_400).default(300),
	/**
	 * `false` retires the repository's catalogue: the CMS alone is the source. Default `true`
	 * until the CMS serves every article (docs/plans/blog-platform.md, P5).
	 */
	CMS_REPO_FALLBACK: z.enum(["true", "false"]).default("true"),
});
const env = Env.parse(
	Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== "")),
);

interface Snapshot {
	articles: ReadonlyArray<Article>;
	index: ReadonlyArray<ArticleSummary>;
	source: "repository" | "cms";
	at: Date;
}

function snapshot(articles: ReadonlyArray<Article>, source: Snapshot["source"]): Snapshot {
	// A retired brand's articles stay in the content but are served nowhere (404).
	const visible = articles.filter((a) => isVisible(a, INCLUDE_DRAFTS) && !isRetired(a.brand));
	return {
		articles: visible,
		index: buildIndex(visible, { blogOrigin: ORIGINS.blog, includeDrafts: INCLUDE_DRAFTS }),
		source,
		at: new Date(),
	};
}

/** CMS articles win on their slug; the repository's others stay, unless the fallback is retired. */
export function merge(
	cms: ReadonlyArray<Article>,
	repo: ReadonlyArray<Article>,
	fallback = true,
): Article[] {
	if (!fallback) return [...cms];
	const slugs = new Set(cms.map((a) => a.slug));
	return [...cms, ...repo.filter((a) => !slugs.has(a.slug))];
}

let current: Snapshot = snapshot(REPO, "repository");

/** Every article this blog may show right now. */
export function currentArticles(): ReadonlyArray<Article> {
	return current.articles;
}

/** The summaries of `currentArticles()` (what `related` and `latestFor` read). */
export function currentIndex(): ReadonlyArray<ArticleSummary> {
	return current.index;
}

export function contentSource(): { source: Snapshot["source"]; at: Date; cms: boolean } {
	return { source: current.source, at: current.at, cms: env.CMS_URL !== undefined };
}

/** Reads the CMS once; keeps the last good snapshot on any failure. Never throws. */
export async function refreshContent(): Promise<boolean> {
	if (env.CMS_URL === undefined) return false;
	try {
		const r = await readCmsArticles({
			cmsUrl: env.CMS_URL,
			apiKey: INCLUDE_DRAFTS ? env.CMS_API_KEY : undefined,
			drafts: INCLUDE_DRAFTS && env.CMS_API_KEY !== undefined,
		});
		for (const x of r.rejected) console.warn(`content: cms article ${x.id} refused (${x.reason})`);
		current = snapshot(merge(r.articles, REPO, env.CMS_REPO_FALLBACK === "true"), "cms");
		return true;
	} catch (err) {
		console.error(
			`content: cms unreachable, keeping the ${current.source} snapshot (${String(err)})`,
		);
		return false;
	}
}

/** The first read (bounded, so the boot never waits long), then the periodic refresh. */
export async function startContent(): Promise<void> {
	if (env.CMS_URL === undefined) return;
	await Promise.race([refreshContent(), new Promise((r) => setTimeout(r, 5000))]);
	setInterval(() => void refreshContent(), env.CMS_REFRESH_SECONDS * 1000).unref();
}

/** The CMS address and key for the preview route (null without a CMS). */
export function cmsConfig(): { cmsUrl: string; apiKey: string | undefined } | null {
	return env.CMS_URL === undefined ? null : { cmsUrl: env.CMS_URL, apiKey: env.CMS_API_KEY };
}
