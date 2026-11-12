import {
	type ArticleIndex,
	createArticleIndex,
	createOfferingsClient,
	handleRevalidate,
	type OfferingsClient,
	type PriceItem,
	priceItems,
	REVALIDATE_PATH,
} from "@psi/cms-client";
import {
	ARTICLES,
	type ArticleSummary,
	type Locale as ContentLocale,
	INCLUDE_DRAFTS,
	latestFor,
	ORIGINS,
} from "@psi/content";
import type { Hono } from "hono";
import { z } from "zod";
import { aiSettings } from "./ai-settings";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * Prices and the latest blog articles from the shared CMS (`offerings`, published only; locally http://localhost:4350). With no
 * CMS_URL, or nothing published, `prices` is empty and every page keeps its placeholder. The
 * CMS's signed webhook (CMS_REVALIDATE_SECRET) refreshes them at once; otherwise every 60 s.
 * Scheduling never reads this.
 */
const Env = z.object({
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
	CMS_REVALIDATE_SECRET: z.string().min(32).optional(),
	/** `false` retires the repository's catalogue estate-wide: the CMS alone lists articles. */
	CMS_REPO_FALLBACK: z.enum(["true", "false"]).default("true"),
});
const env = Env.parse(
	Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== "")),
);

const offerings: OfferingsClient | null =
	env.CMS_URL === undefined
		? null
		: createOfferingsClient({
				cmsUrl: env.CMS_URL,
				includeDemo: INCLUDE_DRAFTS,
				onError: (msg) => console.warn(msg),
			});
if (offerings !== null) void offerings.refresh();

/**
 * The blog's articles this site lists: the CMS's published ones over the repository's (same rule
 * as the blog), or the repository's alone without a CMS.
 */
const articles: ArticleIndex | null =
	env.CMS_URL === undefined
		? null
		: createArticleIndex({
				cmsUrl: env.CMS_URL,
				blogOrigin: ORIGINS.blog,
				repo: ARTICLES,
				fallback: env.CMS_REPO_FALLBACK === "true",
				includeDrafts: INCLUDE_DRAFTS,
				onError: (msg) => console.warn(msg),
			});
if (articles !== null) void articles.refresh();

/** This brand's newest `n` articles on the blog, in one locale (the home's blog cards). */
export function latestArticles(locale: ContentLocale, n: number): ReadonlyArray<ArticleSummary> {
	return articles === null
		? latestFor("hemisync", locale, n)
		: latestFor("hemisync", locale, n, articles.index());
}

/** This brand's published prices for the given offering slugs (all of them when none are given). */
export function prices(locale: Locale, slugs?: ReadonlyArray<string>): PriceItem[] {
	if (offerings === null) return [];
	const o = at(locale);
	const all = offerings.offeringsFor("hemisync", locale);
	const wanted = slugs === undefined ? all : all.filter((x) => slugs.includes(x.slug));
	return priceItems(wanted, locale, {
		fixed: (amount) => m.price_fixed({ amount }, o),
		range: (from, to) => m.price_range({ from, to }, o),
		from: (amount) => m.price_from({ amount }, o),
		onRequest: m.price_on_request({}, o),
		demo: m.price_demo({}, o),
	});
}

/** POST /__cms/revalidate: the CMS's signed webhook; a change to offerings re-reads them. */
export function registerCmsRevalidate(app: Hono): void {
	app.post(REVALIDATE_PATH, (c) =>
		handleRevalidate(c.req.raw, env.CMS_REVALIDATE_SECRET, {
			offerings: async () => {
				await offerings?.refresh();
			},
			articles: async () => {
				await articles?.refresh();
			},
			"ai-settings": (e) => {
				if (e.sites.includes("hemisync")) aiSettings?.invalidate();
			},
		}),
	);
}
