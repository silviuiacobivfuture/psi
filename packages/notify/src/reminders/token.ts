import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppKeySchema } from "../apps";

export const LINK_ACTIONS = ["confirm", "cancel", "ics"] as const;
export type LinkAction = (typeof LINK_ACTIONS)[number];

const Claims = z
	.object({
		v: z.literal(1),
		a: AppKeySchema,
		i: z.string().min(1).max(120),
		k: z.enum(LINK_ACTIONS),
		/** Expiry, seconds since the epoch. */
		e: z.number().int().positive(),
		/** Unique id: what "single use" is recorded against. */
		j: z.string().min(8).max(64),
		l: z.enum(["ro", "en"]),
	})
	.strict();
export type Claims = z.infer<typeof Claims>;

export type TokenFailure = "malformed" | "tampered" | "expired" | "wrong-action" | "wrong-app";

export type Verified =
	| { ok: true; claims: Claims }
	/** `claims` is set for an expired token: its signature held, so its language and app are trustworthy. */
	| { ok: false; failure: TokenFailure; claims?: Claims };

const b64 = (buf: Buffer): string => buf.toString("base64url");

function mac(secret: string, body: string): Buffer {
	return createHmac("sha256", secret).update(`psi-notify-link.${body}`).digest();
}

export interface SignInput {
	secret: string;
	app: Claims["a"];
	appointmentId: string;
	action: LinkAction;
	locale: Claims["l"];
	/** Epoch milliseconds the link stops working. */
	expiresAt: number;
}

/** `<claims>.<signature>`, URL-safe. The secret must be at least 32 characters (OpenBao). */
export function signToken(input: SignInput): string {
	if (input.secret.length < 32)
		throw new Error("the reminder link secret must be at least 32 characters");
	const claims: Claims = {
		v: 1,
		a: input.app,
		i: input.appointmentId,
		k: input.action,
		e: Math.floor(input.expiresAt / 1000),
		j: b64(randomBytes(12)),
		l: input.locale,
	};
	const body = b64(Buffer.from(JSON.stringify(claims)));
	return `${body}.${b64(mac(input.secret, body))}`;
}

export interface VerifyInput {
	secret: string;
	token: string;
	now: number;
	expectApp: Claims["a"];
	expectAction: LinkAction;
}

/** The signature is checked first and in constant time; nothing in a forged token is trusted or parsed before it. */
export function verifyToken(input: VerifyInput): Verified {
	const parts = input.token.split(".");
	const [body, sig] = parts;
	if (parts.length !== 2 || body === undefined || sig === undefined || body === "" || sig === "")
		return { ok: false, failure: "malformed" };
	if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig))
		return { ok: false, failure: "malformed" };
	const expected = mac(input.secret, body);
	const given = Buffer.from(sig, "base64url");
	if (given.length !== expected.length || !timingSafeEqual(given, expected))
		return { ok: false, failure: "tampered" };
	let raw: unknown;
	try {
		raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
	} catch {
		return { ok: false, failure: "malformed" };
	}
	const claims = Claims.safeParse(raw);
	if (!claims.success) return { ok: false, failure: "malformed" };
	if (claims.data.e * 1000 <= input.now)
		return { ok: false, failure: "expired", claims: claims.data };
	if (claims.data.a !== input.expectApp) return { ok: false, failure: "wrong-app" };
	if (claims.data.k !== input.expectAction) return { ok: false, failure: "wrong-action" };
	return { ok: true, claims: claims.data };
}
