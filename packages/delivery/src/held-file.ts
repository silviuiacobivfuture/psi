import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { type Encoding, encode } from "./encoding";

/** One version of a file: its bytes, the first 12 hex of their SHA-256, and its encodings, made once and kept. */
export interface FileVersion {
	readonly body: Uint8Array<ArrayBuffer>;
	readonly hash: string;
	encoded(enc: Encoding): Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * A file read once and re-read only when it changes on disk (the stylesheet is rebuilt by `css:watch` in development).
 * Its hash is the name a page links it by; its brotli and gzip forms are squeezed hardest once per version.
 */
export function heldFile(path: string): () => FileVersion {
	let cached: { mtimeMs: number; size: number; version: FileVersion } | undefined;
	return () => {
		const { mtimeMs, size } = statSync(path);
		if (cached === undefined || cached.mtimeMs !== mtimeMs || cached.size !== size) {
			const body = new Uint8Array(readFileSync(path));
			const encodings = new Map<Encoding, Promise<Uint8Array<ArrayBuffer>>>();
			cached = {
				mtimeMs,
				size,
				version: {
					body,
					hash: createHash("sha256").update(body).digest("hex").slice(0, 12),
					encoded(enc) {
						let out = encodings.get(enc);
						if (out === undefined) {
							out = encode(body, enc, "asset");
							encodings.set(enc, out);
						}
						return out;
					},
				},
			};
		}
		return cached.version;
	};
}
