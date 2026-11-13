import { createHash, createHmac } from "node:crypto";

export interface SignedLink {
	url: string;
	expiresAt: number;
}

/** Object storage for client files: the service signs short-lived URLs; the bytes never pass through it. */
export interface ObjectStore {
	signUpload(key: string, contentType: string, ttlSeconds: number): SignedLink;
	signDownload(key: string, ttlSeconds: number, fileName: string): SignedLink;
	remove(key: string): Promise<void>;
}

export interface S3Options {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	now?: () => number;
	fetch?: typeof globalThis.fetch;
}

const hmac = (key: Buffer | string, data: string): Buffer =>
	createHmac("sha256", key).update(data).digest();
const hex = (data: string): string => createHash("sha256").update(data).digest("hex");
const encode = (s: string): string =>
	encodeURIComponent(s).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);

/** S3-compatible object storage, path-style, SigV4 presigned URLs (query-string signing). */
export function createS3Store(options: S3Options): ObjectStore {
	const now = options.now ?? Date.now;
	const host = new URL(options.endpoint).host;
	const base = options.endpoint.replace(/\/+$/, "");

	function presign(
		method: "GET" | "PUT" | "DELETE",
		key: string,
		ttlSeconds: number,
		extra: Record<string, string> = {},
	): SignedLink {
		const at = new Date(now());
		const stamp = at
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d{3}/, "");
		const day = stamp.slice(0, 8);
		const scope = `${day}/${options.region}/s3/aws4_request`;
		const path = `/${options.bucket}/${key.split("/").map(encode).join("/")}`;
		const query: Record<string, string> = {
			"X-Amz-Algorithm": "AWS4-HMAC-SHA256",
			"X-Amz-Credential": `${options.accessKeyId}/${scope}`,
			"X-Amz-Date": stamp,
			"X-Amz-Expires": String(ttlSeconds),
			"X-Amz-SignedHeaders": "host",
			...extra,
		};
		const canonicalQuery = Object.keys(query)
			.sort()
			.map((k) => `${encode(k)}=${encode(query[k] ?? "")}`)
			.join("&");
		const canonical = [
			method,
			path,
			canonicalQuery,
			`host:${host}\n`,
			"host",
			"UNSIGNED-PAYLOAD",
		].join("\n");
		const toSign = ["AWS4-HMAC-SHA256", stamp, scope, hex(canonical)].join("\n");
		const signingKey = hmac(
			hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, day), options.region), "s3"),
			"aws4_request",
		);
		const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
		return {
			url: `${base}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
			expiresAt: at.getTime() + ttlSeconds * 1000,
		};
	}

	return {
		signUpload: (key, _contentType, ttl) => presign("PUT", key, ttl),
		signDownload: (key, ttl, fileName) =>
			presign("GET", key, ttl, {
				"response-content-disposition": `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
			}),
		async remove(key) {
			const link = presign("DELETE", key, 60);
			const res = await (options.fetch ?? globalThis.fetch)(link.url, {
				method: "DELETE",
				signal: AbortSignal.timeout(8000),
			});
			if (!res.ok && res.status !== 404) throw new Error(`object storage answered ${res.status}`);
		},
	};
}

export interface MemoryObjects extends ObjectStore {
	removed: string[];
}

/** Test double: links name the key and carry the method, so a test can assert what was signed. */
export function createMemoryObjects(now: () => number = Date.now): MemoryObjects {
	const removed: string[] = [];
	return {
		removed,
		signUpload: (key, _type, ttl) => ({
			url: `https://objects.test/put/${key}?ttl=${ttl}`,
			expiresAt: now() + ttl * 1000,
		}),
		signDownload: (key, ttl, name) => ({
			url: `https://objects.test/get/${key}?ttl=${ttl}&name=${encodeURIComponent(name)}`,
			expiresAt: now() + ttl * 1000,
		}),
		remove(key) {
			removed.push(key);
			return Promise.resolve();
		},
	};
}
