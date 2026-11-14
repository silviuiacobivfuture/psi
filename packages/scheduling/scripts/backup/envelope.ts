import {
	constants,
	createCipheriv,
	createDecipheriv,
	createHash,
	createPrivateKey,
	createPublicKey,
	privateDecrypt,
	publicEncrypt,
	randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

/**
 * A backup file sealed for the holder of ONE private key: a fresh AES-256-GCM key per file, wrapped with the backup
 * key pair's RSA public key (OAEP, SHA-256). The job that writes a backup holds only the public key, so a stolen job or
 * bucket reveals nothing; the private key lives in OpenBao and in the workstation escrow.
 *
 * Layout: 4-byte big-endian header length, the header (JSON), the ciphertext, the 16-byte GCM tag.
 */
export const FORMAT = "psi-backup/1";
const TAG_BYTES = 16;

const Header = z.object({
	format: z.literal(FORMAT),
	alg: z.literal("RSA-OAEP-256+A256GCM"),
	/** Which key pair sealed it: the first 16 hex of the SHA-256 of the public key (SPKI DER). */
	key: z.string().regex(/^[0-9a-f]{16}$/),
	wrapped: z.string().min(1),
	iv: z.string().min(1),
});
export type Header = z.infer<typeof Header>;

export class EnvelopeError extends Error {
	override readonly name = "EnvelopeError";
}

/** The key pair's fingerprint, from either half. */
export function keyFingerprint(pem: string): string {
	const der = createPublicKey(pem).export({ type: "spki", format: "der" });
	return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export interface Sealed {
	key: string;
	bytes: number;
	plainSha256: string;
	sealedSha256: string;
}

/** Hashes what passes through, unchanged. */
function hashing(hash: ReturnType<typeof createHash>, count: { n: number }): Transform {
	return new Transform({
		transform(chunk: Buffer, _enc, done) {
			hash.update(chunk);
			count.n += chunk.length;
			done(null, chunk);
		},
	});
}

/** Seals `input` into `output` for the public key's holder. */
export async function sealFile(input: string, output: string, publicPem: string): Promise<Sealed> {
	const pub = createPublicKey(publicPem);
	if (pub.asymmetricKeyType !== "rsa") throw new EnvelopeError("the backup key must be RSA");
	const aes = randomBytes(32);
	const iv = randomBytes(12);
	const header: Header = {
		format: FORMAT,
		alg: "RSA-OAEP-256+A256GCM",
		key: keyFingerprint(publicPem),
		wrapped: publicEncrypt(
			{ key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
			aes,
		).toString("base64"),
		iv: iv.toString("base64"),
	};
	const head = Buffer.from(JSON.stringify(header), "utf8");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(head.length);
	const cipher = createCipheriv("aes-256-gcm", aes, iv);
	cipher.setAAD(head);
	const plainHash = createHash("sha256");
	const plain = { n: 0 };
	const sealedHash = createHash("sha256");
	const out = createWriteStream(output, { mode: 0o600 });
	const prefix = Buffer.concat([len, head]);
	sealedHash.update(prefix);
	out.write(prefix);
	await pipeline(
		createReadStream(input),
		hashing(plainHash, plain),
		cipher,
		hashing(sealedHash, { n: 0 }),
		out,
		{ end: false },
	);
	const tag = cipher.getAuthTag();
	sealedHash.update(tag);
	await new Promise<void>((resolve, reject) => {
		out.end(tag, () => resolve());
		out.on("error", reject);
	});
	return {
		key: header.key,
		bytes: plain.n,
		plainSha256: plainHash.digest("hex"),
		sealedSha256: sealedHash.digest("hex"),
	};
}

/** Reads the header of a sealed file without opening it. */
export async function readHeader(path: string): Promise<{ header: Header; start: number }> {
	const fh = await open(path, "r");
	try {
		const len = Buffer.alloc(4);
		if ((await fh.read(len, 0, 4, 0)).bytesRead !== 4)
			throw new EnvelopeError("not a sealed backup");
		const n = len.readUInt32BE();
		if (n === 0 || n > 64 * 1024) throw new EnvelopeError("not a sealed backup");
		const head = Buffer.alloc(n);
		if ((await fh.read(head, 0, n, 4)).bytesRead !== n) throw new EnvelopeError("truncated header");
		let parsed: unknown;
		try {
			parsed = JSON.parse(head.toString("utf8"));
		} catch {
			throw new EnvelopeError("not a sealed backup");
		}
		const header = Header.safeParse(parsed);
		if (!header.success)
			throw new EnvelopeError(`unknown header: ${header.error.issues[0]?.message ?? ""}`);
		return { header: header.data, start: 4 + n };
	} finally {
		await fh.close();
	}
}

/**
 * Opens a sealed file with the private key into `output`. The plaintext is written beside it and renamed into place
 * only once the tag checks, so a damaged or altered file leaves no output at all.
 */
export async function openFile(
	input: string,
	output: string,
	privatePem: string,
): Promise<{ bytes: number }> {
	const priv = createPrivateKey(privatePem);
	const { header, start } = await readHeader(input);
	if (keyFingerprint(privatePem) !== header.key)
		throw new EnvelopeError(`sealed for key ${header.key}, not for this one`);
	const size = (await stat(input)).size;
	const end = size - TAG_BYTES;
	if (end < start) throw new EnvelopeError("truncated");
	const tag = Buffer.alloc(TAG_BYTES);
	const fh = await open(input, "r");
	try {
		await fh.read(tag, 0, TAG_BYTES, end);
	} finally {
		await fh.close();
	}
	let aes: Buffer;
	try {
		aes = privateDecrypt(
			{ key: priv, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
			Buffer.from(header.wrapped, "base64"),
		);
	} catch {
		throw new EnvelopeError("the file key does not open with this private key");
	}
	const decipher = createDecipheriv("aes-256-gcm", aes, Buffer.from(header.iv, "base64"));
	const head = Buffer.alloc(start - 4);
	const hfh = await open(input, "r");
	try {
		await hfh.read(head, 0, head.length, 4);
	} finally {
		await hfh.close();
	}
	decipher.setAAD(head);
	decipher.setAuthTag(tag);
	const partial = `${output}.partial`;
	const count = { n: 0 };
	try {
		await pipeline(
			end > start ? createReadStream(input, { start, end: end - 1 }) : [],
			decipher,
			hashing(createHash("sha256"), count),
			createWriteStream(partial, { mode: 0o600 }),
		);
	} catch {
		await rm(partial, { force: true });
		throw new EnvelopeError("the file is damaged or was altered (authentication failed)");
	}
	await rename(partial, output);
	return { bytes: count.n };
}
