#!/usr/bin/env node
/**
 * Export everything public from a WordPress site (psizone.ro by default) into plain files.
 *
 *   node scripts/export-wordpress.mjs                 # psizone.ro → ./data/wordpress
 *   node scripts/export-wordpress.mjs --site https://eq-sync.ro --out data/eq-sync
 *   node scripts/export-wordpress.mjs --no-media      # skip downloading images/files
 *
 * Output:
 *   data/wordpress/
 *     pages/<slug>.md          Markdown body + YAML front matter (id, title, url, dates, parent, SEO)
 *     posts/<slug>.md
 *     courses/<slug>.md        LearnPress courses (if any)
 *     products/<slug>.md       WooCommerce products (if any)
 *     raw/<type>.json          The untouched API responses (rendered HTML included) — the lossless copy
 *     media/<yyyy>/<mm>/<file> Every file in the media library
 *     media-manifest.json      old URL → local path, alt text, size, mime
 *     taxonomies.json          categories, tags, product categories
 *     redirects.csv            every old URL, ready to fill with its new URL
 *     summary.json             counts and anything that failed
 *
 * Needs Node 24+ (global fetch). Deps: turndown, turndown-plugin-gfm.
 * Only reads public endpoints; no login, no writes to the site.
 */
import fs from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : dflt;
};
const SITE = opt("site", "https://psizone.ro").replace(/\/$/, "");
const OUT = path.resolve(opt("out", "data/wordpress"));
const WITH_MEDIA = !args.includes("--no-media");
const CONCURRENCY = Number(opt("concurrency", 4));
const API = `${SITE}/wp-json/wp/v2`;
const UA = "psizone-migration-export/1.0";

const failures = [];
const td = new TurndownService({
	headingStyle: "atx",
	bulletListMarker: "-",
	codeBlockStyle: "fenced",
	emDelimiter: "*",
});
td.use(gfm);
td.remove(["script", "style", "noscript", "iframe", "form", "button", "svg"]);
// Elementor wraps everything in empty divs; keep only the content.
td.addRule("emptyLinks", {
	filter: (n) => n.nodeName === "A" && !n.textContent.trim() && !n.querySelector("img"),
	replacement: () => "",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
	for (let i = 1; i <= tries; i++) {
		try {
			const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
			if (res.status === 400 || res.status === 404) return { data: null, res };
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return { data: await res.json(), res };
		} catch (e) {
			if (i === tries) {
				failures.push({ url, error: String(e) });
				return { data: null };
			}
			await sleep(800 * i);
		}
	}
}

async function getAll(endpoint, fields) {
	const out = [];
	let page = 1,
		total = 1;
	do {
		const sep = endpoint.includes("?") ? "&" : "?";
		const url = `${API}/${endpoint}${sep}per_page=100&page=${page}${fields ? `&_fields=${fields}` : ""}`;
		const { data, res } = await getJSON(url);
		if (!Array.isArray(data)) break;
		out.push(...data);
		total = Number(res?.headers.get("X-WP-TotalPages") || 1);
		page++;
	} while (page <= total);
	return out;
}

const decode = (s = "") =>
	s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#039;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ");
const yamlStr = (v) => JSON.stringify(v ?? "");
const safeSlug = (s, id) =>
	(s || `item-${id}`)
		.replace(/[^a-z0-9-]+/gi, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120) || `item-${id}`;

function toMarkdown(html = "") {
	const md = td
		.turndown(html)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	// Elementor repeats blocks for mobile/desktop: drop consecutive duplicate paragraphs.
	const blocks = md.split("\n\n");
	return blocks.filter((b, i) => b !== blocks[i - 1]).join("\n\n");
}

function frontMatter(obj) {
	return (
		"---\n" +
		Object.entries(obj)
			.filter(([, v]) => v !== undefined && v !== null && v !== "")
			.map(
				([k, v]) =>
					`${k}: ${Array.isArray(v) ? `[${v.map(yamlStr).join(", ")}]` : typeof v === "number" ? v : yamlStr(v)}`,
			)
			.join("\n") +
		"\n---\n\n"
	);
}

async function writeDocs(dir, items, extra = () => ({})) {
	await fs.mkdir(path.join(OUT, dir), { recursive: true });
	const used = new Set();
	for (const it of items) {
		let slug = safeSlug(decodeURIComponent(it.slug || ""), it.id);
		if (used.has(slug)) slug = `${slug}-${it.id}`;
		used.add(slug);
		const body = toMarkdown(it.content?.rendered || it.description || "");
		const fm = frontMatter({
			id: it.id,
			type: it.type,
			title: decode(it.title?.rendered ?? it.name ?? ""),
			url: it.link || it.permalink,
			status: it.status,
			date: it.date,
			modified: it.modified,
			parent: it.parent || undefined,
			menu_order: it.menu_order || undefined,
			seo_title: it.yoast_head_json?.title,
			seo_description: it.yoast_head_json?.description,
			featured_media: it.featured_media || undefined,
			words: body.split(/\s+/).filter(Boolean).length,
			...extra(it),
		});
		await fs.writeFile(path.join(OUT, dir, `${slug}.md`), fm + body + "\n");
	}
}

async function pool(items, n, fn) {
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < items.length) {
				const k = i++;
				await fn(items[k], k);
			}
		}),
	);
}

async function main() {
	console.log(`Exporting ${SITE} → ${OUT}`);
	await fs.mkdir(path.join(OUT, "raw"), { recursive: true });
	const save = (name, data) =>
		fs.writeFile(path.join(OUT, "raw", `${name}.json`), JSON.stringify(data, null, 2));

	const [pages, posts, categories, tags, media] = await Promise.all([
		getAll("pages?status=publish"),
		getAll("posts?status=publish"),
		getAll("categories"),
		getAll("tags"),
		getAll("media"),
	]);
	const courses = await getAll("lp_course");
	const products = await getAll("product");
	const productCats = await getAll("product_cat");
	// Store API gives prices and stock; it can be slow, so it is optional.
	const storeProducts = [];
	for (let p = 1; p < 20; p++) {
		const { data } = await getJSON(
			`${SITE}/wp-json/wc/store/v1/products?per_page=100&page=${p}`,
			2,
		);
		if (!Array.isArray(data) || !data.length) break;
		storeProducts.push(...data);
		if (data.length < 100) break;
	}
	await Promise.all([
		save("pages", pages),
		save("posts", posts),
		save("categories", categories),
		save("tags", tags),
		save("media", media),
		save("courses", courses),
		save("products", products),
		save("product_categories", productCats),
		save("store_products", storeProducts),
	]);

	const catName = (ids = [], list) =>
		ids.map((id) => decode(list.find((c) => c.id === id)?.name || String(id)));
	await writeDocs("pages", pages);
	await writeDocs("posts", posts, (p) => ({
		categories: catName(p.categories, categories),
		tags: catName(p.tags, tags),
	}));
	await writeDocs("courses", courses);
	await writeDocs("products", products, (p) => {
		const s = storeProducts.find((x) => x.id === p.id);
		return {
			product_categories: catName(p.product_cat, productCats),
			price: s ? Number(s.prices.price) / 10 ** s.prices.currency_minor_unit : undefined,
			currency: s?.prices.currency_code,
			in_stock: s?.is_in_stock,
		};
	});
	await fs.writeFile(
		path.join(OUT, "taxonomies.json"),
		JSON.stringify({ categories, tags, product_categories: productCats }, null, 2),
	);

	const manifest = [];
	if (WITH_MEDIA) {
		console.log(`Downloading ${media.length} media files…`);
		await pool(media, CONCURRENCY, async (m) => {
			const url = m.source_url;
			if (!url) return;
			const rel =
				url.split("/wp-content/uploads/")[1] || `misc/${path.basename(new URL(url).pathname)}`;
			const dest = path.join(OUT, "media", decodeURIComponent(rel));
			try {
				await fs.mkdir(path.dirname(dest), { recursive: true });
				const exists = await fs
					.stat(dest)
					.then((st) => st.size > 0)
					.catch(() => false);
				if (exists) {
					manifest.push({
						id: m.id,
						url,
						local: path.relative(OUT, dest),
						alt: m.alt_text || "",
						title: decode(m.title?.rendered),
						mime: m.mime_type,
						width: m.media_details?.width,
						height: m.media_details?.height,
						attached_to: m.post || undefined,
					});
					return;
				}
				const res = await fetch(url, { headers: { "User-Agent": UA } });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
				manifest.push({
					id: m.id,
					url,
					local: path.relative(OUT, dest),
					alt: m.alt_text || "",
					title: decode(m.title?.rendered),
					mime: m.mime_type,
					width: m.media_details?.width,
					height: m.media_details?.height,
					attached_to: m.post || undefined,
				});
			} catch (e) {
				failures.push({ url, error: String(e) });
			}
		});
	}
	await fs.writeFile(path.join(OUT, "media-manifest.json"), JSON.stringify(manifest, null, 2));

	// Point image links in the Markdown at the downloaded copies (resized variants map to their original file).
	if (manifest.length) {
		const byBase = new Map(manifest.map((m) => [m.url.replace(/\.[a-z0-9]+$/i, ""), m.local]));
		for (const dir of ["pages", "posts", "courses", "products"]) {
			let files = [];
			try {
				files = await fs.readdir(path.join(OUT, dir));
			} catch {
				continue;
			}
			for (const f of files) {
				const fp = path.join(OUT, dir, f);
				const txt = await fs.readFile(fp, "utf8");
				const out = txt.replace(/https?:\/\/[^\s)"']+\/wp-content\/uploads\/[^\s)"']+/g, (u) => {
					const base = u.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "").replace(/\.[a-z0-9]+$/i, "");
					const local = byBase.get(base);
					return local ? path.posix.join("..", local) : u;
				});
				if (out !== txt) await fs.writeFile(fp, out);
			}
		}
	}

	const rows = [
		["old_url", "type", "title", "new_url"],
		...[...pages, ...posts, ...courses, ...products].map((p) => [
			p.link,
			p.type,
			decode(p.title?.rendered || ""),
			"",
		]),
	];
	await fs.writeFile(
		path.join(OUT, "redirects.csv"),
		rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n",
	);

	const summary = {
		site: SITE,
		exported_at: new Date().toISOString(),
		counts: {
			pages: pages.length,
			posts: posts.length,
			courses: courses.length,
			products: products.length,
			media: media.length,
			media_downloaded: manifest.length,
		},
		failures,
	};
	await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
	console.log(
		JSON.stringify(summary.counts),
		failures.length ? `\n${failures.length} failures listed in summary.json` : "\nNo failures.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
