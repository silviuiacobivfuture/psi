import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { compression, MIN_COMPRESS_BYTES } from "./compression";

const PAGE = `<!doctype html><title>x</title>${"<p>Bună ziua, ștrengari și țânțari.</p>".repeat(200)}`;
const bytes = (s: string): number => new TextEncoder().encode(s).byteLength;

function app(): Hono {
	const a = new Hono();
	a.use("*", compression());
	a.get("/page", (c) => c.html(PAGE));
	a.get("/tiny", (c) => c.html("<p>ok</p>"));
	a.get("/json", (c) => c.json({ items: Array.from({ length: 200 }, (_, i) => ({ i })) }));
	a.get("/svg", (c) =>
		c.body(`<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(500)}</svg>`, 200, {
			"content-type": "image/svg+xml",
		}),
	);
	a.get("/stream", (c) =>
		c.body(`data: ${"x".repeat(5000)}\n\n`, 200, { "content-type": "text/event-stream" }),
	);
	a.get("/image", (c) =>
		c.body(new Uint8Array(5000), 200, { "content-type": "image/webp", "content-length": "5000" }),
	);
	a.get("/encoded", (c) =>
		c.body(PAGE, 200, { "content-type": "text/html", "content-encoding": "br" }),
	);
	a.get("/no-transform", (c) => c.html(PAGE, 200, { "cache-control": "no-transform" }));
	a.get("/missing", (c) => c.html(PAGE, 404));
	a.get("/strong", (c) => c.html(PAGE, 200, { etag: '"abc"' }));
	a.get("/weak", (c) => c.html(PAGE, 200, { etag: 'W/"abc"' }));
	a.get("/not-modified", () => new Response(null, { status: 304, headers: { etag: '"abc"' } }));
	return a;
}

const get = (path: string, accept?: string, method = "GET") =>
	app().request(path, {
		method,
		headers: accept === undefined ? {} : { "accept-encoding": accept },
	});

describe("compression", () => {
	it("sends a page brotli-encoded when brotli is accepted, and it decodes to the page", async () => {
		const res = await get("/page", "gzip, deflate, br");
		expect(res.headers.get("content-encoding")).toBe("br");
		expect(res.headers.get("vary")).toBe("Accept-Encoding");
		const body = Buffer.from(await res.arrayBuffer());
		expect(Number(res.headers.get("content-length"))).toBe(body.byteLength);
		expect(body.byteLength).toBeLessThan(bytes(PAGE) / 5);
		expect(brotliDecompressSync(body).toString("utf8")).toBe(PAGE);
	});

	it("falls back to gzip when only gzip is accepted", async () => {
		const res = await get("/page", "gzip");
		expect(res.headers.get("content-encoding")).toBe("gzip");
		expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")).toBe(PAGE);
	});

	it("sends the page as it is when no encoding is accepted, still varying by encoding", async () => {
		for (const accept of [undefined, "identity", "br;q=0, gzip;q=0"]) {
			const res = await get("/page", accept);
			expect(res.headers.get("content-encoding")).toBeNull();
			expect(res.headers.get("vary")).toBe("Accept-Encoding");
			expect(await res.text()).toBe(PAGE);
		}
	});

	it("compresses JSON and SVG", async () => {
		for (const path of ["/json", "/svg"]) {
			const res = await get(path, "br");
			expect(res.headers.get("content-encoding")).toBe("br");
		}
	});

	it(`leaves a body under ${MIN_COMPRESS_BYTES} bytes as it is`, async () => {
		const res = await get("/tiny", "br");
		expect(res.headers.get("content-encoding")).toBeNull();
		expect(await res.text()).toBe("<p>ok</p>");
		expect(res.headers.get("content-length")).toBe(String(bytes("<p>ok</p>")));
	});

	it("never encodes an event stream, an image, or a body already encoded", async () => {
		const stream = await get("/stream", "br, gzip");
		expect(stream.headers.get("content-encoding")).toBeNull();
		expect(stream.headers.get("vary")).toBeNull();
		expect((await stream.text()).length).toBe(5008);
		const image = await get("/image", "br, gzip");
		expect(image.headers.get("content-encoding")).toBeNull();
		expect(image.headers.get("content-length")).toBe("5000");
		expect((await image.arrayBuffer()).byteLength).toBe(5000);
		const encoded = await get("/encoded", "gzip");
		expect(encoded.headers.get("content-encoding")).toBe("br");
		expect(await encoded.text()).toBe(PAGE);
	});

	it("honours no-transform, and leaves non-200 responses and HEAD alone", async () => {
		expect((await get("/no-transform", "br")).headers.get("content-encoding")).toBeNull();
		const missing = await get("/missing", "br");
		expect(missing.status).toBe(404);
		expect(missing.headers.get("content-encoding")).toBeNull();
		expect((await get("/page", "br", "HEAD")).headers.get("content-encoding")).toBeNull();
	});

	it("weakens a strong ETag on the encoded copy and keeps a weak one", async () => {
		expect((await get("/strong", "br")).headers.get("etag")).toBe('W/"abc"');
		expect((await get("/strong")).headers.get("etag")).toBe('"abc"');
		expect((await get("/weak", "br")).headers.get("etag")).toBe('W/"abc"');
	});

	it("marks a 304 as varying by encoding, like the 200 it stands for", async () => {
		const res = await get("/not-modified", "br");
		expect(res.status).toBe(304);
		expect(res.headers.get("vary")).toBe("Accept-Encoding");
	});
});
