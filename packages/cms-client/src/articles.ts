import type { Article } from "@psi/content";
import { z } from "zod";
import { articleFromPayload } from "./articles-map";

/**
 * Reads the CMS's articles over Payload's REST API. Anonymous requests see published articles
 * only (the CMS's access rule); a staging blog passes its API key and asks for drafts too.
 */
export interface CmsReadOptions {
	/** The CMS origin, no trailing slash: https://cms.psizone.ro (in-cluster: http://cms.cms.svc). */
	cmsUrl: string;
	/** The blog's machine user's Payload API key; needed for drafts only. */
	apiKey?: string;
	/** Latest drafts (staging, preview) rather than the published versions only. */
	drafts: boolean;
	fetch?: typeof fetch;
	/** Per request, in milliseconds. */
	timeoutMs?: number;
}

export interface CmsReadResult {
	articles: ReadonlyArray<Article>;
	/** Documents the contract refused: `{id, reason}`, field paths only. */
	rejected: ReadonlyArray<{ id: string; reason: string }>;
}

const Page = z.object({
	docs: z.array(z.unknown()),
	hasNextPage: z.boolean(),
	nextPage: z.number().nullish(),
});

function headers(o: CmsReadOptions): Record<string, string> {
	const h: Record<string, string> = { accept: "application/json" };
	if (o.apiKey !== undefined && o.apiKey !== "") h.authorization = `users API-Key ${o.apiKey}`;
	return h;
}

async function getJson(url: string, o: CmsReadOptions): Promise<unknown> {
	const f = o.fetch ?? fetch;
	const r = await f(url, { headers: headers(o), signal: AbortSignal.timeout(o.timeoutMs ?? 8000) });
	if (!r.ok) throw new Error(`cms answered ${r.status} for ${new URL(url).pathname}`);
	return r.json();
}

/** Every article the CMS lets this reader see, mapped and checked; one page of 100 at a time. */
export async function readCmsArticles(o: CmsReadOptions): Promise<CmsReadResult> {
	const articles: Article[] = [];
	const rejected: { id: string; reason: string }[] = [];
	let page = 1;
	for (let guard = 0; guard < 50; guard++) {
		const q = new URLSearchParams({
			locale: "all",
			depth: "1",
			limit: "100",
			page: String(page),
			draft: String(o.drafts),
		});
		if (!o.drafts) q.set("where[_status][equals]", "published");
		const p = Page.parse(await getJson(`${o.cmsUrl}/api/articles?${q}`, o));
		for (const raw of p.docs) {
			const m = articleFromPayload(raw, o.cmsUrl);
			if (m.ok) articles.push(m.article);
			else rejected.push({ id: m.id, reason: m.reason });
		}
		if (!p.hasNextPage || p.nextPage === null || p.nextPage === undefined) break;
		page = p.nextPage;
	}
	return { articles, rejected };
}

/** One document's latest draft, for the signed preview. */
export async function readCmsDraft(
	id: string,
	o: CmsReadOptions,
): Promise<ReturnType<typeof articleFromPayload>> {
	const q = new URLSearchParams({ locale: "all", depth: "1", draft: "true" });
	const raw = await getJson(`${o.cmsUrl}/api/articles/${encodeURIComponent(id)}?${q}`, o);
	return articleFromPayload(raw, o.cmsUrl);
}
