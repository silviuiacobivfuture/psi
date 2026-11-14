import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { app } from "./server";

/** How the site's bytes travel, as a browser meets them: compressed, linked by content hash, cached by kind. */
const BR = { "accept-encoding": "br, gzip" };
const IMMUTABLE = "public, max-age=31536000, immutable";

async function home(): Promise<{ res: Response; html: string }> {
	const res = await app.request("/", { headers: BR });
	return { res, html: brotliDecompressSync(Buffer.from(await res.arrayBuffer())).toString() };
}

describe("psizone delivery", () => {
	it("the home page travels brotli-compressed, no-cache with an ETag, and is a 304 when unchanged", async () => {
		const { res } = await home();
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		const tag = res.headers.get("etag") ?? "";
		expect(tag).toMatch(/^W\/"/);
		const again = await app.request("/", { headers: { ...BR, "if-none-match": tag } });
		expect(again.status).toBe(304);
		expect(await again.text()).toBe("");
	});

	it("links the stylesheet, Datastar and the self-hosted fonts by content hash, each immutable", async () => {
		const { html } = await home();
		expect(html).not.toContain("fonts.googleapis.com");
		const css = /href="(\/assets\/app\.[0-9a-f]{12}\.css)"/.exec(html)?.[1];
		const js = /src="(\/assets\/datastar\.[0-9a-f]{12}\.js)"/.exec(html)?.[1];
		const font = /rel="preload" href="(\/assets\/fonts\/manrope-latin\.[0-9a-f]{12}\.woff2)"/.exec(
			html,
		)?.[1];
		// The headings' face is declared (and fetched when drawn) but not preloaded.
		expect(html).toMatch(/url\(\/assets\/fonts\/fraunces-latin\.[0-9a-f]{12}\.woff2\)/);
		expect(html).not.toMatch(/rel="preload" href="\/assets\/fonts\/fraunces/);
		for (const path of [css, js, font]) {
			expect(path).toBeDefined();
			const res = await app.request(path ?? "", { headers: BR });
			expect(res.status).toBe(200);
			expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		}
		expect((await app.request(css ?? "", { headers: BR })).headers.get("content-encoding")).toBe(
			"br",
		);
		expect(
			(await app.request(font ?? "", { headers: BR })).headers.get("content-encoding"),
		).toBeNull();
	});

	it("hashed images are immutable, the old site's photographs short-lived with an ETag; neither re-encoded", async () => {
		const { html } = await home();
		const hashed = /src="(\/assets\/images\/[^"]+\.[0-9a-f]{10}\.jpg)"/.exec(html)?.[1] ?? "";
		const old = /src="(\/images\/old-site\/[^"]+\.webp)"/.exec(html)?.[1] ?? "";
		const a = await app.request(hashed, { headers: BR });
		expect(a.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(a.headers.get("content-encoding")).toBeNull();
		const b = await app.request(old, { headers: BR });
		expect(b.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
		expect(b.headers.get("etag")).not.toBeNull();
		expect(b.headers.get("content-encoding")).toBeNull();
	});

	it("the contact page (it reads the visitor's account) stays private, no-store, with no ETag", async () => {
		const res = await app.request("/contact", { headers: BR });
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(res.headers.get("etag")).toBeNull();
	});

	it("the plain stylesheet name the offline shell keeps still answers, briefly cached", async () => {
		const res = await app.request("/assets/app.css", { headers: BR });
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
	});
});
