import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Clinical fields are sealed before they reach the store and opened only for a permitted caller. */
export interface FieldCrypto {
	seal(plain: string, context: string): string;
	/** Throws when the envelope was tampered with or sealed for another context (another app or record). */
	open(sealed: string, context: string): string;
}

const VERSION = "v1";

/**
 * AES-256-GCM with a key derived per context (HKDF-SHA256 over CLINIC_MASTER_KEY, from OpenBao), so a sealed value
 * moved to another app, client or record does not open. The context is also the authenticated data.
 * Envelope: `v1.<iv>.<tag>.<ciphertext>` in base64url.
 * model2 owns the final envelope format (packages/scheduling); this stays behind the port until it lands.
 */
export function createFieldCrypto(masterKeyHex: string): FieldCrypto {
	const master = Buffer.from(masterKeyHex, "hex");
	if (master.length !== 32) throw new Error("CLINIC_MASTER_KEY must be 32 bytes of hex");
	const keyFor = (context: string): Buffer =>
		Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `psi-scheduling:${context}`, 32));
	return {
		seal(plain, context) {
			const iv = randomBytes(12);
			const cipher = createCipheriv("aes-256-gcm", keyFor(context), iv);
			cipher.setAAD(Buffer.from(context));
			const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
			return [
				VERSION,
				iv.toString("base64url"),
				cipher.getAuthTag().toString("base64url"),
				body.toString("base64url"),
			].join(".");
		},
		open(sealed, context) {
			const [version, iv, tag, body] = sealed.split(".");
			if (version !== VERSION || iv === undefined || tag === undefined || body === undefined)
				throw new Error("not a sealed value");
			const decipher = createDecipheriv(
				"aes-256-gcm",
				keyFor(context),
				Buffer.from(iv, "base64url"),
			);
			decipher.setAAD(Buffer.from(context));
			decipher.setAuthTag(Buffer.from(tag, "base64url"));
			return Buffer.concat([
				decipher.update(Buffer.from(body, "base64url")),
				decipher.final(),
			]).toString("utf8");
		},
	};
}
