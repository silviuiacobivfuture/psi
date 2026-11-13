import { z } from "zod";

/**
 * The service seals clinical text with `ports/crypto.ts` (AES-256-GCM, a key per context derived from
 * CLINIC_MASTER_KEY: `v1.<iv>.<tag>.<body>`, base64url). Convex stores ciphertext in the shape its validators take
 * (`encryptedValidator`: key version, IV, data; all base64) and never decrypts. These two functions are the whole
 * translation, both ways, with nothing lost: the GCM tag travels at the end of `data`.
 */
export const Encrypted = z.object({
	keyVersion: z.number().int().min(1),
	iv: z.string().min(1),
	data: z.string().min(1),
});
export type EncryptedField = z.infer<typeof Encrypted>;

const TAG_BYTES = 16;
const VERSION = "v1";

export function toEncrypted(sealed: string): EncryptedField {
	const [version, iv, tag, body] = sealed.split(".");
	if (version !== VERSION || iv === undefined || tag === undefined || body === undefined)
		throw new Error("not a sealed value");
	const data = Buffer.concat([Buffer.from(body, "base64url"), Buffer.from(tag, "base64url")]);
	return {
		keyVersion: 1,
		iv: Buffer.from(iv, "base64url").toString("base64"),
		data: data.toString("base64"),
	};
}

export function toSealed(enc: EncryptedField): string {
	if (enc.keyVersion !== 1) throw new Error("a key version this service does not hold");
	const data = Buffer.from(enc.data, "base64");
	if (data.length < TAG_BYTES) throw new Error("not a sealed value");
	const body = data.subarray(0, data.length - TAG_BYTES);
	const tag = data.subarray(data.length - TAG_BYTES);
	return [
		VERSION,
		Buffer.from(enc.iv, "base64").toString("base64url"),
		tag.toString("base64url"),
		body.toString("base64url"),
	].join(".");
}
