import { z } from "zod";
import { fromBase64, toBase64, toHex } from "../crypto/base64";

/**
 * Signed, expiring, single-use links for post-appointment feedback. The token is
 * `base64url(claims).base64url(HMAC-SHA256(key, base64url(claims)))`; the claims name the app,
 * the appointment, a random id and the expiry. The signature proves the notify layer's own server
 * issued it; the store makes it single use (a row per id, marked when redeemed). The key is derived
 * from the deployment's server key under a context label, so a link signed here can never be a
 * valid signature for anything else the key signs, and no new secret has to be deployed.
 */
export const LINK_CONTEXT = "psi-scheduling/feedback-link/v1";
export const LINK_TTL_DEFAULT_HOURS = 14 * 24;
export const LINK_TTL_MIN_HOURS = 1;
export const LINK_TTL_MAX_HOURS = 90 * 24;

const claimsSchema = z.object({
	/** The app. */
	a: z.string().min(1).max(100),
	/** A random id, 128 bits, hex. */
	j: z.string().regex(/^[0-9a-f]{32}$/),
	/** What the feedback is about. */
	k: z.enum(["visit", "appointment"]),
	s: z.string().min(1).max(100),
	/** Expiry, UTC ms. */
	e: z.number().int().positive(),
});
export type LinkClaims = z.infer<typeof claimsSchema>;

export type LinkRefusal = "malformed" | "bad_signature" | "expired";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const b64url = (bytes: Uint8Array): string =>
	toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromB64url(text: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
	const padded =
		text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
	try {
		return fromBase64(padded);
	} catch {
		return undefined;
	}
}

/** The signing key derived from the deployment's server key. Fails closed on a short key. */
export async function deriveLinkKey(serverKey: string): Promise<CryptoKey> {
	if (serverKey.length < 32) throw new RangeError("server key too short");
	const root = await crypto.subtle.importKey(
		"raw",
		encoder.encode(serverKey),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(LINK_CONTEXT));
	return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
}

/** A fresh link id: 128 random bits as hex. */
export function newLinkId(): string {
	return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** True when `hours` is a lifetime links may have. */
export function ttlAllowed(hours: number): boolean {
	return Number.isFinite(hours) && hours >= LINK_TTL_MIN_HOURS && hours <= LINK_TTL_MAX_HOURS;
}

export async function signLink(key: CryptoKey, claims: LinkClaims): Promise<string> {
	const payload = b64url(encoder.encode(JSON.stringify(claimsSchema.parse(claims))));
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/**
 * The claims of a token, or why not. The signature is checked (in constant time, by the platform)
 * before anything in the payload is trusted; expiry is `exp <= now` (the instant itself is expired).
 */
export async function verifyLink(
	key: CryptoKey,
	token: string,
	now: number,
): Promise<{ ok: true; claims: LinkClaims } | { ok: false; reason: LinkRefusal }> {
	const parts = token.split(".");
	const [payload, signature] = parts;
	if (
		parts.length !== 2 ||
		payload === undefined ||
		signature === undefined ||
		token.length > 1_000
	) {
		return { ok: false, reason: "malformed" };
	}
	const sig = fromB64url(signature);
	const body = fromB64url(payload);
	if (sig === undefined || body === undefined || sig.length !== 32) {
		return { ok: false, reason: "malformed" };
	}
	if (!(await crypto.subtle.verify("HMAC", key, sig, encoder.encode(payload)))) {
		return { ok: false, reason: "bad_signature" };
	}
	let claims: LinkClaims;
	try {
		claims = claimsSchema.parse(JSON.parse(decoder.decode(body)));
	} catch {
		return { ok: false, reason: "malformed" };
	}
	return claims.e <= now ? { ok: false, reason: "expired" } : { ok: true, claims };
}
