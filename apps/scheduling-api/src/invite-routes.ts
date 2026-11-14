import { APP_KEYS, type AppKey } from "@psi/notify";
import { createInviteRoutes, type InviteLinkActions } from "@psi/notify/invites";
import { Hono } from "hono";
import { invites, statusOf } from "./engagement/records";
import { SITE_URLS } from "./ports/novu-env";
import type { SsoPort } from "./ports/sso";
import type { StorePort } from "./store/types";

const PREFIX = "/v1/public/invites";

/** The app an invitation token names, read WITHOUT trusting it: it only picks whose routes verify the signature. */
function appOfToken(token: string): AppKey | undefined {
	const body = token.split(".")[0] ?? "";
	try {
		const claims: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
		const app =
			typeof claims === "object" && claims !== null ? Reflect.get(claims, "a") : undefined;
		return APP_KEYS.find((k) => k === app);
	} catch {
		return undefined;
	}
}

/** What an invitation link may do, read from the invitation row; the link proved who may, so nothing here asks OpenFGA. */
export function createInviteActions(
	store: StorePort,
	sso: SsoPort | undefined,
	clock: () => number,
): InviteLinkActions {
	const rows = invites(store.keyed);
	return {
		async inspect(app, clientId, tokenId) {
			const held = await rows.get(app, clientId);
			if (held === undefined) return "gone";
			const { row } = held;
			if (row.status === "revoked") return "revoked";
			if (row.tokenId !== tokenId) return "replaced";
			if (row.status === "active") return "active";
			return statusOf(row, clock()) === "expired" ? "expired" : "ok";
		},
		async proceed(app, clientId) {
			const held = await rows.get(app, clientId);
			if (held === undefined || held.row.status === "revoked") return undefined;
			// An account that existed before is signed into, never reset.
			if (held.row.existingAccount) return { url: `${SITE_URLS[app]}/cont` };
			if (sso === undefined) throw new Error("the sign-in is not configured");
			return { url: await sso.recoveryLink(held.row.ssoUserId) };
		},
		signInUrl: (app) => `${SITE_URLS[app]}/cont`,
	};
}

export interface MountedInviteOptions {
	secret: string;
	actions: InviteLinkActions;
	now?: () => number;
}

/** `/v1/public/invites/:token`: one service answers for every app on one host, so the token names the app whose routes verify it. */
export function mountInviteRoutes(options: MountedInviteOptions): Hono {
	const perApp = new Map(
		APP_KEYS.map((app) => [
			app,
			createInviteRoutes({
				secret: options.secret,
				actions: options.actions,
				app,
				...(options.now === undefined ? {} : { now: options.now }),
			}),
		]),
	);
	const root = new Hono();
	root.all("/:token", (c) => {
		const app = appOfToken(c.req.param("token"));
		const routes = app === undefined ? undefined : perApp.get(app);
		if (routes === undefined) return c.notFound();
		const url = new URL(c.req.url);
		url.pathname = url.pathname.slice(PREFIX.length);
		return routes.fetch(new Request(url, c.req.raw));
	});
	return root;
}
