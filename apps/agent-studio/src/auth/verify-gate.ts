import { createHash } from "node:crypto";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { z } from "zod";
import { IdentityClaimsSchema, type StudioUser, TokenRefused, toStudioUser } from "./user";

/**
 * The edge path: the token Authentik's embedded outpost hands Traefik as `X-authentik-jwt` after
 * it let a browser through (authentik 2026.5.3 internal/outpost/proxyv2/application/
 * mode_common.go: `headers["X-authentik-jwt"] = c.RawToken`, the provider's access token).
 *
 * A proxy provider's token is HS256 under the provider's client secret (Authentik forces
 * signing_key = None, and client_secret is not settable through a blueprint), so this process has
 * no key to verify it with. It is confirmed with Authentik instead: the token must be live in
 * Authentik (its userinfo endpoint answers 200 for exactly this token string), its issuer must be
 * THIS application's (Authentik's issuer is per application slug, so a token another gated app's
 * outpost minted is refused), it must not be expired, and the subject userinfo names must be the
 * token's. Groups come from userinfo — Authentik's answer, never a request header. Answers are
 * cached per token for at most `cacheSeconds` and never past the token's expiry.
 */
export interface GateVerifierOptions {
	/** `https://auth.psizone.ro/application/o/agent-studio/` — the gate application's issuer. */
	issuer: string;
	/** The proxy provider's client_id, when known; checked against `aud` if given. */
	audience?: string;
	/** Authentik's userinfo endpoint: `https://auth.psizone.ro/application/o/userinfo/`. */
	userinfoUrl: URL;
	/** How long a confirmation is reused. Default 30 s. */
	cacheSeconds?: number;
	/** Allowed clock skew, seconds. Default 30. */
	clockToleranceSeconds?: number;
	now?: () => number;
}

export interface GateVerifier {
	verify(token: string): Promise<StudioUser>;
}

const GatePayloadSchema = z.object({
	iss: z.string(),
	sub: z.string().min(1),
	exp: z.number(),
	aud: z.union([z.string(), z.array(z.string())]).optional(),
});

const MAX_CACHED = 512;

export function createGateVerifier(opts: GateVerifierOptions): GateVerifier {
	const now = opts.now ?? Date.now;
	const ttlMs = (opts.cacheSeconds ?? 30) * 1000;
	const skew = opts.clockToleranceSeconds ?? 30;
	const cache = new Map<string, { user: StudioUser; until: number }>();

	function readPayload(token: string): z.infer<typeof GatePayloadSchema> {
		let header: unknown;
		let payload: unknown;
		try {
			header = decodeProtectedHeader(token);
			payload = decodeJwt(token);
		} catch {
			throw new TokenRefused("gate token is not a JWT");
		}
		const alg = z.object({ alg: z.string() }).safeParse(header);
		if (!alg.success || alg.data.alg.toLowerCase() === "none") {
			throw new TokenRefused("gate token is unsigned");
		}
		const parsed = GatePayloadSchema.safeParse(payload);
		if (!parsed.success) throw new TokenRefused("gate token lacks iss, sub or exp");
		const p = parsed.data;
		if (p.iss !== opts.issuer) throw new TokenRefused("gate token is another application's");
		if (p.exp + skew <= now() / 1000) throw new TokenRefused("gate token expired");
		if (opts.audience !== undefined) {
			const aud = typeof p.aud === "string" ? [p.aud] : (p.aud ?? []);
			if (!aud.includes(opts.audience)) throw new TokenRefused("gate token audience mismatch");
		}
		return p;
	}

	async function confirm(token: string, sub: string): Promise<StudioUser> {
		let res: Response;
		try {
			res = await fetch(opts.userinfoUrl, {
				headers: { authorization: `Bearer ${token}`, accept: "application/json" },
				signal: AbortSignal.timeout(5000),
			});
		} catch {
			throw new TokenRefused("Authentik userinfo unreachable");
		}
		if (res.status !== 200) throw new TokenRefused(`Authentik refused the token (${res.status})`);
		const claims = IdentityClaimsSchema.safeParse(await res.json().catch(() => null));
		if (!claims.success) throw new TokenRefused("Authentik userinfo lacks sub or groups");
		if (claims.data.sub !== sub)
			throw new TokenRefused("userinfo subject differs from the token's");
		return toStudioUser(claims.data, "gate");
	}

	return {
		async verify(token: string): Promise<StudioUser> {
			const payload = readPayload(token);
			const key = createHash("sha256").update(token).digest("base64url");
			const hit = cache.get(key);
			if (hit !== undefined && hit.until > now()) return hit.user;
			cache.delete(key);
			const user = await confirm(token, payload.sub);
			if (cache.size >= MAX_CACHED) {
				const oldest = cache.keys().next();
				if (oldest.done !== true) cache.delete(oldest.value);
			}
			cache.set(key, { user, until: Math.min(now() + ttlMs, payload.exp * 1000) });
			return user;
		},
	};
}
