import { z } from "zod";

/**
 * The account's configuration, parsed from the environment (docs/plans/accounts.md §6). The four sites read the
 * SAME variable names from their own environment, so dropping a site's values from OpenBao into its Secret is all
 * it takes.
 *
 * In production accounts are optional: with every account setting present they are on, with none they are off (the
 * sites boot and say "coming soon"), and with some a boot stops naming the missing keys (SEB's
 * `MISSING REQUIRED SECRET: <key>`). Outside production the site still boots: what is missing is reported, sign-in answers "not configured" and protected
 * surfaces fail closed — a workstation without Authentik or OpenFGA keeps serving its public pages.
 */

export type Env = Readonly<Record<string, string | undefined>>;

/** Where psi's Authentik answers (e3e61b5). An application's issuer is `<this>/application/o/<slug>/`. */
export const DEFAULT_AUTHENTIK_URL = "https://auth.psizone.ro";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

const nonEmpty = z.string().trim().min(1);

export interface IdentityConfig {
	issuer: string;
	clientId: string;
	clientSecret: string;
	sessionSecret: string;
	/** Plain http to a loopback issuer — the local mock only. Refused in production. */
	allowInsecureLoopback: boolean;
}

export interface AuthzConfig {
	endpoint: string;
	storeId: string;
	modelId: string;
	token: string;
}

export type Part<T> =
	| { readonly kind: "ready"; readonly config: T }
	| { readonly kind: "missing"; readonly keys: ReadonlyArray<string> };

export interface AccountConfig {
	production: boolean;
	/**
	 * False only in production with NONE of the account settings: accounts are an optional feature, so the sites
	 * boot without them and say "coming soon". Outside production always true (what is missing is reported).
	 */
	enabled: boolean;
	identity: Part<IdentityConfig>;
	authz: Part<AuthzConfig>;
	/** Absent outside production: sessions and records then live in memory, for one process. */
	databaseUrl: string | null;
}

/** The issuer a site uses when OIDC_ISSUER is unset: its own Authentik application. */
export function defaultIssuer(env: Env, slug: string): string {
	const base = (env.AUTHENTIK_URL?.trim() || DEFAULT_AUTHENTIK_URL).replace(/\/+$/, "");
	return `${base}/application/o/${slug}/`;
}

function missingKeys(env: Env, keys: ReadonlyArray<string>): string[] {
	return keys.filter((k) => !nonEmpty.safeParse(env[k] ?? "").success);
}

function parseIdentity(env: Env, slug: string, production: boolean): Part<IdentityConfig> {
	const missing = missingKeys(env, ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "SESSION_SECRET"]);
	if (missing.length > 0) return { kind: "missing", keys: missing };
	const issuer = z
		.string()
		.url()
		.parse(env.OIDC_ISSUER?.trim() || defaultIssuer(env, slug));
	const secret = env.SESSION_SECRET?.trim() ?? "";
	if (secret.length < 32) {
		throw new Error("account: SESSION_SECRET must be at least 32 characters");
	}
	const insecure = env.OIDC_ALLOW_INSECURE_LOOPBACK === "true";
	if (insecure && production) {
		throw new Error("account: OIDC_ALLOW_INSECURE_LOOPBACK is refused in production");
	}
	const url = new URL(issuer);
	if (url.protocol !== "https:" && !(insecure && LOOPBACK.has(url.hostname))) {
		throw new Error(`account: OIDC_ISSUER must be https (got ${url.origin})`);
	}
	return {
		kind: "ready",
		config: {
			issuer,
			clientId: env.OIDC_CLIENT_ID?.trim() ?? "",
			clientSecret: env.OIDC_CLIENT_SECRET?.trim() ?? "",
			sessionSecret: secret,
			allowInsecureLoopback: insecure,
		},
	};
}

function parseAuthz(env: Env): Part<AuthzConfig> {
	const keys = ["OPENFGA_ENDPOINT", "OPENFGA_STORE_ID", "OPENFGA_MODEL_ID", "OPENFGA_TOKEN"];
	const missing = missingKeys(env, keys);
	if (missing.length > 0) return { kind: "missing", keys: missing };
	return {
		kind: "ready",
		config: {
			endpoint: z
				.string()
				.url()
				.parse(env.OPENFGA_ENDPOINT?.trim() ?? ""),
			storeId: env.OPENFGA_STORE_ID?.trim() ?? "",
			modelId: env.OPENFGA_MODEL_ID?.trim() ?? "",
			token: env.OPENFGA_TOKEN?.trim() ?? "",
		},
	};
}

/**
 * The settings that switch accounts on in production. All present: enabled. None present: disabled (the sites boot,
 * /cont says "coming soon"). Some present: a misconfiguration, refused. `OIDC_ISSUER` and `AUTHENTIK_URL` have defaults
 * and do not count.
 */
export const ACCOUNT_KEYS = [
	"OIDC_CLIENT_ID",
	"OIDC_CLIENT_SECRET",
	"SESSION_SECRET",
	"ACCOUNT_DATABASE_URL",
	"OPENFGA_ENDPOINT",
	"OPENFGA_STORE_ID",
	"OPENFGA_MODEL_ID",
	"OPENFGA_TOKEN",
] as const;

/**
 * Parses the account configuration for the site whose Authentik application is `slug`. In production: every account
 * setting present → enabled; none → disabled; some → throws `MISSING REQUIRED SECRET`, naming every missing key.
 */
export function loadAccountConfig(env: Env, slug: string): AccountConfig {
	const production = env.NODE_ENV === "production";
	if (production) {
		const missing = missingKeys(env, ACCOUNT_KEYS);
		if (missing.length === ACCOUNT_KEYS.length) {
			return {
				production,
				enabled: false,
				identity: { kind: "missing", keys: missing },
				authz: { kind: "missing", keys: missing },
				databaseUrl: null,
			};
		}
		if (missing.length > 0) {
			throw new Error(`MISSING REQUIRED SECRET: ${missing.join(", ")}`);
		}
	}
	const identity = parseIdentity(env, slug, production);
	const authz = parseAuthz(env);
	const databaseUrl = env.ACCOUNT_DATABASE_URL?.trim() || null;
	return { production, enabled: true, identity, authz, databaseUrl };
}
