import { z } from "zod";
import { type ObjectStorage, StorageError } from "./port";
import { authorization, encodeKey, sha256 } from "./sigv4";

/**
 * S3-compatible object storage (the estate's own; path-style addressing), signed with SigV4 over
 * `fetch`: no SDK. Configuration comes from the environment and is parsed, never trusted.
 */
export const storageEnvSchema = z.object({
	S3_ENDPOINT: z.string().url(),
	S3_REGION: z.string().min(1).default("us-east-1"),
	S3_BUCKET: z.string().min(1),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export type S3Config = {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	timeoutMs?: number;
};

/** The S3 configuration from an environment, or the names of the variables that are wrong. */
export function readStorageEnv(
	env: Readonly<Record<string, string | undefined>>,
): { ok: true; config: S3Config } | { ok: false; invalid: ReadonlyArray<string> } {
	const parsed = storageEnvSchema.safeParse(env);
	if (!parsed.success) {
		return { ok: false, invalid: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
	}
	const e = parsed.data;
	return {
		ok: true,
		config: {
			endpoint: e.S3_ENDPOINT.replace(/\/+$/, ""),
			region: e.S3_REGION,
			bucket: e.S3_BUCKET,
			accessKeyId: e.S3_ACCESS_KEY_ID,
			secretAccessKey: e.S3_SECRET_ACCESS_KEY,
		},
	};
}

function amzDateNow(): string {
	return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function createS3Storage(config: S3Config): ObjectStorage {
	const base = new URL(config.endpoint);
	const send = async (
		operation: "put" | "get" | "delete",
		method: "GET" | "PUT" | "DELETE",
		key: string,
		body?: Uint8Array<ArrayBuffer>,
		contentType?: string,
	): Promise<Response> => {
		const path = `${base.pathname.replace(/\/+$/, "")}/${config.bucket}/${encodeKey(key)}`;
		const payloadHash = await sha256(body ?? "");
		const amzDate = amzDateNow();
		const signedHeaders: Record<string, string> = {
			"x-amz-content-sha256": payloadHash,
			...(contentType === undefined ? {} : { "content-type": contentType }),
		};
		const auth = await authorization({
			method,
			host: base.host,
			path,
			headers: signedHeaders,
			payloadHash,
			amzDate,
			region: config.region,
			service: "s3",
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		});
		try {
			return await fetch(`${base.origin}${path}`, {
				method,
				headers: { ...signedHeaders, "x-amz-date": amzDate, authorization: auth },
				...(body === undefined ? {} : { body }),
				signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
			});
		} catch {
			throw new StorageError(operation, "unreachable or too slow");
		}
	};
	return {
		async put(key, bytes, contentType) {
			const res = await send("put", "PUT", key, bytes, contentType);
			if (!res.ok) throw new StorageError("put", `HTTP ${res.status}`);
		},
		async get(key) {
			const res = await send("get", "GET", key);
			if (res.status === 404) return undefined;
			if (!res.ok) throw new StorageError("get", `HTTP ${res.status}`);
			return new Uint8Array(await res.arrayBuffer());
		},
		async delete(key) {
			const res = await send("delete", "DELETE", key);
			if (!res.ok && res.status !== 404) throw new StorageError("delete", `HTTP ${res.status}`);
		},
	};
}
