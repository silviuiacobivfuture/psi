import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

/** The encodings a psi site sends, in the order it prefers them. */
export type Encoding = "br" | "gzip";
const PREFERRED: ReadonlyArray<Encoding> = ["br", "gzip"];

/**
 * Text the browser reads whole: pages, styles, scripts, SVG, JSON (manifests included), XML (sitemaps, feeds).
 * Not event streams (they must flush as they go) and not images, audio, fonts: those are compressed already.
 */
const COMPRESSIBLE =
	/^(?:text\/(?:html|css|javascript|plain|xml)|application\/(?:javascript|json|manifest\+json|xml|rss\+xml|atom\+xml)|image\/svg\+xml)(?:[;\s]|$)/i;

export function compressible(contentType: string): boolean {
	return COMPRESSIBLE.test(contentType);
}

/**
 * The encoding to answer an `Accept-Encoding` with: brotli when the client takes it, else gzip, else none. A `q=0`
 * refuses that coding; `*` stands for any coding the header does not name.
 */
export function negotiate(acceptEncoding: string | undefined): Encoding | null {
	if (acceptEncoding === undefined) return null;
	const q = new Map<string, number>();
	for (const part of acceptEncoding.split(",")) {
		const [name = "", ...params] = part.trim().toLowerCase().split(";");
		if (name === "") continue;
		const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
		const value = qParam === undefined ? 1 : Number.parseFloat(qParam.slice(2));
		q.set(name, Number.isNaN(value) ? 0 : value);
	}
	for (const enc of PREFERRED) {
		const weight = q.get(enc) ?? q.get("*") ?? 0;
		if (weight > 0) return enc;
	}
	return null;
}

const br = promisify(brotliCompress);
const gz = promisify(gzip);

/**
 * `body` encoded. `level` "page" is fast enough to run per request (brotli 5, gzip 6); "asset" squeezes hardest (brotli
 * 11, gzip 9) for a file compressed once and kept.
 */
export async function encode(
	body: Uint8Array,
	enc: Encoding,
	level: "page" | "asset",
): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await run(body, enc, level));
}

function run(body: Uint8Array, enc: Encoding, level: "page" | "asset"): Promise<Buffer> {
	switch (enc) {
		case "br":
			return br(body, {
				params: {
					[constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
					[constants.BROTLI_PARAM_QUALITY]: level === "asset" ? 11 : 5,
					[constants.BROTLI_PARAM_SIZE_HINT]: body.byteLength,
				},
			});
		case "gzip":
			return gz(body, { level: level === "asset" ? 9 : 6 });
		default: {
			const never: never = enc;
			throw new Error(`unknown encoding ${String(never)}`);
		}
	}
}

/** `Vary` with `Accept-Encoding` added once: a shared cache keeps one copy per encoding. */
export function varyOnEncoding(headers: Headers): void {
	const vary = headers.get("vary");
	if (vary === null) headers.set("vary", "Accept-Encoding");
	else if (!/(^|,)\s*(accept-encoding|\*)\s*(,|$)/i.test(vary))
		headers.set("vary", `${vary}, Accept-Encoding`);
}
