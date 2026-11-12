import { createHmac, timingSafeEqual } from "node:crypto";

/** The hook's header, the CMS webhook's scheme: `x-psi-signature: sha256=<hex HMAC of the raw body>`. */
export const NOTIFY_SIGNATURE_HEADER = "x-psi-signature";

export function signNotify(body: string, secret: string): string {
	return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Constant-time check of the raw body against the header. */
export function verifyNotify(body: string, header: string | null, secret: string): boolean {
	if (header === null) return false;
	const expected = Buffer.from(signNotify(body, secret));
	const given = Buffer.from(header);
	return expected.length === given.length && timingSafeEqual(expected, given);
}
