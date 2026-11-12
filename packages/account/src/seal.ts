import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sealing for the short-lived login transaction cookie, and the opaque session id. Keys are derived
 * from SESSION_SECRET with HKDF and a purpose label, so one secret never encrypts two kinds of value.
 */
export interface Sealer {
	seal(plain: string): string;
	/** null for anything tampered with, truncated, or sealed under another key or purpose. */
	open(sealed: string): string | null;
}

export function createSealer(secret: string, purpose: string): Sealer {
	const key = Buffer.from(hkdfSync("sha256", secret, "psi-account", purpose, 32));
	return {
		seal(plain) {
			const iv = randomBytes(12);
			const cipher = createCipheriv("aes-256-gcm", key, iv);
			const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
			return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
		},
		open(sealed) {
			const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
			if (iv === undefined || tag === undefined || body === undefined) return null;
			if (iv.length !== 12 || tag.length !== 16) return null;
			try {
				const decipher = createDecipheriv("aes-256-gcm", key, iv);
				decipher.setAuthTag(tag);
				return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
			} catch {
				return null;
			}
		},
	};
}

/** A new session id: 256 random bits. Only its hash is ever stored. */
export function newSessionId(): string {
	return randomBytes(32).toString("base64url");
}

/** What the store keys a session by: the cookie value is never at rest. */
export function hashSessionId(id: string): string {
	return createHash("sha256").update(id).digest("hex");
}
