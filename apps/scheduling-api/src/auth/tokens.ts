import { createRemoteJWKSet, errors, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import type { IssuerConfig } from "../config";

/** Why a bearer token was refused. The wire answer is always `invalid_token`; the reason is for the log and the tests. */
export type TokenRefusal =
	| "malformed"
	| "unknown_issuer"
	| "bad_signature"
	| "expired"
	| "wrong_audience"
	| "not_yet_valid"
	| "no_subject"
	| "keys_unavailable";

export type TokenResult =
	| { ok: true; subject: string; name?: string }
	| { ok: false; reason: TokenRefusal };

export interface TokenVerifier {
	verify(token: string): Promise<TokenResult>;
}

const Claims = z.object({
	iss: z.string(),
	sub: z.string().min(1).max(200).optional(),
	name: z.string().optional(),
});

export interface VerifierOptions {
	issuers: readonly IssuerConfig[];
	/** Test seam: the key set for an issuer. The default fetches the issuer's JWKS (cached and refreshed by jose). */
	keys?: (issuer: IssuerConfig) => JWTVerifyGetKey;
	now?: () => Date;
}

/**
 * Verifies an estate access token: the signature against the issuer's JWKS, the issuer against the configured
 * list (each Authentik application has its own), the audience against that issuer's audiences, and the clock.
 */
export function createTokenVerifier(options: VerifierOptions): TokenVerifier {
	const byIssuer = new Map(options.issuers.map((i) => [i.issuer, i]));
	const keySets = new Map<string, JWTVerifyGetKey>();
	const keysOf = (issuer: IssuerConfig): JWTVerifyGetKey => {
		const known = keySets.get(issuer.issuer);
		if (known !== undefined) return known;
		const made =
			options.keys?.(issuer) ??
			createRemoteJWKSet(new URL(issuer.jwksUrl ?? `${issuer.issuer.replace(/\/+$/, "")}/jwks/`));
		keySets.set(issuer.issuer, made);
		return made;
	};
	return {
		async verify(token) {
			const peek = Claims.safeParse(decodePayload(token));
			if (!peek.success) return { ok: false, reason: "malformed" };
			const issuer = byIssuer.get(peek.data.iss);
			if (issuer === undefined) return { ok: false, reason: "unknown_issuer" };
			try {
				const { payload } = await jwtVerify(token, keysOf(issuer), {
					issuer: issuer.issuer,
					audience: [...issuer.audiences],
					algorithms: ["RS256", "ES256", "EdDSA"],
					...(options.now ? { currentDate: options.now() } : {}),
				});
				const claims = Claims.safeParse(payload);
				if (!claims.success || claims.data.sub === undefined)
					return { ok: false, reason: "no_subject" };
				return {
					ok: true,
					subject: claims.data.sub,
					...(claims.data.name === undefined ? {} : { name: claims.data.name }),
				};
			} catch (error) {
				return { ok: false, reason: refusalOf(error) };
			}
		},
	};
}

function refusalOf(error: unknown): TokenRefusal {
	if (error instanceof errors.JWTExpired) return "expired";
	if (error instanceof errors.JWTClaimValidationFailed)
		return error.claim === "aud"
			? "wrong_audience"
			: error.claim === "nbf"
				? "not_yet_valid"
				: "malformed";
	if (
		error instanceof errors.JWSSignatureVerificationFailed ||
		error instanceof errors.JWKSNoMatchingKey
	)
		return "bad_signature";
	if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid)
		return "keys_unavailable";
	if (error instanceof TypeError) return "keys_unavailable";
	return "malformed";
}

function decodePayload(token: string): unknown {
	const part = token.split(".")[1];
	if (part === undefined) return undefined;
	try {
		return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
	} catch {
		return undefined;
	}
}
