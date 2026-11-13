import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MockIssuer, startMockIssuer } from "../dev/mock-issuer";
import { type AppFetch, createBrowser } from "../dev/test-browser";
import { type Account, createAccount } from "./account";
import { safeReturn } from "./guard";
import { memoryStores } from "./stores/memory";

/**
 * The whole journey against the Authentik-shaped mock: sign in on one site, single sign-on on the next, and one
 * sign-out ending the sessions of BOTH through back-channel logout. Two sites share one store, as in the cluster.
 */
const SITES = {
	blog: { slug: "blog-web", key: "blog", origin: "http://blog.test" },
	eqsync: { slug: "eqsync-web", key: "eqsync", origin: "http://eqsync.test" },
} as const;
const SECRET = "x".repeat(40);

let mock: MockIssuer;
const apps: Record<string, AppFetch> = {};
const accounts: Record<string, Account> = {};

function siteApp(name: keyof typeof SITES, account: Account): Hono {
	const app = new Hono();
	account.mount(app);
	app.get("/cont", account.recognise(), (c) => c.json({ person: account.current(c) }));
	app.get("/privat", account.requireSignIn(), (c) => c.text("ok"));
	app.get("/", (c) => c.text(name));
	return app;
}

beforeAll(async () => {
	const stores = memoryStores();
	mock = await startMockIssuer({
		clients: Object.values(SITES).map((s) => ({
			slug: s.slug,
			clientId: `${s.slug}-test`,
			clientSecret: `${s.slug}-secret`,
			redirectUris: [`${s.origin}/auth/callback`],
			postLogoutRedirectUris: [`${s.origin}/`],
			logoutUri: `${s.origin}/auth/backchannel-logout`,
		})),
		deliverLogout: async (uri, body) => {
			const target = apps[new URL(uri).origin];
			if (target !== undefined) await target(new Request(uri, { method: "POST", body }));
		},
	});
	for (const name of ["blog", "eqsync"] as const) {
		const site = SITES[name];
		const account = createAccount({
			site,
			stores,
			onWarn: () => {},
			env: {
				OIDC_ISSUER: mock.issuer(site.slug),
				OIDC_CLIENT_ID: `${site.slug}-test`,
				OIDC_CLIENT_SECRET: `${site.slug}-secret`,
				SESSION_SECRET: SECRET,
				OIDC_ALLOW_INSECURE_LOOPBACK: "true",
			},
		});
		accounts[name] = account;
		const app = siteApp(name, account);
		apps[site.origin] = (req) => app.fetch(req);
	}
});

afterAll(async () => {
	await mock.close();
});

async function person(b: ReturnType<typeof createBrowser>, origin: string): Promise<unknown> {
	const { res } = await b.go(`${origin}/cont`);
	const body: unknown = await res.json();
	return body;
}

describe("sign-in round trip", () => {
	it("signs in with code + PKCE, keeps the session on the server, and returns to the page asked for", async () => {
		const b = createBrowser(apps);
		expect(await person(b, SITES.blog.origin)).toEqual({ person: null });

		const { res, trail } = await b.go(`${SITES.blog.origin}/auth/sign-in?return=%2Fcont`);
		expect(trail[1]).toContain(`${mock.origin}/application/o/authorize/`);
		const authorize = new URL(trail[1] ?? "");
		expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
		expect(authorize.searchParams.get("redirect_uri")).toBe(`${SITES.blog.origin}/auth/callback`);
		expect(trail.at(-1)).toBe(`${SITES.blog.origin}/cont`);
		expect(await res.json()).toEqual({
			person: {
				subject: "mock-ana-7f3c",
				user: "user:mock-ana-7f3c",
				email: "ana@psizone.test",
				name: "Ana Test",
			},
		});
		// The cookie is an opaque id, nothing readable; the transaction cookie is gone.
		const jar = b.cookies(SITES.blog.origin);
		expect(jar.has("__Host-psi-blog-txn")).toBe(false);
		expect(jar.has("__Host-psi-blog-session")).toBe(true);
		expect(jar.get("__Host-psi-blog-session")).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("is single sign-on: the next site signs the same person in without a prompt", async () => {
		const b = createBrowser(apps);
		await b.go(`${SITES.blog.origin}/auth/sign-in?return=%2Fcont`);
		const { trail } = await b.go(`${SITES.eqsync.origin}/privat`);
		expect(trail.at(-1)).toBe(`${SITES.eqsync.origin}/privat`);
		expect(await person(b, SITES.eqsync.origin)).toMatchObject({
			person: { subject: "mock-ana-7f3c" },
		});
	});

	it("signs out of the estate: one sign-out ends both sites' sessions through back-channel logout", async () => {
		const b = createBrowser(apps);
		await b.go(`${SITES.blog.origin}/auth/sign-in?return=%2Fcont`);
		await b.go(`${SITES.eqsync.origin}/auth/sign-in?return=%2Fcont`);
		expect(await person(b, SITES.eqsync.origin)).toMatchObject({
			person: { subject: "mock-ana-7f3c" },
		});

		const { trail } = await b.go(`${SITES.blog.origin}/auth/sign-out`, {
			method: "POST",
			headers: { origin: SITES.blog.origin, "sec-fetch-site": "same-origin" },
		});
		expect(trail[1]).toContain(`${mock.origin}/application/o/blog-web/end-session/`);
		expect(new URL(trail[1] ?? "").searchParams.get("id_token_hint")).toBeTruthy();
		expect(trail.at(-1)).toBe(`${SITES.blog.origin}/`);
		expect(await person(b, SITES.blog.origin)).toEqual({ person: null });
		// eqsync's cookie is still in the browser, but its server-side session is gone.
		expect(b.cookies(SITES.eqsync.origin).has("__Host-psi-eqsync-session")).toBe(true);
		expect(await person(b, SITES.eqsync.origin)).toEqual({ person: null });
	});

	it("recognises a person signed in elsewhere on the account page, silently (prompt=none), once", async () => {
		const b = createBrowser(apps);
		await b.go(`${SITES.blog.origin}/auth/sign-in?return=%2Fcont`);
		const { res, trail } = await b.go(`${SITES.eqsync.origin}/cont`);
		expect(new URL(trail[2] ?? "").searchParams.get("prompt")).toBe("none");
		expect(await res.json()).toMatchObject({
			person: { subject: "mock-ana-7f3c" },
		});

		const stranger = createBrowser(apps);
		const first = await stranger.go(`${SITES.eqsync.origin}/cont`);
		expect(first.trail.some((u) => u.includes("error=login_required"))).toBe(true);
		expect(await first.res.json()).toEqual({ person: null });
		const again = await stranger.go(`${SITES.eqsync.origin}/cont`);
		expect(again.trail).toEqual([`${SITES.eqsync.origin}/cont`]);
	});

	it("sends a signed-out visitor of a protected page to sign-in and back", async () => {
		const b = createBrowser(apps);
		const { trail } = await b.go(`${SITES.eqsync.origin}/privat`);
		expect(trail[1]).toBe(`${SITES.eqsync.origin}/auth/sign-in?return=%2Fprivat`);
		expect(trail.at(-1)).toBe(`${SITES.eqsync.origin}/privat`);
	});

	it("never returns to another origin after sign-in (open-redirect guard)", async () => {
		for (const evil of [
			"//evil.test",
			"/\\evil.test",
			"/\t/evil.test",
			"/\n/evil.test",
			"https://evil.test/",
		]) {
			expect(safeReturn(evil, "/cont")).toBe("/cont");
			const b = createBrowser(apps);
			const { trail } = await b.go(
				`${SITES.blog.origin}/auth/sign-in?return=${encodeURIComponent(evil)}`,
			);
			expect(trail.at(-1)).toBe(`${SITES.blog.origin}/`);
		}
		expect(safeReturn("/articole/x?y=1#z", "/")).toBe("/articole/x?y=1#z");
	});

	it("refuses a callback whose state it did not start, and sets no session", async () => {
		const b = createBrowser(apps);
		const { res } = await b.go(`${SITES.blog.origin}/auth/callback?code=forged&state=forged`);
		expect(res.status).toBe(200);
		expect(b.cookies(SITES.blog.origin).size).toBe(0);
	});

	it("refuses a sign-out posted from another site, and a forged logout token", async () => {
		const b = createBrowser(apps);
		await b.go(`${SITES.blog.origin}/auth/sign-in?return=%2Fcont`);
		const { res } = await b.go(`${SITES.blog.origin}/auth/sign-out`, {
			method: "POST",
			headers: { origin: SITES.eqsync.origin, "sec-fetch-site": "same-site" },
		});
		expect(res.status).toBe(403);
		expect(await person(b, SITES.blog.origin)).toMatchObject({
			person: { subject: "mock-ana-7f3c" },
		});

		const forged = await apps[SITES.blog.origin]?.(
			new Request(`${SITES.blog.origin}/auth/backchannel-logout`, {
				method: "POST",
				body: new URLSearchParams({ logout_token: "e30.e30.forged" }),
			}),
		);
		expect(forged?.status).toBe(400);
		expect(await person(b, SITES.blog.origin)).toMatchObject({
			person: { subject: "mock-ana-7f3c" },
		});
	});

	it("answers 503 and sets nothing when the site's sign-in is not configured", async () => {
		const account = createAccount({
			site: {
				slug: "hemisync-web",
				key: "hemisync",
				origin: "http://hemisync.test",
			},
			env: {},
			stores: memoryStores(),
			onWarn: () => {},
		});
		expect(account.status).toMatchObject({
			identity: "missing",
			authz: "missing",
		});
		const app = new Hono();
		account.mount(app);
		const res = await app.fetch(new Request("http://hemisync.test/auth/sign-in"));
		expect(res.status).toBe(503);
		expect(res.headers.getSetCookie()).toEqual([]);
	});
});

describe("the session's ID token, for calling a service as the person", () => {
	it("is the provider's signed token for this site's client while signed in, and null signed out", async () => {
		const site = SITES.blog;
		const account = accounts.blog;
		if (account === undefined) throw new Error("no account");
		const app = new Hono();
		account.mount(app);
		app.get("/token", async (c) => c.json({ token: await account.idToken(c) }));
		const served: Record<string, AppFetch> = { [site.origin]: (req) => app.fetch(req) };
		const b = createBrowser({ ...apps, ...served });
		const signedOut = await b.go(`${site.origin}/token`);
		expect(await signedOut.res.json()).toEqual({ token: null });
		await b.go(`${site.origin}/auth/sign-in?return=/token`);
		const signedIn = (await (await b.go(`${site.origin}/token`)).res.json()) as { token: string };
		const [, payload] = signedIn.token.split(".");
		const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
			aud: string;
			iss: string;
		};
		expect(claims.aud).toBe(`${site.slug}-test`);
		expect(claims.iss).toBe(mock.issuer(site.slug));
	});
});
