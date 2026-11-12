import { createHmac, timingSafeEqual } from "node:crypto";
import { type Locale, LocaleSchema } from "@psi/content";
import { z } from "zod";

/**
 * The signed preview link between the CMS and the blog. The CMS signs `{id, locale, exp}` with a
 * secret the two share (`PREVIEW_SECRET`); the blog renders that draft through its own templates
 * only while the signature holds and the link has not expired. The token carries no content.
 */
export const PreviewClaims = z.object({
	/** The CMS document id. */
	id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
	locale: LocaleSchema,
	/** Expiry, in seconds since the epoch. */
	exp: z.number().int().positive(),
});
export type PreviewClaims = z.infer<typeof PreviewClaims>;

/** How long a preview link lives: one editing session. */
export const PREVIEW_TTL_SECONDS = 8 * 60 * 60;

function mac(body: string, secret: string): string {
	return createHmac("sha256", secret).update(`psi-preview.v1.${body}`).digest("base64url");
}

/** A token for one document in one locale, valid for `ttlSeconds` from `now`. */
export function signPreview(
	id: string,
	locale: Locale,
	secret: string,
	now: Date = new Date(),
	ttlSeconds: number = PREVIEW_TTL_SECONDS,
): string {
	const claims = PreviewClaims.parse({
		id,
		locale,
		exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
	});
	const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
	return `${body}.${mac(body, secret)}`;
}

/** The claims of a valid, unexpired token; null for anything else (never says why). */
export function verifyPreview(
	token: string,
	secret: string,
	now: Date = new Date(),
): PreviewClaims | null {
	const [body, sig, extra] = token.split(".");
	if (body === undefined || sig === undefined || extra !== undefined || secret.length < 32) {
		return null;
	}
	const want = Buffer.from(mac(body, secret));
	const got = Buffer.from(sig);
	if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
	let json: unknown;
	try {
		json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	const claims = PreviewClaims.safeParse(json);
	if (!claims.success || claims.data.exp * 1000 <= now.getTime()) return null;
	return claims.data;
}

/** HMAC-SHA256 of a webhook body, hex: the CMS signs, the sites check (`x-psi-signature`). */
export function signWebhook(body: string, secret: string): string {
	return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time check of a webhook signature. */
export function verifyWebhook(body: string, signature: string, secret: string): boolean {
	if (secret.length < 32) return false;
	const want = Buffer.from(signWebhook(body, secret));
	const got = Buffer.from(signature);
	return want.length === got.length && timingSafeEqual(want, got);
}
