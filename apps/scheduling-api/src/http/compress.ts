import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import type { MiddlewareHandler } from "hono";

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** Below this a compressed answer is not worth the work (and is often larger). */
export const COMPRESS_MIN_BYTES = 1024;
/** Brotli's default (11) is for files compressed once; an API answer is compressed per request. */
const BROTLI_QUALITY = 4;
const GZIP_LEVEL = 6;

type Encoding = "br" | "gzip";

/**
 * The encoding to answer with, from `Accept-Encoding`: brotli before gzip at equal weight, never one weighted `q=0`, and
 * `*` standing for both. Undefined when the caller takes neither (the answer goes as it is).
 */
export function chooseEncoding(header: string | undefined): Encoding | undefined {
	if (header === undefined) return undefined;
	const weight = new Map<string, number>();
	for (const part of header.split(",")) {
		const [name = "", ...params] = part.trim().toLowerCase().split(";");
		const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
		const value = q === undefined ? 1 : Number(q.slice(2));
		if (name !== "") weight.set(name, Number.isFinite(value) ? value : 0);
	}
	const of = (name: Encoding): number => weight.get(name) ?? weight.get("*") ?? 0;
	const best = (["br", "gzip"] as const)
		.filter((name) => of(name) > 0)
		.sort((a, b) => of(b) - of(a))[0];
	return best;
}

/**
 * Compresses the service's answers with brotli or gzip, as the caller accepts. Event streams are never touched (they
 * must flush as they go), nor an answer already encoded, an empty one, or one under 1 KiB; every answer that could have
 * been compressed says `Vary: Accept-Encoding`, so a cache never hands one caller's encoding to another.
 */
export function compressAnswers(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		const res = c.res;
		const type = res.headers.get("content-type") ?? "";
		if (
			c.req.method === "HEAD" ||
			res.body === null ||
			res.status === 204 ||
			res.status === 304 ||
			type.startsWith("text/event-stream") ||
			res.headers.has("content-encoding")
		)
			return;
		const vary = res.headers.get("vary");
		const varied = vary === null ? "Accept-Encoding" : `${vary}, Accept-Encoding`;
		const encoding = chooseEncoding(c.req.header("accept-encoding"));
		const body = Buffer.from(await res.arrayBuffer());
		if (encoding === undefined || body.byteLength < COMPRESS_MIN_BYTES) {
			c.res = new Response(body, res);
			c.res.headers.set("vary", varied);
			return;
		}
		const packed =
			encoding === "br"
				? await brotli(body, {
						params: {
							[constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
							[constants.BROTLI_PARAM_SIZE_HINT]: body.byteLength,
						},
					})
				: await gzipped(body, { level: GZIP_LEVEL });
		// Hono copies the previous answer's headers onto the new one: they are set (and the stale length dropped) after.
		c.res = new Response(packed, res);
		c.res.headers.set("vary", varied);
		c.res.headers.set("content-encoding", encoding);
		c.res.headers.set("content-length", String(packed.byteLength));
	};
}
