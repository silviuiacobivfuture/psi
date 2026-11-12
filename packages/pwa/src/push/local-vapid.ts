import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** The repository's gitignored `/.data/pwa/vapid.json`: local development's VAPID pair. */
export const LOCAL_VAPID_FILE = fileURLToPath(
	new URL("../../../../.data/pwa/vapid.json", import.meta.url),
);

/** URL-safe base64 without padding, as `web-push` writes keys. */
const B64URL = /^[A-Za-z0-9_-]+$/;

export const VapidSchema = z.object({
	/** 65-byte uncompressed P-256 point, base64url (87 characters). */
	publicKey: z.string().regex(B64URL).length(87),
	/** 32-byte scalar, base64url (43 characters). */
	privateKey: z.string().regex(B64URL).length(43),
	/** `mailto:` or `https:` contact the push services can reach. */
	subject: z.string().regex(/^(mailto:|https:\/\/)/),
});
export type Vapid = z.infer<typeof VapidSchema>;

/** The local pair, or null when absent or malformed. Never logged. */
export function readLocalVapid(file: string = LOCAL_VAPID_FILE): Vapid | null {
	if (!existsSync(file)) return null;
	try {
		const parsed = VapidSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
