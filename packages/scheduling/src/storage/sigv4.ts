import { toHex } from "../crypto/base64";

/** AWS Signature Version 4 for S3 requests, over Web Crypto. */

const encoder = new TextEncoder();

async function hmac(
	key: Uint8Array<ArrayBuffer> | string,
	message: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const raw = typeof key === "string" ? encoder.encode(key) : key;
	const imported = await crypto.subtle.importKey(
		"raw",
		raw,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message)));
}

export async function sha256(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
	const bytes = typeof data === "string" ? encoder.encode(data) : data;
	return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/** URI-encodes a path segment the way S3 canonicalises it (every byte but unreserved is escaped). */
export function encodeKey(key: string): string {
	return key
		.split("/")
		.map((part) =>
			encodeURIComponent(part).replace(
				/[!'()*]/g,
				(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
			),
		)
		.join("/");
}

export interface SignInput {
	method: "GET" | "PUT" | "DELETE";
	host: string;
	/** The canonical URI: the bucket and key, already encoded. */
	path: string;
	headers: Readonly<Record<string, string>>;
	payloadHash: string;
	amzDate: string;
	region: string;
	service: string;
	accessKeyId: string;
	secretAccessKey: string;
}

/** The `Authorization` header value for the request. `x-amz-date` and `host` are signed with the rest. */
export async function authorization(input: SignInput): Promise<string> {
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(input.headers)) {
		headers[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
	}
	headers.host = input.host;
	headers["x-amz-date"] = input.amzDate;
	const names = Object.keys(headers).sort();
	const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
	const signedHeaders = names.join(";");
	const canonicalRequest = [
		input.method,
		input.path,
		"",
		canonicalHeaders,
		signedHeaders,
		input.payloadHash,
	].join("\n");
	const day = input.amzDate.slice(0, 8);
	const scope = `${day}/${input.region}/${input.service}/aws4_request`;
	const toSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, await sha256(canonicalRequest)].join(
		"\n",
	);
	const kDate = await hmac(`AWS4${input.secretAccessKey}`, day);
	const kRegion = await hmac(kDate, input.region);
	const kService = await hmac(kRegion, input.service);
	const kSigning = await hmac(kService, "aws4_request");
	const signature = toHex(await hmac(kSigning, toSign));
	return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
