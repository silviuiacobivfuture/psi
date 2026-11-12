/**
 * DEV/TEST FIXTURE ONLY — an OIDC issuer with Authentik's URL layout and behaviour, so the sites' real sign-in code
 * completes full round trips on a workstation: one application per site (`/application/o/<slug>/`), shared
 * authorize/token/userinfo endpoints, a browser session at the issuer (sign in once, every site recognises it), and
 * end-session that sends OIDC Back-Channel Logout tokens to every site the session used.
 *
 * Binds to 127.0.0.1 only and refuses NODE_ENV=production. Nothing in src/ imports it, and no image contains it.
 * Taken over from the CMS's archived mock (dev/mock-oidc/server.ts), widened to several clients.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { chooserPage } from "./mock-login-page";

export interface MockClient {
	slug: string;
	clientId: string;
	clientSecret: string;
	redirectUris: ReadonlyArray<string>;
	postLogoutRedirectUris: ReadonlyArray<string>;
	/** The site's back-channel logout endpoint. */
	logoutUri?: string;
}

export interface MockPerson {
	sub: string;
	email: string;
	name: string;
	/** Directory groups, as Authentik's `profile` scope carries them (the CMS's interim authorizer reads them). */
	groups?: ReadonlyArray<string>;
}

export interface MockIssuerOptions {
	port?: number;
	clients: ReadonlyArray<MockClient>;
	people?: ReadonlyArray<MockPerson>;
	/** How a logout token reaches a site. Default: an HTTP POST to its `logoutUri`. */
	deliverLogout?: (uri: string, body: URLSearchParams) => Promise<void>;
	/** Loopback addresses to listen on. Default ["127.0.0.1"]. */
	hosts?: ReadonlyArray<string>;
	/** The origin the issuer advertises (`http://localhost:4351`). Default `http://127.0.0.1:<port>`. */
	origin?: string;
	/** Show a page to choose a person when the browser has no session and no `login_hint`. Default: sign in the first. */
	chooser?: boolean;
}

export interface MockIssuer {
	origin: string;
	issuer(slug: string): string;
	close(): Promise<void>;
}

/** The fixed test people; `login_hint` picks one, the first is the default. */
export const MOCK_PEOPLE: ReadonlyArray<MockPerson> = [
	{ sub: "mock-ana-7f3c", email: "ana@psizone.test", name: "Ana Test" },
	{
		sub: "mock-bogdan-91a2",
		email: "bogdan@psizone.test",
		name: "Bogdan Test",
	},
];

const SSO_COOKIE = "mock_authentik_session";

interface Grant {
	client: MockClient;
	person: MockPerson;
	sid: string;
	nonce: string | null;
	challenge: string;
	redirectUri: string;
	expires: number;
}

export async function startMockIssuer(
	opts: MockIssuerOptions,
): Promise<MockIssuer> {
	if (process.env.NODE_ENV === "production")
		throw new Error("mock issuer refuses NODE_ENV=production");
	const people = opts.people ?? MOCK_PEOPLE;
	const fallback = people[0];
	if (fallback === undefined)
		throw new Error("mock issuer needs at least one person");
	const defaultPerson: MockPerson = fallback;
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const jwk = {
		...(await exportJWK(publicKey)),
		kid: "mock-1",
		alg: "RS256",
		use: "sig",
	};
	const codes = new Map<string, Grant>();
	const accessTokens = new Map<string, MockPerson>();
	const browser = new Map<
		string,
		{ person: MockPerson; clients: Set<string> }
	>();
	const deliver =
		opts.deliverLogout ??
		(async (uri: string, body: URLSearchParams) => {
			await fetch(uri, { method: "POST", body }).catch(() => undefined);
		});
	let origin = "";
	const issuer = (slug: string): string => `${origin}/application/o/${slug}/`;
	const bySlug = (slug: string): MockClient | undefined =>
		opts.clients.find((c) => c.slug === slug);
	const byId = (id: string): MockClient | undefined =>
		opts.clients.find((c) => c.clientId === id);

	const sign = (
		claims: Record<string, unknown>,
		client: MockClient,
		sub: string,
		typ?: string,
	) =>
		new SignJWT(claims)
			.setProtectedHeader({
				alg: "RS256",
				kid: "mock-1",
				...(typ ? { typ } : {}),
			})
			.setIssuer(issuer(client.slug))
			.setSubject(sub)
			.setAudience(client.clientId)
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);

	async function handle(
		req: IncomingMessage,
		res: ServerResponse,
	): Promise<void> {
		const url = new URL(req.url ?? "/", origin);
		const p = url.pathname;
		const perApp = /^\/application\/o\/([a-z0-9-]+)\/(.*)$/.exec(p);
		if (
			req.method === "GET" &&
			perApp?.[2] === ".well-known/openid-configuration"
		) {
			const client = bySlug(perApp[1] ?? "");
			if (client === undefined) return json(res, 404, { error: "not_found" });
			return json(
				res,
				200,
				discovery(origin, client.slug, issuer(client.slug)),
			);
		}
		if (req.method === "GET" && perApp?.[2] === "jwks/")
			return json(res, 200, { keys: [jwk] });
		if (req.method === "GET" && p === "/application/o/authorize/") {
			const q = url.searchParams;
			const client = byId(q.get("client_id") ?? "");
			const redirectUri = q.get("redirect_uri") ?? "";
			if (client === undefined || !client.redirectUris.includes(redirectUri)) {
				return json(res, 400, {
					error: "invalid_request",
					error_description: "client or redirect_uri",
				});
			}
			const challenge = q.get("code_challenge");
			if (
				q.get("response_type") !== "code" ||
				q.get("code_challenge_method") !== "S256" ||
				!challenge
			) {
				return json(res, 400, {
					error: "invalid_request",
					error_description: "code + PKCE S256 only",
				});
			}
			const known = readCookie(req.headers.cookie, SSO_COOKIE);
			const existing = known === undefined ? undefined : browser.get(known);
			const hinted = people.find((x) => x.email === q.get("login_hint"));
			const reuse =
				known !== undefined &&
				existing !== undefined &&
				(hinted === undefined || hinted.sub === existing.person.sub);
			if (!reuse && q.get("prompt") === "none") {
				// OIDC Core 3.1.2.6: no session and no screen allowed — answer login_required to the app.
				const back = new URL(redirectUri);
				back.searchParams.set("error", "login_required");
				const state = q.get("state");
				if (state !== null) back.searchParams.set("state", state);
				res.writeHead(302, { location: back.href });
				res.end();
				return;
			}
			if (!reuse && hinted === undefined && opts.chooser === true) {
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
				});
				res.end(chooserPage(url, people));
				return;
			}
			const sid = reuse ? known : randomUUID();
			const session = reuse
				? existing
				: { person: hinted ?? defaultPerson, clients: new Set<string>() };
			browser.set(sid, session);
			session.clients.add(client.clientId);
			const code = randomBytes(24).toString("base64url");
			codes.set(code, {
				client,
				person: session.person,
				sid,
				nonce: q.get("nonce"),
				challenge,
				redirectUri,
				expires: Date.now() + 60_000,
			});
			const back = new URL(redirectUri);
			back.searchParams.set("code", code);
			const state = q.get("state");
			if (state !== null) back.searchParams.set("state", state);
			res.writeHead(302, {
				location: back.href,
				"set-cookie": `${SSO_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`,
			});
			res.end();
			return;
		}
		if (req.method === "POST" && p === "/application/o/token/") {
			const body = await form(req);
			const client = authenticate(req, body);
			if (client === undefined)
				return json(res, 401, { error: "invalid_client" });
			const code = body.get("code") ?? "";
			const grant = codes.get(code);
			codes.delete(code);
			const computed = createHash("sha256")
				.update(body.get("code_verifier") ?? "")
				.digest("base64url");
			if (
				grant === undefined ||
				grant.client.clientId !== client.clientId ||
				grant.expires < Date.now() ||
				grant.redirectUri !== body.get("redirect_uri") ||
				computed !== grant.challenge
			) {
				return json(res, 400, { error: "invalid_grant" });
			}
			const idToken = await sign(
				{
					email: grant.person.email,
					email_verified: true,
					name: grant.person.name,
					groups: grant.person.groups ?? [],
					sid: grant.sid,
					...(grant.nonce === null ? {} : { nonce: grant.nonce }),
				},
				client,
				grant.person.sub,
			);
			const accessToken = randomBytes(24).toString("base64url");
			accessTokens.set(accessToken, grant.person);
			return json(res, 200, {
				access_token: accessToken,
				token_type: "Bearer",
				expires_in: 300,
				id_token: idToken,
				scope: "openid email profile",
			});
		}
		if (req.method === "GET" && p === "/application/o/userinfo/") {
			const person = accessTokens.get(
				(req.headers.authorization ?? "").replace(/^Bearer /, ""),
			);
			if (person === undefined)
				return json(res, 401, { error: "invalid_token" });
			return json(res, 200, {
				sub: person.sub,
				email: person.email,
				email_verified: true,
				name: person.name,
				groups: person.groups ?? [],
			});
		}
		if (req.method === "GET" && perApp?.[2] === "end-session/") {
			const client = bySlug(perApp[1] ?? "");
			const sid = readCookie(req.headers.cookie, SSO_COOKIE);
			const session = sid === undefined ? undefined : browser.get(sid);
			if (sid !== undefined && session !== undefined) {
				browser.delete(sid);
				for (const id of session.clients) {
					const target = byId(id);
					if (target?.logoutUri === undefined) continue;
					const token = await sign(
						{
							sid,
							jti: randomUUID(),
							events: {
								"http://schemas.openid.net/event/backchannel-logout": {},
							},
						},
						target,
						session.person.sub,
						"logout+jwt",
					);
					await deliver(
						target.logoutUri,
						new URLSearchParams({ logout_token: token }),
					);
				}
			}
			const back = url.searchParams.get("post_logout_redirect_uri") ?? "";
			const headers = { "set-cookie": `${SSO_COOKIE}=; Path=/; Max-Age=0` };
			if (client?.postLogoutRedirectUris.includes(back)) {
				res.writeHead(302, { ...headers, location: back });
				res.end();
				return;
			}
			res.writeHead(200, { ...headers, "content-type": "application/json" });
			res.end(JSON.stringify({ signedOut: true }));
			return;
		}
		return json(res, 404, { error: "not_found" });
	}

	function authenticate(
		req: IncomingMessage,
		body: URLSearchParams,
	): MockClient | undefined {
		const basic = req.headers.authorization;
		let id = body.get("client_id") ?? "";
		let secret = body.get("client_secret") ?? "";
		if (basic?.startsWith("Basic ") === true) {
			const [i, s] = Buffer.from(basic.slice(6), "base64")
				.toString("utf8")
				.split(":");
			id = decodeURIComponent(i ?? "");
			secret = decodeURIComponent(s ?? "");
		}
		const client = byId(id);
		return client !== undefined && client.clientSecret === secret
			? client
			: undefined;
	}

	const listen = async (host: string, port: number) => {
		const server = createServer((req, res) => {
			handle(req, res).catch((err: unknown) => {
				console.error(err);
				json(res, 500, { error: "server_error" });
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, host, resolve);
		});
		return server;
	};
	const [first = "127.0.0.1", ...rest] = opts.hosts ?? ["127.0.0.1"];
	const servers = [await listen(first, opts.port ?? 0)];
	const address: AddressInfo | string | null = servers[0]?.address() ?? null;
	if (address === null || typeof address === "string")
		throw new Error("mock issuer: no address");
	for (const host of rest) servers.push(await listen(host, address.port));
	origin = opts.origin ?? `http://127.0.0.1:${address.port}`;
	return {
		origin,
		issuer,
		close: async () => {
			await Promise.all(
				servers.map(
					(s) => new Promise<void>((resolve) => s.close(() => resolve())),
				),
			);
		},
	};
}

function discovery(
	origin: string,
	slug: string,
	iss: string,
): Record<string, unknown> {
	return {
		issuer: iss,
		authorization_endpoint: `${origin}/application/o/authorize/`,
		token_endpoint: `${origin}/application/o/token/`,
		userinfo_endpoint: `${origin}/application/o/userinfo/`,
		end_session_endpoint: `${origin}/application/o/${slug}/end-session/`,
		jwks_uri: `${origin}/application/o/${slug}/jwks/`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256"],
		scopes_supported: ["openid", "profile", "email"],
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
		],
		code_challenge_methods_supported: ["S256"],
		backchannel_logout_supported: true,
		backchannel_logout_session_supported: true,
	};
}

function json(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, {
		"content-type": "application/json",
		"cache-control": "no-store",
	});
	res.end(JSON.stringify(body));
}

async function form(req: IncomingMessage): Promise<URLSearchParams> {
	const chunks: Buffer[] = [];
	for await (const c of req)
		chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
	return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function readCookie(
	header: string | undefined,
	name: string,
): string | undefined {
	for (const part of (header ?? "").split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return undefined;
}
