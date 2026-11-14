import type { MiddlewareHandler } from "hono";
import { compressible, encode, negotiate, varyOnEncoding } from "./encoding";

/** Below this, the encoding's own framing eats most of the saving. */
export const MIN_COMPRESS_BYTES = 1024;

/**
 * Brotli (or gzip) for every text response the site sends: pages, styles, scripts, SVG, manifests, sitemaps, feeds.
 * Mounted first, so it sees every route's final response. Event streams, images, audio and fonts pass untouched, as
 * does anything already encoded (the content-hashed assets arrive pre-compressed), a partial or empty response, a
 * `no-transform`, and a body under {@link MIN_COMPRESS_BYTES}.
 */
export function compression(): MiddlewareHandler {
	return async function compress(c, next) {
		await next();
		const res = c.res;
		// A 304 stands for the 200 it replaces, which varied by encoding.
		if (res.status === 304) return varyOnEncoding(res.headers);
		if (!compressible(res.headers.get("content-type") ?? "")) return;
		varyOnEncoding(res.headers);
		if (
			c.req.method === "HEAD" ||
			res.status !== 200 ||
			res.body === null ||
			res.headers.has("content-encoding") ||
			/no-transform/i.test(res.headers.get("cache-control") ?? "")
		)
			return;
		const enc = negotiate(c.req.header("accept-encoding"));
		if (enc === null) return;
		const body = new Uint8Array(await res.arrayBuffer());
		const headers = new Headers(res.headers);
		let out = body;
		if (body.byteLength >= MIN_COMPRESS_BYTES) {
			out = await encode(body, enc, "page");
			headers.set("content-encoding", enc);
			// A strong validator names exact bytes; the encoded bytes differ, so it weakens (as nginx does).
			const etag = headers.get("etag");
			if (etag?.startsWith('"')) headers.set("etag", `W/${etag}`);
		}
		headers.set("content-length", String(out.byteLength));
		c.res = undefined;
		c.res = new Response(out, { status: res.status, statusText: res.statusText, headers });
	};
}
