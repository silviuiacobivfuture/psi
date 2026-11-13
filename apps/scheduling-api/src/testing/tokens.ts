import {
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	type JSONWebKeySet,
	type JWTVerifyGetKey,
	SignJWT,
} from "jose";

export interface MintOptions {
	audience?: string;
	issuer?: string;
	/** Seconds from `now`; negative is already expired. */
	expiresIn?: number;
	/** Seconds from `now`; positive is not yet valid. */
	notBefore?: number;
	/** Sign with a key the issuer does not publish. */
	foreignKey?: boolean;
	name?: string;
}

export interface TestIssuer {
	issuer: string;
	audience: string;
	jwks: JSONWebKeySet;
	keys: () => JWTVerifyGetKey;
	mint(subject: string, options?: MintOptions): Promise<string>;
}

/** An Authentik look-alike: a key pair, its JWKS, and tokens with the claims the service reads. For tests and the local run. */
export async function createTestIssuer(
	issuer = "https://auth.test/application/o/clinic/",
	audience = "scheduling-api",
	now: () => number = Date.now,
): Promise<TestIssuer> {
	const pair = await generateKeyPair("ES256");
	const foreign = await generateKeyPair("ES256");
	const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-1", alg: "ES256", use: "sig" };
	const jwks: JSONWebKeySet = { keys: [jwk] };
	const keySet = createLocalJWKSet(jwks);
	return {
		issuer,
		audience,
		jwks,
		keys: () => keySet,
		async mint(subject, options = {}) {
			const at = Math.floor(now() / 1000);
			const builder = new SignJWT({ ...(options.name === undefined ? {} : { name: options.name }) })
				.setProtectedHeader({ alg: "ES256", kid: "test-1" })
				.setIssuer(options.issuer ?? issuer)
				.setAudience(options.audience ?? audience)
				.setSubject(subject)
				.setIssuedAt(at - 5)
				.setExpirationTime(at + (options.expiresIn ?? 600));
			if (options.notBefore !== undefined) builder.setNotBefore(at + options.notBefore);
			return builder.sign(options.foreignKey === true ? foreign.privateKey : pair.privateKey);
		},
	};
}
