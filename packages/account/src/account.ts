import type { Context, Hono, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { type AuthzClient, createAuthzClient, StaticTokenSource } from "./authz/client";
import { type AccountConfig, type Env, loadAccountConfig } from "./config";
import { createGuard, type Guard } from "./guard";
import { createRelyingParty } from "./oidc";
import { AUTH_PATHS, mountAuthRoutes, signOutEverywhere } from "./routes";
import { createSealer } from "./seal";
import { memoryStores } from "./stores/memory";
import { postgresStores } from "./stores/postgres";
import type { Stores } from "./stores/types";

/** One psi site, as the account knows it. */
export interface SiteBinding {
	/** The site's Authentik application slug, e.g. `blog-web` (its issuer is `…/application/o/<slug>/`). */
	slug: string;
	/** Short and unique per site: cookies are `__Host-psi-<key>-session`, so sites on one dev host never collide. */
	key: string;
	/** The site's public origin (`https://blog.psizone.ro`; `http://localhost:4340` in dev). */
	origin: string;
	/** Where a person lands after signing in with no return path, and after signing out. Default "/". */
	home?: string;
}

export interface AccountStatus {
	identity: "ready" | "missing";
	authz: "ready" | "missing";
	/** Keys absent from the environment (outside production; production refuses to boot instead). */
	missing: ReadonlyArray<string>;
	storage: "postgres" | "memory" | "injected";
}

export interface Account extends Guard {
	/**
	 * False in production when none of the account settings exist (accounts not seeded yet): the site hides the
	 * Compass entry and sign-in lines, and /cont/* and /auth/* answer "coming soon".
	 */
	readonly enabled: boolean;
	readonly status: AccountStatus;
	/** The OpenFGA client, or null when unconfigured — every decision then fails closed. */
	readonly authz: AuthzClient | null;
	/** Mounts the auth routes. Pages that need the person use `session()`, `requireSignIn()` or `can()`. */
	mount(app: Hono): void;
	stores(): Promise<Stores>;
	/** Where a sign-in link points, returning to `returnTo` (same-origin path). */
	signInHref(returnTo: string): string;
	readonly signOutAction: string;
	/**
	 * For a page that shows the person (the account page): loads the session and, when the browser has none, makes
	 * ONE silent round trip to the provider (`prompt=none`) — a person already signed in on another site comes back
	 * signed in here without a screen; anyone else comes back signed out. At most once every two minutes per browser.
	 */
	recognise(): MiddlewareHandler;
	/** Ends this site's session and continues to the provider's end-session (sign-out everywhere). */
	signOutEverywhere(c: Context): Promise<Response>;
	/** This site's public origin, for same-origin checks on its own writes. */
	readonly origin: string;
}

export interface CreateAccountOptions {
	site: SiteBinding;
	env?: Env;
	/** Injected in tests. */
	stores?: Stores;
	now?: () => number;
	fetch?: typeof globalThis.fetch;
	onWarn?: (message: string) => void;
}

/**
 * The account for one site: configuration from the environment (fail loud in production), the relying party, the
 * session guard, the OpenFGA client and the stores. Construction never touches the network; the issuer and the
 * database are reached on first use, so a site boots and serves its public pages whatever is down.
 */
export function createAccount(opts: CreateAccountOptions): Account {
	const env = opts.env ?? process.env;
	const config: AccountConfig = loadAccountConfig(env, opts.site.slug);
	const now = opts.now ?? Date.now;
	const onWarn = opts.onWarn ?? ((m: string) => console.warn(`[account:${opts.site.key}] ${m}`));
	const home = opts.site.home ?? "/";
	const cookieName = `psi-${opts.site.key}-session`;
	const txnCookieName = `psi-${opts.site.key}-txn`;
	const checkedCookieName = `psi-${opts.site.key}-sso-checked`;

	const identity = config.identity.kind === "ready" ? config.identity.config : null;
	const rp = identity === null ? null : createRelyingParty(identity);
	const txnSealer = identity === null ? null : createSealer(identity.sessionSecret, "login-txn");

	const authz =
		config.authz.kind === "ready"
			? createAuthzClient({
					endpoint: config.authz.config.endpoint,
					storeId: config.authz.config.storeId,
					modelId: config.authz.config.modelId,
					token: new StaticTokenSource(config.authz.config.token),
					...(opts.fetch !== undefined ? { fetch: opts.fetch } : {}),
					...(opts.now !== undefined ? { now: opts.now } : {}),
				})
			: null;

	let pending: Promise<Stores> | null = null;
	const stores = (): Promise<Stores> => {
		if (opts.stores !== undefined) return Promise.resolve(opts.stores);
		if (pending === null) {
			const url = config.databaseUrl;
			pending =
				url === null
					? Promise.resolve(memoryStores())
					: postgresStores(url).catch((err: unknown) => {
							pending = null;
							throw err;
						});
		}
		return pending;
	};

	const guard = createGuard({
		cookieName,
		sessions: async () => (await stores()).sessions,
		authz,
		now,
		signInPath: AUTH_PATHS.signIn,
		onWarn,
	});

	const routeDeps = {
		origin: opts.site.origin,
		cookieName,
		txnCookieName,
		rp,
		txnSealer,
		stores,
		now,
		home,
		onWarn,
	};

	const missing = [
		...(config.identity.kind === "missing" ? config.identity.keys : []),
		...(config.authz.kind === "missing" ? config.authz.keys : []),
	];
	if (!config.enabled)
		onWarn(
			`accounts are off for ${opts.site.slug}: no account settings in production; /cont answers "coming soon"`,
		);
	else if (missing.length > 0)
		onWarn(`accounts not fully configured; missing ${missing.join(", ")}`);

	return {
		...guard,
		enabled: config.enabled,
		status: {
			identity: config.identity.kind,
			authz: config.authz.kind,
			missing,
			storage:
				opts.stores !== undefined
					? "injected"
					: config.databaseUrl !== null
						? "postgres"
						: "memory",
		},
		authz,
		mount(app) {
			// Accounts off: no sign-in exists, and every /auth/* path lands on the "coming soon" page.
			if (!config.enabled) app.all("/auth/*", (c) => c.redirect("/cont", 302));
			else mountAuthRoutes(app, routeDeps);
		},
		stores,
		signInHref(returnTo) {
			return `${AUTH_PATHS.signIn}?return=${encodeURIComponent(returnTo)}`;
		},
		signOutAction: AUTH_PATHS.signOut,
		signOutEverywhere: (c) => signOutEverywhere(c, routeDeps),
		origin: opts.site.origin,
		recognise() {
			const load = guard.session();
			return async (c, next) => {
				await load(c, async () => {});
				if (guard.current(c) !== null || rp === null || c.req.method !== "GET") return next();
				if (getCookie(c, checkedCookieName, "host") !== undefined) return next();
				setCookie(c, checkedCookieName, "1", {
					path: "/",
					secure: true,
					httpOnly: true,
					sameSite: "Lax",
					maxAge: 120,
					prefix: "host",
				});
				const here = new URL(c.req.url);
				const back = encodeURIComponent(`${here.pathname}${here.search}`);
				return c.redirect(`${AUTH_PATHS.signIn}?prompt=none&return=${back}`, 302);
			};
		},
	};
}
