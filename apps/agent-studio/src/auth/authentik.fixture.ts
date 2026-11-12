import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

/**
 * A local stand-in for Authentik's two public endpoints the auth reads — a provider's JWKS and
 * the userinfo endpoint — on a real HTTP port, with keys generated here. Tests and the local
 * end-to-end check (docs/plans/agent-studio.md) use it; nothing in it is psi's own code under test.
 */
export interface LocalAuthentik {
	readonly origin: string;
	/** `<origin>/application/o/<slug>/` */
	issuer(slug: string): string;
	/** RS256-signs a token with the JWKS's key (or `withKey`, a key the JWKS does not hold). */
	signRs256(
		claims: Record<string, unknown>,
		opts?: { withKey?: CryptoKey; expiresIn?: string },
	): Promise<string>;
	/** HS256-signs a token the way a proxy provider's is, and registers it as live for userinfo. */
	issueGateToken(
		claims: Record<string, unknown>,
		userinfo: Record<string, unknown>,
		opts?: { expiresIn?: string },
	): Promise<string>;
	/** How many times userinfo was asked. */
	userinfoCalls(): number;
	close(): Promise<void>;
}

export async function startLocalAuthentik(): Promise<LocalAuthentik> {
	const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
	const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "local-1", alg: "RS256", use: "sig" };
	const hsSecret = new TextEncoder().encode("local-proxy-client-secret-not-a-real-one-0000");
	const live = new Map<string, Record<string, unknown>>();
	let calls = 0;

	const server: Server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		if (/^\/application\/o\/[a-z0-9-]+\/jwks\/$/.test(url.pathname)) {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ keys: [jwk] }));
			return;
		}
		if (url.pathname === "/application/o/userinfo/") {
			calls++;
			const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
			const info = live.get(token);
			res.writeHead(info === undefined ? 401 : 200, { "content-type": "application/json" });
			res.end(JSON.stringify(info ?? { error: "invalid_token" }));
			return;
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
	const address: AddressInfo | string | null = server.address();
	if (address === null || typeof address === "string")
		throw new Error("local Authentik: no TCP port");
	const origin = `http://127.0.0.1:${address.port}`;

	return {
		origin,
		issuer: (slug) => `${origin}/application/o/${slug}/`,
		async signRs256(claims, opts) {
			return new SignJWT(claims)
				.setProtectedHeader({ alg: "RS256", kid: "local-1" })
				.setIssuedAt()
				.setExpirationTime(opts?.expiresIn ?? "5m")
				.sign(opts?.withKey ?? privateKey);
		},
		async issueGateToken(claims, userinfo, opts) {
			const token = await new SignJWT(claims)
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setExpirationTime(opts?.expiresIn ?? "5m")
				.sign(hsSecret);
			live.set(token, userinfo);
			return token;
		},
		userinfoCalls: () => calls,
		close: () => new Promise<void>((ok, fail) => server.close((err) => (err ? fail(err) : ok()))),
	};
}
