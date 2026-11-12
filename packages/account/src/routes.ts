import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { safeReturn, sameOrigin } from "./guard";
import { LoginTransactionSchema, type RelyingParty } from "./oidc";
import { hashSessionId, newSessionId, type Sealer } from "./seal";
import type { Stores } from "./stores/types";

/** The routes every site serves. Locale-free: they redirect, they never render. */
export const AUTH_PATHS = {
	signIn: "/auth/sign-in",
	callback: "/auth/callback",
	signOut: "/auth/sign-out",
	backchannelLogout: "/auth/backchannel-logout",
} as const;

const TXN_SECONDS = 600;
const SESSION_SECONDS = 30 * 24 * 3600;

export interface RouteDeps {
	/** This site's public origin: the redirect URI is built from it, never from the request's Host. */
	origin: string;
	cookieName: string;
	txnCookieName: string;
	rp: RelyingParty | null;
	txnSealer: Sealer | null;
	stores: () => Promise<Stores>;
	now: () => number;
	/** Where a person lands after signing in with no return path, and after signing out. */
	home: string;
	onWarn: (message: string) => void;
}

const cookieBase = {
	path: "/",
	secure: true,
	httpOnly: true,
	sameSite: "Lax" as const,
};

/**
 * Sign-in (code + PKCE), callback, sign-out (RP-initiated, through Authentik's end-session, so every site is signed
 * out) and OIDC Back-Channel Logout (Authentik tells this site a session it issued has ended). Unconfigured or
 * unreachable, each answers 503 and sets nothing.
 */
export function mountAuthRoutes(app: Hono, d: RouteDeps): void {
	const redirectUri = `${d.origin}${AUTH_PATHS.callback}`;

	app.get(AUTH_PATHS.signIn, async (c) => {
		if (d.rp === null || d.txnSealer === null) return c.body(null, 503);
		const returnTo = safeReturn(c.req.query("return"), d.home);
		try {
			const silent = c.req.query("prompt") === "none";
			const { url, tx } = await d.rp.begin(redirectUri, returnTo, silent);
			setCookie(c, d.txnCookieName, d.txnSealer.seal(JSON.stringify(tx)), {
				...cookieBase,
				maxAge: TXN_SECONDS,
				prefix: "host",
			});
			return c.redirect(url.href, 302);
		} catch (err) {
			d.onWarn(`sign-in: the issuer is unreachable (${String(err)})`);
			return c.body(null, 503);
		}
	});

	app.get(AUTH_PATHS.callback, async (c) => {
		if (d.rp === null || d.txnSealer === null) return c.body(null, 503);
		const sealed = getCookie(c, d.txnCookieName, "host");
		deleteCookie(c, d.txnCookieName, {
			path: "/",
			secure: true,
			prefix: "host",
		});
		const opened = sealed === undefined ? null : d.txnSealer.open(sealed);
		const tx =
			opened === null
				? null
				: LoginTransactionSchema.safeParse(safeJson(opened));
		if (tx === null || !tx.success) return c.redirect(d.home, 302);
		// A refusal at the provider (access_denied, the person cancelled) ends here, signed out.
		if (c.req.query("error") !== undefined)
			return c.redirect(tx.data.returnTo, 302);
		const search = new URL(c.req.url).search;
		try {
			const signed = await d.rp.finish(
				new URL(`${redirectUri}${search}`),
				tx.data,
			);
			const stores = await d.stores();
			const now = d.now();
			await stores.accounts.signedIn(signed.identity, now);
			const id = newSessionId();
			await stores.sessions.create(hashSessionId(id), {
				subject: signed.identity.subject,
				issuer: signed.identity.issuer,
				sid: signed.sid,
				idToken: signed.idToken,
				email: signed.identity.email,
				name: signed.identity.name,
				createdAt: now,
				lastSeenAt: now,
			});
			setCookie(c, d.cookieName, id, {
				...cookieBase,
				maxAge: SESSION_SECONDS,
				prefix: "host",
			});
			return c.redirect(tx.data.returnTo, 302);
		} catch (err) {
			d.onWarn(`callback refused: ${String(err)}`);
			return c.body(null, 400);
		}
	});

	app.post(AUTH_PATHS.signOut, async (c) => {
		if (!sameOrigin(c.req.raw.headers, c.req.method, d.origin))
			return c.body(null, 403);
		return signOutEverywhere(c, d);
	});

	app.post(AUTH_PATHS.backchannelLogout, async (c) => {
		const noStore = { "cache-control": "no-store" };
		if (d.rp === null) return c.body(null, 503, noStore);
		const body = await c.req.parseBody();
		const token = body.logout_token;
		if (typeof token !== "string" || token === "")
			return c.body(null, 400, noStore);
		try {
			const req = await d.rp.verifyLogout(token);
			const stores = await d.stores();
			if (req.kind === "sid")
				await stores.sessions.removeBySid(req.issuer, req.sid);
			else await stores.sessions.removeBySubject(req.subject);
			return c.body(null, 200, noStore);
		} catch (err) {
			d.onWarn(`back-channel logout refused: ${String(err)}`);
			return c.body(null, 400, noStore);
		}
	});
}

/**
 * Ends this site's session and continues to the provider's end-session, so Authentik ends its own session and
 * back-channels every other site: signing out here is signing out of the estate. Used by sign-out and by erasure.
 */
export async function signOutEverywhere(
	c: Context,
	d: RouteDeps,
): Promise<Response> {
	const id = getCookie(c, d.cookieName, "host");
	deleteCookie(c, d.cookieName, { path: "/", secure: true, prefix: "host" });
	if (id === undefined || id === "") return c.redirect(d.home, 303);
	const stores = await d.stores();
	const hash = hashSessionId(id);
	const rec = await stores.sessions.read(hash);
	await stores.sessions.remove(hash);
	if (rec === null || d.rp === null) return c.redirect(d.home, 303);
	try {
		const end = await d.rp.endSession(rec.idToken, `${d.origin}${d.home}`);
		return c.redirect(end?.href ?? d.home, 303);
	} catch (err) {
		d.onWarn(
			`sign-out: the issuer is unreachable; signed out here only (${String(err)})`,
		);
		return c.redirect(d.home, 303);
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
