import type { Hono } from "hono";
import type { SeoAlternate } from "./seo-head";

export interface SitemapEntry {
	/** Absolute URL on the site's canonical origin. */
	loc: string;
	/** The language versions of this page, itself included; printed as `xhtml:link`. */
	alternates?: ReadonlyArray<SeoAlternate>;
	/** `YYYY-MM-DD`. */
	lastmod?: string;
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

function xml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);
}

/** A sitemaps.org urlset, with hreflang alternates when an entry has them. */
export function sitemapXml(entries: ReadonlyArray<SitemapEntry>): string {
	const urls = entries.map((e) => {
		const lines = [`  <url>`, `    <loc>${xml(e.loc)}</loc>`];
		if (e.lastmod !== undefined) lines.push(`    <lastmod>${xml(e.lastmod)}</lastmod>`);
		for (const a of e.alternates ?? []) {
			lines.push(
				`    <xhtml:link rel="alternate" hreflang="${xml(a.hreflang)}" href="${xml(a.href)}"/>`,
			);
		}
		lines.push("  </url>");
		return lines.join("\n");
	});
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		"</urlset>",
		"",
	].join("\n");
}

const NOT_PAGES = new Set(["/healthz", "/robots.txt", "/sitemap.xml"]);

/**
 * The candidate page paths of an app: its GET routes without parameters or wildcards, minus
 * health, robots, the sitemap, assets and anything with a file extension. Read when the sitemap
 * is requested, so a page another change adds is listed without touching the sitemap.
 */
export function pagePaths(app: Hono): string[] {
	const paths = app.routes
		.filter((r) => r.method === "GET")
		.map((r) => r.path.replace(/\/+$/, "") || "/")
		.filter(
			(p) =>
				!p.includes(":") &&
				!p.includes("*") &&
				!NOT_PAGES.has(p) &&
				!p.startsWith("/assets/") &&
				!/\.[a-z0-9]+$/i.test(p),
		);
	return [...new Set(paths)];
}

function decodeEntities(text: string): string {
	return text
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

/** One rendered page as its own `<head>` describes it (what `SeoHead` printed). */
export function describedEntry(html: string): SitemapEntry | undefined {
	const head = html.slice(0, Math.max(0, html.indexOf("</head>")));
	if (/<meta name="robots" content="[^"]*noindex/.test(head)) return undefined;
	const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1];
	if (canonical === undefined) return undefined;
	const alternates = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
		.map(([, hreflang, href]) => ({ hreflang: hreflang ?? "", href: decodeEntities(href ?? "") }))
		.filter((a) => a.hreflang !== "" && a.href !== "");
	return {
		loc: decodeEntities(canonical),
		alternates: alternates.length > 1 ? alternates : undefined,
	};
}

/**
 * The sitemap entries of the given paths, asked of the app in-process. Only pages that answer
 * `200` with HTML, carry a canonical and are not `noindex` are kept, so redirects (old slugs kept
 * for links), placeholders that 404, feeds and drafts drop out. Each entry takes its URL and
 * hreflang alternates from the page's own head, so translated slugs pair exactly; a page whose
 * canonical points elsewhere is listed once, under that canonical.
 */
export async function servedEntries(
	app: Hono,
	paths: ReadonlyArray<string>,
): Promise<SitemapEntry[]> {
	const entries = await Promise.all(
		paths.map(async (path) => {
			const res = await app.request(path);
			const html = (res.headers.get("content-type") ?? "").startsWith("text/html");
			if (res.status !== 200 || !html) {
				await res.body?.cancel();
				return undefined;
			}
			return describedEntry(await res.text());
		}),
	);
	const seen = new Set<string>();
	return entries.filter((e): e is SitemapEntry => {
		if (e === undefined || seen.has(e.loc)) return false;
		seen.add(e.loc);
		return true;
	});
}
