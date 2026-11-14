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

describe("hemisync delivery", () => {
	it("the home page travels brotli-compressed, no-cache with an ETag, and is a 304 when unchanged", async () => {
		const { res } = await home();
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		const tag = res.headers.get("etag") ?? "";
		const again = await app.request("/", { headers: { ...BR, "if-none-match": tag } });
		expect(again.status).toBe(304);
	});

	it("links the stylesheet, Datastar and the self-hosted Fraunces and Inter by content hash, each immutable", async () => {
		const { html } = await home();
		expect(html).not.toContain("fonts.googleapis.com");
		expect(html).toContain('font-family:"Inter"');
		expect(html).not.toContain('font-family:"Manrope"');
		const paths = [
			/href="(\/assets\/app\.[0-9a-f]{12}\.css)"/.exec(html)?.[1],
			/src="(\/assets\/datastar\.[0-9a-f]{12}\.js)"/.exec(html)?.[1],
			/rel="preload" href="(\/assets\/fonts\/inter-latin\.[0-9a-f]{12}\.woff2)"/.exec(html)?.[1],
		];
		for (const path of paths) {
			expect(path).toBeDefined();
			const res = await app.request(path ?? "", { headers: BR });
			expect(res.status).toBe(200);
			expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		}
	});

	it("a hashed image is immutable and not re-encoded", async () => {
		const { html } = await home();
		const image = /(\/assets\/images\/[^" ]+\.[0-9a-f]{10}\.(?:jpg|webp|avif))/.exec(html)?.[1];
		expect(image).toBeDefined();
		const res = await app.request(image ?? "", { headers: BR });
		expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
		expect(res.headers.get("content-encoding")).toBeNull();
	});

	it("the booking page (it reads the visitor's account) stays private, no-store, with no ETag", async () => {
		const res = await app.request("/programare", { headers: BR });
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(res.headers.get("etag")).toBeNull();
	});
});
