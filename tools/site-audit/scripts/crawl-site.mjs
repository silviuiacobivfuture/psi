#!/usr/bin/env node
/**
 * Crawl any website (WordPress or not) and save every page as clean files for auditing.
 *
 *   node scripts/crawl-site.mjs --site https://eq-sync.ro --out data/crawl/eq-sync
 *   node scripts/crawl-site.mjs --site https://www.hemi-sync.ro --out data/crawl/hemi-sync --max 800
 *   node scripts/crawl-site.mjs --site https://psizone.ro --out data/crawl/psizone      # full-page view, complements the WordPress export
 *   add --browser to render pages with Playwright when the HTML is mostly empty (JavaScript sites)
 *
 * How it finds pages: robots.txt sitemaps + /sitemap.xml + /sitemap_index.xml (nested indexes too),
 * then follows every internal link it sees, until --max pages. Same host only. Skips files (pdf, mp3, images…), but lists them.
 *
 * Output (in --out):
 *   pages/<path-slug>.md   front matter (url, status, title, meta description, canonical, h1, lang, words, json-ld types)
 *                          + the main content as Markdown (header, nav, footer, cookie bars stripped)
 *   layout/                the site's header, nav and footer text, saved once per distinct version (menus, contact data)
 *   html/<path-slug>.html  the raw HTML (lossless)
 *   pages.jsonl            one line per page: everything above plus outline (h1–h3), internal/external links, images
 *   assets.csv             every image/file URL seen, with alt text and the pages using it
 *   links.csv              every internal link (from, to, anchor text): use it to find orphans and broken links
 *   errors.csv             URLs that failed or returned 4xx/5xx
 *   summary.json           counts
 * Rerunning skips pages already saved unless --fresh.
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);
const opt = (n, d) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 ? args[i + 1] : d;
};
const SITE = new URL(opt("site", "https://eq-sync.ro"));
const ORIGIN = SITE.origin;
const HOSTS = new Set([
	SITE.host,
	SITE.host.replace(/^www\./, ""),
	`www.${SITE.host.replace(/^www\./, "")}`,
]);
const OUT = path.resolve(opt("out", `data/crawl/${SITE.host.replace(/^www\./, "")}`));
const MAX = Number(opt("max", 1500));
const CONC = Number(opt("concurrency", 3));
const FRESH = args.includes("--fresh");
const BROWSER = args.includes("--browser");
const UA = "Mozilla/5.0 (compatible; site-audit-crawler/1.0)";
const FILE_RE =
	/\.(pdf|jpe?g|png|gif|webp|svg|avif|mp3|wav|m4a|ogg|mp4|webm|mov|zip|rar|docx?|xlsx?|pptx?|css|js|json|xml|txt|ico|woff2?|ttf)(\?|$)/i;
const SKIP_RE =
	/\/(wp-admin|wp-json|wp-login|feed|xmlrpc|cart|checkout|my-account|cos|autentificare|login|logout)(\/|$)|[?&](add-to-cart|replytocom|share|orderby|filter_|s=)/i;

const td = new TurndownService({
	headingStyle: "atx",
	bulletListMarker: "-",
	codeBlockStyle: "fenced",
});
td.use(gfm);
td.remove(["script", "style", "noscript", "iframe", "svg", "form", "button"]);

const norm = (u) => {
	try {
		const x = new URL(u, ORIGIN);
		x.hash = "";
		if (!HOSTS.has(x.host)) return null;
		x.host = SITE.host;
		x.protocol = SITE.protocol;
		for (const k of [...x.searchParams.keys()])
			if (/^(utm_|fbclid|gclid|ref$|lang$)/.test(k)) x.searchParams.delete(k);
		let s = x.toString();
		if (!x.search && !s.endsWith("/") && !/\.[a-z0-9]{2,5}$/i.test(x.pathname)) s += "/";
		return s;
	} catch {
		return null;
	}
};
const slugOf = (u) => {
	const p = new URL(u).pathname.replace(/^\/|\/$/g, "") || "index";
	const q = new URL(u).search
		? `-${Buffer.from(new URL(u).search).toString("base64url").slice(0, 10)}`
		: "";
	return (
		decodeURIComponent(p)
			.replace(/[^a-z0-9ăâîșțşţ._-]+/gi, "__")
			.slice(0, 150) + q || "index"
	);
};
const csv = (rows) =>
	rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") +
	"\n";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
	for (let i = 1; i <= tries; i++) {
		try {
			const res = await fetch(url, {
				headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml" },
				redirect: "follow",
			});
			return {
				status: res.status,
				finalUrl: res.url,
				type: res.headers.get("content-type") || "",
				text: await res.text(),
				lastModified: res.headers.get("last-modified"),
			};
		} catch (e) {
			if (i === tries) return { status: 0, error: String(e) };
			await sleep(700 * i);
		}
	}
}

async function sitemapUrls() {
	const found = new Set(),
		seen = new Set();
	const queue = [
		`${ORIGIN}/sitemap.xml`,
		`${ORIGIN}/sitemap_index.xml`,
		`${ORIGIN}/wp-sitemap.xml`,
	];
	const robots = await get(`${ORIGIN}/robots.txt`, 1);
	if (robots.status === 200)
		for (const m of robots.text.matchAll(/^sitemap:\s*(\S+)/gim)) queue.unshift(m[1]);
	while (queue.length) {
		const sm = queue.shift();
		if (seen.has(sm)) continue;
		seen.add(sm);
		const r = await get(sm, 2);
		if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.text)) continue;
		const locs = [
			...r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?\s*<\/loc>/gi),
		].map((m) => m[1].trim().replace(/&amp;/g, "&"));
		if (/<sitemapindex/i.test(r.text)) queue.push(...locs);
		else
			locs.forEach((l) => {
				const n = norm(l);
				if (n) found.add(n);
			});
	}
	return { urls: [...found], sitemaps: [...seen] };
}

let browser = null;
async function render(url) {
	if (!browser) {
		const { chromium } = await import("playwright");
		browser = await chromium.launch();
	}
	const page = await browser.newPage({ userAgent: UA });
	try {
		await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
		return await page.content();
	} finally {
		await page.close();
	}
}

function extract(html, url) {
	const $ = cheerio.load(html);
	const jsonld = [];
	$('script[type="application/ld+json"]').each((_, el) => {
		try {
			const j = JSON.parse($(el).text());
			const arr = Array.isArray(j) ? j : j["@graph"] || [j];
			for (const x of arr) if (x?.["@type"]) jsonld.push([].concat(x["@type"]).join("/"));
		} catch {}
	});
	const links = [],
		external = [],
		images = [];
	$("a[href]").each((_, a) => {
		const href = $(a).attr("href");
		if (!href || /^(mailto|tel|javascript):/i.test(href)) {
			if (/^(mailto|tel):/i.test(href || "")) external.push(href);
			return;
		}
		const n = norm(href);
		const text = $(a).text().replace(/\s+/g, " ").trim().slice(0, 120);
		if (n) links.push({ to: n, text });
		else {
			try {
				external.push(new URL(href, url).toString());
			} catch {}
		}
	});
	$("img").each((_, im) => {
		const src =
			$(im).attr("src") || $(im).attr("data-src") || ($(im).attr("srcset") || "").split(" ")[0];
		if (src && !src.startsWith("data:")) {
			try {
				images.push({ src: new URL(src, url).toString(), alt: $(im).attr("alt") || "" });
			} catch {}
		}
	});
	$('[style*="background-image"]').each((_, el) => {
		const m = /url\(['"]?([^'")]+)/.exec($(el).attr("style") || "");
		if (m) {
			try {
				images.push({ src: new URL(m[1], url).toString(), alt: "(background)" });
			} catch {}
		}
	});
	const outline = [];
	$("h1,h2,h3").each((_, h) => {
		const t = $(h).text().replace(/\s+/g, " ").trim();
		if (t) outline.push(`${h.tagName.toLowerCase()}: ${t}`);
	});
	const layout = ["header", "nav", "footer"]
		.map(
			(sel) =>
				`## ${sel}\n` +
				$(sel)
					.map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
					.get()
					.join("\n"),
		)
		.join("\n\n");
	const meta = {
		title: $("title").first().text().trim(),
		description: $('meta[name="description"]').attr("content") || "",
		canonical: $('link[rel="canonical"]').attr("href") || "",
		robots: $('meta[name="robots"]').attr("content") || "",
		lang: $("html").attr("lang") || "",
		h1: $("h1").first().text().replace(/\s+/g, " ").trim(),
		og_image: $('meta[property="og:image"]').attr("content") || "",
	};
	$(
		'header, nav, footer, script, style, noscript, [role="navigation"], [class*="cookie"], [id*="cookie"], [class*="popup"], [aria-hidden="true"]',
	).remove();
	const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
	let md = td
		.turndown(main.html() || "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	const blocks = md.split("\n\n");
	md = blocks.filter((b, i) => b !== blocks[i - 1]).join("\n\n");
	return {
		meta,
		md,
		words: md
			.replace(/[#*_>\-[\]()!]/g, " ")
			.split(/\s+/)
			.filter(Boolean).length,
		outline,
		links,
		external: [...new Set(external)],
		images,
		jsonld: [...new Set(jsonld)],
		layout,
	};
}

const yaml = (o) =>
	"---\n" +
	Object.entries(o)
		.filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length))
		.map(
			([k, v]) =>
				`${k}: ${Array.isArray(v) ? JSON.stringify(v) : typeof v === "number" ? v : JSON.stringify(v)}`,
		)
		.join("\n") +
	"\n---\n\n";

async function main() {
	for (const d of ["pages", "html", "layout"])
		await fs.mkdir(path.join(OUT, d), { recursive: true });
	console.log(`Crawling ${ORIGIN} → ${OUT}`);
	const { urls: fromSitemaps, sitemaps } = await sitemapUrls();
	const queue = [norm(`${ORIGIN}/`), ...fromSitemaps].filter(Boolean);
	const inSitemap = new Set(fromSitemaps),
		seen = new Set(),
		records = [],
		errors = [],
		assets = new Map(),
		linkRows = [],
		layouts = new Map();
	const jsonlPath = path.join(OUT, "pages.jsonl");
	if (FRESH) await fs.rm(jsonlPath, { force: true });
	let jsonl = "";
	try {
		jsonl = await fs.readFile(jsonlPath, "utf8");
	} catch {}
	const done = new Map(
		jsonl
			.split("\n")
			.filter(Boolean)
			.map((l) => {
				const r = JSON.parse(l);
				return [r.url, r];
			}),
	);

	let active = 0;
	async function worker() {
		while (seen.size < MAX) {
			if (!queue.length) {
				if (!active) break;
				await sleep(100);
				continue;
			}
			const url = queue.shift();
			if (!url || seen.has(url)) continue;
			seen.add(url);
			active++;
			try {
				await visit(url);
			} finally {
				active--;
			}
		}
	}
	async function visit(url) {
		{
			if (SKIP_RE.test(url)) return;
			if (FILE_RE.test(url)) {
				if (!assets.has(url)) assets.set(url, { alt: "", pages: new Set() });
				return;
			}
			let rec = done.get(url);
			if (!rec) {
				const r = await get(url);
				if (!r.status || r.status >= 400) {
					errors.push([url, r.status, r.error || ""]);
					return;
				}
				if (!/html/i.test(r.type)) return;
				const finalUrl = norm(r.finalUrl) || url;
				if (finalUrl !== url) {
					errors.push([url, `redirect → ${finalUrl}`, ""]);
					if (!seen.has(finalUrl)) queue.push(finalUrl);
					return;
				}
				let html = r.text,
					x = extract(html, url),
					rendered = false;
				if (BROWSER && x.words < 60) {
					try {
						html = await render(url);
						x = extract(html, url);
						rendered = true;
					} catch (e) {
						errors.push([url, "render failed", String(e)]);
					}
				}
				const slug = slugOf(url);
				await fs.writeFile(path.join(OUT, "html", `${slug}.html`), html);
				const lkey = `${x.layout.length}:${x.layout.slice(0, 200)}`;
				if (!layouts.has(lkey)) {
					layouts.set(lkey, slug);
					await fs.writeFile(
						path.join(OUT, "layout", `layout-${layouts.size}.md`),
						`first seen on: ${url}\n\n${x.layout}\n`,
					);
				}
				await fs.writeFile(
					path.join(OUT, "pages", `${slug}.md`),
					yaml({
						url,
						status: r.status,
						title: x.meta.title,
						description: x.meta.description,
						canonical: x.meta.canonical,
						robots: x.meta.robots,
						h1: x.meta.h1,
						lang: x.meta.lang,
						words: x.words,
						in_sitemap: inSitemap.has(url),
						jsonld: x.jsonld,
						last_modified_header: r.lastModified || "",
						rendered,
					}) +
						x.md +
						"\n",
				);
				rec = {
					url,
					slug,
					status: r.status,
					...x.meta,
					words: x.words,
					in_sitemap: inSitemap.has(url),
					jsonld: x.jsonld,
					outline: x.outline,
					links: x.links,
					external: x.external,
					images: x.images,
					rendered,
				};
				await fs.appendFile(jsonlPath, `${JSON.stringify(rec)}\n`);
			}
			records.push(rec);
			for (const l of rec.links || []) {
				linkRows.push([url, l.to, l.text]);
				if (!seen.has(l.to)) queue.push(l.to);
			}
			for (const im of rec.images || []) {
				const a = assets.get(im.src) || { alt: im.alt, pages: new Set() };
				a.pages.add(url);
				if (!a.alt) a.alt = im.alt;
				assets.set(im.src, a);
			}
			if (records.length % 25 === 0) console.log(`  ${records.length} pages…`);
		}
	}
	await Promise.all(Array.from({ length: CONC }, worker));
	if (browser) await browser.close();

	const inbound = new Map();
	for (const [, to] of linkRows) inbound.set(to, (inbound.get(to) || 0) + 1);
	await fs.writeFile(path.join(OUT, "links.csv"), csv([["from", "to", "anchor"], ...linkRows]));
	await fs.writeFile(
		path.join(OUT, "assets.csv"),
		csv([
			["url", "alt", "used_on_pages", "count"],
			...[...assets].map(([u, a]) => [u, a.alt, [...a.pages].slice(0, 20).join(" "), a.pages.size]),
		]),
	);
	await fs.writeFile(path.join(OUT, "errors.csv"), csv([["url", "status", "detail"], ...errors]));
	const orphans = fromSitemaps.filter((u) => !inbound.get(u));
	const summary = {
		site: ORIGIN,
		crawled_at: new Date().toISOString(),
		sitemaps,
		pages: records.length,
		in_sitemap: fromSitemaps.length,
		not_in_sitemap: records.filter((r) => !r.in_sitemap).map((r) => r.url),
		orphans_in_sitemap: orphans,
		thin_pages_under_60_words: records.filter((r) => r.words < 60).map((r) => r.url),
		errors: errors.length,
		assets: assets.size,
		hit_max: seen.size >= MAX,
	};
	await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
	console.log(
		`Done: ${records.length} pages, ${assets.size} assets, ${errors.length} errors/redirects.` +
			(summary.thin_pages_under_60_words.length
				? ` ${summary.thin_pages_under_60_words.length} thin pages (try --browser if the site is built with JavaScript).`
				: ""),
	);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
