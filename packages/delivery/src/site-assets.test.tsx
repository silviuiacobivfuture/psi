/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMMUTABLE, SHORT } from "./caching";
import { type SiteAssets, siteAssets } from "./site-assets";

let dir: string;
let css: string;
let assets: SiteAssets;
let app: Hono;
const CSS = `:root{--x:1}${".a{color:red}".repeat(400)}`;
const BR = { "accept-encoding": "br, gzip" };

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "psi-delivery-"));
	css = join(dir, "public/assets/app.css");
	mkdirSync(join(dir, "public/assets/images"), { recursive: true });
	mkdirSync(join(dir, "public/images/old-site"), { recursive: true });
	writeFileSync(css, CSS);
	writeFileSync(join(dir, "public/assets/images/hero-480.4d58afe377.webp"), new Uint8Array(3000));
	writeFileSync(join(dir, "public/images/old-site/team.webp"), new Uint8Array(3000));
	writeFileSync(join(dir, "public/favicon.svg"), `<svg>${"<g/>".repeat(400)}</svg>`);
	assets = siteAssets({
		stylesheet: css,
		publicRoot: join(dir, "public"),
		fonts: ["fraunces", "manrope"],
		preload: ["fraunces-latin.woff2", "manrope-latin.woff2"],
	});
	app = new Hono();
	assets.mount(app);
	app.get("/", (c) =>
		c.html(
			<html lang="ro">
				<head>
					<assets.Head />
				</head>
				<body>{"<p>pagină</p>".repeat(200)}</body>
			</html>,
		),
	);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const html = async (): Promise<string> => await (await app.request("/")).text();

describe("content-hashed links", () => {
	it("a page links the stylesheet and Datastar by a 12-hex content hash", async () => {
		const page = await html();
		expect(assets.path("app.css")).toMatch(/^\/assets\/app\.[0-9a-f]{12}\.css$/);
		expect(assets.path("datastar.js")).toMatch(/^\/assets\/datastar\.[0-9a-f]{12}\.js$/);
		expect(page).toContain(`href="${assets.path("app.css")}"`);
		expect(page).toContain(`src="${assets.path("datastar.js")}"`);
	});

	it("the hash changes when the file's content changes, and only then", () => {
		const before = assets.path("app.css");
		expect(assets.path("app.css")).toBe(before);
		writeFileSync(css, `${CSS}.b{color:blue}`);
		// Same second on a coarse clock: the size differs, which is enough to re-read.
		const after = assets.path("app.css");
		expect(after).not.toBe(before);
		writeFileSync(css, CSS);
		utimesSync(css, new Date(), new Date(Date.now() + 5000));
		expect(assets.path("app.css")).toBe(before);
		expect(assets.path("datastar.js")).toBe(assets.path("datastar.js"));
	});
});

describe("asset headers", () => {
	it("a hashed stylesheet is immutable for a year, brotli-encoded once and decodes to the file", async () => {
		const res = await app.request(assets.path("app.css"), { headers: BR });
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("vary")).toBe("Accept-Encoding");
		const body = Buffer.from(await res.arrayBuffer());
		expect(Number(res.headers.get("content-length"))).toBe(body.byteLength);
		expect(brotliDecompressSync(body).toString()).toBe(CSS);
	});

	it("Datastar hashed is immutable, gzip for a gzip-only client, identity for none", async () => {
		const gz = await app.request(assets.path("datastar.js"), {
			headers: { "accept-encoding": "gzip" },
		});
		expect(gz.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(gz.headers.get("content-encoding")).toBe("gzip");
		const plain = await app.request(assets.path("datastar.js"));
		expect(plain.headers.get("content-encoding")).toBeNull();
		expect(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()).toBe(await plain.text());
	});

	it("an old hash gets today's file, briefly cached; an unknown hashed name is not served", async () => {
		const stale = await app.request("/assets/app.000000000000.css");
		expect(stale.status).toBe(200);
		expect(stale.headers.get("cache-control")).toBe(SHORT);
		expect(await stale.text()).toBe(CSS);
		expect((await app.request("/assets/nope.000000000000.js")).status).toBe(404);
	});

	it("the plain names answer briefly cached with an ETag, and a 304 when unchanged", async () => {
		const plain = await app.request("/assets/app.css");
		expect(plain.headers.get("cache-control")).toBe(SHORT);
		const tag = plain.headers.get("etag") ?? "";
		expect(tag).toMatch(/^"[0-9a-f]{12}"$/);
		const again = await app.request("/assets/app.css", {
			headers: { ...BR, "if-none-match": tag },
		});
		expect(again.status).toBe(304);
		expect(await again.text()).toBe("");
		expect(again.headers.get("vary")).toBe("Accept-Encoding");
	});

	it("a hashed image is immutable and never re-encoded", async () => {
		const res = await app.request("/assets/images/hero-480.4d58afe377.webp", { headers: BR });
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(res.headers.get("content-type")).toBe("image/webp");
		expect(res.headers.get("content-encoding")).toBeNull();
		expect((await res.arrayBuffer()).byteLength).toBe(3000);
	});

	it("an unhashed image is kept briefly and revalidated by ETag", async () => {
		const res = await app.request("/images/old-site/team.webp");
		expect(res.headers.get("cache-control")).toBe(SHORT);
		const tag = res.headers.get("etag") ?? "";
		expect(tag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
		const again = await app.request("/images/old-site/team.webp", {
			headers: { "if-none-match": tag },
		});
		expect(again.status).toBe(304);
	});

	it("the favicon (SVG) is compressed, briefly cached", async () => {
		const res = await app.request("/favicon.svg", { headers: BR });
		expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("cache-control")).toBe(SHORT);
	});

	it("a page is compressed, no-cache with an ETag", async () => {
		const res = await app.request("/", { headers: BR });
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		expect(res.headers.get("etag")).toMatch(/^W\//);
	});
});

describe("fonts", () => {
	const faceUrls = (page: string): string[] =>
		[...page.matchAll(/url\((\/assets\/fonts\/[^)]+)\)/g)].map((m) => m[1] ?? "");

	it("every face of the site's families is declared with font-display: swap and a hashed URL", async () => {
		const page = await html();
		const urls = faceUrls(page);
		// Fraunces roman and italic, Manrope; each in Latin and Latin Extended.
		expect(urls).toHaveLength(6);
		for (const url of urls) expect(url).toMatch(/^\/assets\/fonts\/[a-z-]+\.[0-9a-f]{12}\.woff2$/);
		expect(page.match(/font-display:swap/g)).toHaveLength(6);
		expect(page).toContain('font-family:"Fraunces";font-style:italic');
		expect(page).not.toContain("fonts.googleapis.com");
		expect(page).not.toContain("Inter");
	});

	it("only the faces named are preloaded, as fonts, with crossorigin", async () => {
		const page = await html();
		const preloads = [...page.matchAll(/<link rel="preload"[^>]*>/g)].map((m) => m[0]);
		expect(preloads).toHaveLength(2);
		for (const p of preloads) {
			expect(p).toContain('as="font"');
			expect(p).toContain('type="font/woff2"');
			expect(p).toContain('crossorigin=""');
		}
		expect(preloads.join()).toMatch(/fraunces-latin\.[0-9a-f]{12}\.woff2/);
		expect(preloads.join()).toMatch(/manrope-latin\.[0-9a-f]{12}\.woff2/);
	});

	it("a font is served immutable as font/woff2, never re-encoded", async () => {
		const [url = ""] = faceUrls(await html());
		const res = await app.request(url, { headers: BR });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("font/woff2");
		expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(res.headers.get("content-encoding")).toBeNull();
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("wOF2");
	});

	it("a face the site does not use is not served", async () => {
		expect((await app.request("/assets/fonts/inter-latin.000000000000.woff2")).status).toBe(404);
	});

	it("preloading a face the site does not declare is refused at start", () => {
		expect(() =>
			siteAssets({
				stylesheet: css,
				publicRoot: join(dir, "public"),
				fonts: ["manrope"],
				preload: ["fraunces-latin.woff2"],
			}),
		).toThrow(/fraunces-latin\.woff2/);
	});
});
