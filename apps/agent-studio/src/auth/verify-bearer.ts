import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { IdentityClaimsSchema, type StudioUser, TokenRefused, toStudioUser } from "./user";

/**
 * The RS256 path: a bearer token an Authentik OAuth2/OIDC provider signed with its certificate
 * (signing_key set — blueprints-providers.yaml rule 3), verified against that provider's JWKS.
 * Issuer, audience and expiry are all checked; the algorithm is pinned to RS256, so an HS256 token
 * (or `alg: none`) is refused before any key is consulted.
 *
 * The edge gate's own token is NOT verifiable here: Authentik forces a proxy provider's
 * signing_key to None (ProxyProvider.set_oauth_defaults), so the gate's JWT is HS256 under a
 * client secret only Authentik's database holds. That path is verify-gate.ts.
 */
export interface BearerVerifierOptions {
	/** The provider's issuer, exactly as its discovery document states it (trailing slash included). */
	issuer: string;
	/** The provider's client_id. */
	audience: string;
	/** The provider's JWKS: `<issuer>jwks/`. */
	jwksUrl: URL;
	/** Allowed clock skew, seconds. Default 30. */
	clockToleranceSeconds?: number;
}

export interface BearerVerifier {
	verify(token: string): Promise<StudioUser>;
}

export function createBearerVerifier(opts: BearerVerifierOptions): BearerVerifier {
	const keys = createRemoteJWKSet(opts.jwksUrl, { cooldownDuration: 30_000, cacheMaxAge: 600_000 });
	return {
		async verify(token: string): Promise<StudioUser> {
			let payload: unknown;
			try {
				({ payload } = await jwtVerify(token, keys, {
					issuer: opts.issuer,
					audience: opts.audience,
					algorithms: ["RS256"],
					requiredClaims: ["exp", "iat", "sub"],
					clockTolerance: opts.clockToleranceSeconds ?? 30,
				}));
			} catch (err) {
				throw new TokenRefused(`bearer token refused (${describe(err)})`);
			}
			const claims = IdentityClaimsSchema.safeParse(payload);
			if (!claims.success) throw new TokenRefused("bearer token lacks sub or groups");
			return toStudioUser(claims.data, "bearer");
		},
	};
}

function describe(err: unknown): string {
	if (err instanceof errors.JOSEError) return err.code;
	return err instanceof Error ? err.name : "unknown";
}
