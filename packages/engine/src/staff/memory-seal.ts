import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Sealing for the staff assistant's conversation memory: AES-256-GCM, one key per person.
 *
 * Threads hold client names and appointment details, so they are protected like the clinical
 * fields: the stored text is a sealed envelope, never the conversation. The key of each person is
 * derived (HKDF-SHA256) from one root key with the person's resource id as context, and the same id
 * is the authenticated data, so a ciphertext copied under another person's id does not open. The
 * visitor memory has its own store and no key in common with this one.
 */

export const SEAL_PREFIX = "psi-seal:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const HexKey = z.string().regex(/^[0-9a-f]{64}$/i, "the key is 32 bytes as 64 hex characters");

/** What the memory is sealed with, and where it comes from. */
export type SealRoot = Readonly<{ key: Buffer; source: "STAFF_MEMORY_KEY" | "CLINIC_MASTER_KEY" }>;

/**
 * The root key from the environment: `STAFF_MEMORY_KEY` when set, else one derived from
 * `CLINIC_MASTER_KEY` (so the staff memory never shares bytes with the clinical key itself).
 * Undefined when neither is set; a malformed value is an error, never a silent fallback.
 */
export function sealRootFrom(
	env: Readonly<Record<string, string | undefined>>,
): SealRoot | undefined {
	const own = env.STAFF_MEMORY_KEY?.trim();
	if (own !== undefined && own !== "") {
		return { key: Buffer.from(HexKey.parse(own), "hex"), source: "STAFF_MEMORY_KEY" };
	}
	const master = env.CLINIC_MASTER_KEY?.trim();
	if (master !== undefined && master !== "") {
		const raw = Buffer.from(HexKey.parse(master), "hex");
		const derived = hkdfSync("sha256", raw, Buffer.alloc(0), "psi:staff-memory:root:v1", KEY_BYTES);
		return { key: Buffer.from(derived), source: "CLINIC_MASTER_KEY" };
	}
	return undefined;
}

export interface Sealer {
	seal(resourceId: string, plaintext: string): string;
	/** The plaintext, or undefined when the text is not a seal, or does not open for this person. */
	open(resourceId: string, sealed: string): string | undefined;
}

export function createSealer(root: Buffer): Sealer {
	if (root.length !== KEY_BYTES) throw new Error(`the staff memory key must be ${KEY_BYTES} bytes`);
	const keys = new Map<string, Buffer>();
	const keyFor = (resourceId: string): Buffer => {
		const known = keys.get(resourceId);
		if (known !== undefined) return known;
		const key = Buffer.from(
			hkdfSync(
				"sha256",
				root,
				Buffer.alloc(0),
				`psi:staff-memory:person:v1:${resourceId}`,
				KEY_BYTES,
			),
		);
		keys.set(resourceId, key);
		return key;
	};
	return {
		seal(resourceId, plaintext) {
			const iv = randomBytes(IV_BYTES);
			const cipher = createCipheriv("aes-256-gcm", keyFor(resourceId), iv, {
				authTagLength: TAG_BYTES,
			});
			cipher.setAAD(Buffer.from(resourceId));
			const body = Buffer.concat([
				cipher.update(plaintext, "utf8"),
				cipher.final(),
				cipher.getAuthTag(),
			]);
			return `${SEAL_PREFIX}${Buffer.concat([iv, body]).toString("base64url")}`;
		},
		open(resourceId, sealed) {
			if (!sealed.startsWith(SEAL_PREFIX)) return undefined;
			try {
				const bytes = Buffer.from(sealed.slice(SEAL_PREFIX.length), "base64url");
				if (bytes.length < IV_BYTES + TAG_BYTES) return undefined;
				const iv = bytes.subarray(0, IV_BYTES);
				const tag = bytes.subarray(bytes.length - TAG_BYTES);
				const body = bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES);
				const decipher = createDecipheriv("aes-256-gcm", keyFor(resourceId), iv, {
					authTagLength: TAG_BYTES,
				});
				decipher.setAAD(Buffer.from(resourceId));
				decipher.setAuthTag(tag);
				return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
			} catch {
				return undefined;
			}
		},
	};
}
