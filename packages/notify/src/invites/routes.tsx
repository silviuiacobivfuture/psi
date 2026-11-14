import { Hono } from "hono";
import type { AppKey } from "../apps";
import { verifyToken } from "../reminders/token";
import { InvitePage, type InvitePageKind } from "./pages";

/** What an invitation link can do right now, as the service's store says. */
export type InviteLinkState = "ok" | "expired" | "replaced" | "revoked" | "active" | "gone";

/** What the scheduling service implements behind the link. */
export interface InviteLinkActions {
	/** Reads only: the state of the invitation `tokenId` of this client. */
	inspect(app: AppKey, clientId: string, tokenId: string): Promise<InviteLinkState>;
	/**
	 * Where to send the person: the sign-in's set-password page for an account created for them, or the site's sign-in for
	 * one that existed. Throws when the sign-in cannot be reached.
	 */
	proceed(app: AppKey, clientId: string, tokenId: string): Promise<{ url: string } | undefined>;
	/** The site's account page, where an already-active person signs in. */
	signInUrl(app: AppKey): string;
}

export interface InviteRoutesOptions {
	secret: string;
	actions: InviteLinkActions;
	/** The app the request belongs to; a token of another app is refused. */
	app: AppKey;
	now?: () => number;
}

const HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"cache-control": "no-store",
	"referrer-policy": "no-referrer",
	"x-robots-tag": "noindex",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
} as const;

const STATE_PAGE: Readonly<Record<Exclude<InviteLinkState, "ok">, InvitePageKind>> = {
	expired: "expired",
	replaced: "replaced",
	revoked: "revoked",
	active: "active",
	gone: "invalid",
};
const STATE_STATUS: Readonly<Record<Exclude<InviteLinkState, "ok">, 200 | 400 | 410>> = {
	expired: 410,
	replaced: 410,
	revoked: 410,
	active: 200,
	gone: 410,
};

/**
 * `/v1/public/invites/:token` for the scheduling API to mount. GET changes nothing and only asks the person to press a
 * button (a mail scanner or a link preview fetches every link in a message); the button POSTs, and the answer is a
 * redirect to the sign-in. The link is NOT single use: it works until it expires, is withdrawn, or a newer one replaces it,
 * so a person who closes the tab can come back to the same e-mail.
 */
export function createInviteRoutes(options: InviteRoutesOptions): Hono {
	const now = options.now ?? Date.now;
	const app = new Hono();

	function page(
		kind: InvitePageKind,
		locale: "ro" | "en",
		status: 200 | 400 | 410 | 503 = 200,
		signInUrl?: string,
	): Response {
		return new Response(
			`<!doctype html>${(<InvitePage app={options.app} locale={locale} kind={kind} {...(signInUrl === undefined ? {} : { signInUrl })} />).toString()}`,
			{ status, headers: HEADERS },
		);
	}

	async function open(token: string, send: boolean): Promise<Response> {
		const v = verifyToken({
			secret: options.secret,
			token,
			now: now(),
			expectApp: options.app,
			expectAction: "invite",
		});
		if (!v.ok)
			return v.failure === "expired"
				? page("expired", v.claims?.l ?? "ro", 410)
				: page("invalid", "ro", 400);
		const { claims } = v;
		const state = await options.actions.inspect(options.app, claims.i, claims.j);
		if (state !== "ok")
			return page(
				STATE_PAGE[state],
				claims.l,
				STATE_STATUS[state],
				state === "active" ? options.actions.signInUrl(options.app) : undefined,
			);
		if (!send) return page("ask", claims.l);
		let next: { url: string } | undefined;
		try {
			next = await options.actions.proceed(options.app, claims.i, claims.j);
		} catch {
			return new Response(
				`<!doctype html>${(<InvitePage app={options.app} locale={claims.l} kind="unavailable" />).toString()}`,
				{ status: 503, headers: { ...HEADERS, "retry-after": "60" } },
			);
		}
		if (next === undefined) return page("invalid", claims.l, 410);
		return new Response(null, {
			status: 303,
			headers: {
				location: next.url,
				"cache-control": "no-store",
				"referrer-policy": "no-referrer",
			},
		});
	}

	app.get("/:token", (c) => open(c.req.param("token"), false));
	app.post("/:token", (c) => open(c.req.param("token"), true));
	return app;
}
