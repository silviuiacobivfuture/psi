/**
 * DEV ONLY — the ONE local identity provider for the whole local estate (docs/plans/accounts.md, "Local showcase"):
 *
 *   pnpm dev:sso      →  http://localhost:4351, Authentik's URL layout: the issuer of app <slug> is
 *                        http://localhost:4351/application/o/<slug>/
 *
 * Localhost is never registered in the estate's Authentik, so local sign-in never leaves this machine. One browser
 * session at the issuer signs a person in on every local app (single sign-on); signing out of any site ends it and
 * back-channels every site (single logout).
 *
 * Client secrets live in packages/account/.env.sso (gitignored, mode 600), generated on first run and kept. The four
 * sites' OIDC lines are written into their own .env block ("local sso"); the CMS's .env is its owner's to update,
 * with the names this prints (never the values). Loopback only; refuses NODE_ENV=production.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { readBlock, writeBlock } from "./env-block";
import { type MockClient, type MockPerson, startMockIssuer } from "./mock-issuer";

const PORT = 4351;
const ORIGIN = `http://localhost:${PORT}`;
const ROOT = join(import.meta.dirname, "..", "..", "..");
const SECRETS = join(ROOT, "packages", "account", ".env.sso");

/** Every local app, its exact callback and where it returns after sign-out. */
const APPS = [
	{
		slug: "cms",
		callback: "http://localhost:4350/api/users/oauth/callback",
		home: "http://localhost:4350/admin",
		backchannel: false,
	},
	...(
		[
			["psizone-web", 4310],
			["eqsync-web", 4320],
			["hemisync-web", 4330],
			["blog-web", 4340],
		] as const
	).map(([slug, port]) => ({
		slug,
		callback: `http://localhost:${port}/auth/callback`,
		home: `http://localhost:${port}/`,
		backchannel: true,
	})),
] as const;

/** Clearly fake people, one per role the local estate shows. Groups follow the `app-<app>-<role>` convention. */
const DEMO_PEOPLE: ReadonlyArray<MockPerson> = [
	{
		sub: "local-0001-admin",
		email: "admin@psi.test",
		name: "Ada Admin (demo)",
		groups: ["app-cms-admin"],
	},
	{
		sub: "local-0002-ed-psizone",
		email: "editor.psizone@psi.test",
		name: "Elena Editor Psizone (demo)",
		groups: ["app-cms-editor"],
	},
	{
		sub: "local-0003-ed-eqsync",
		email: "editor.eqsync@psi.test",
		name: "Emil Editor EQ-SYNC (demo)",
		groups: ["app-cms-editor"],
	},
	{
		sub: "local-0004-ed-hemisync",
		email: "editor.hemisync@psi.test",
		name: "Eva Editor Hemi-Sync (demo)",
		groups: ["app-cms-editor"],
	},
	{
		sub: "local-0005-reviewer",
		email: "reviewer@psi.test",
		name: "Radu Clinical Reviewer (demo)",
		groups: ["app-cms-reviewer"],
	},
	{
		sub: "local-0006-publisher",
		email: "publisher@psi.test",
		name: "Paula Publisher (demo)",
		groups: ["app-cms-publisher"],
	},
	{
		sub: "local-0007-visitor",
		email: "visitor@psi.test",
		name: "Vlad Visitor (demo)",
		groups: [],
	},
];

const secretKey = (slug: string): string =>
	`${slug.toUpperCase().replace(/-/g, "_")}_CLIENT_SECRET`;

/** The client secrets, generated once and kept, so a restart never invalidates a site's .env. */
function clientSecrets(): Record<string, string> {
	const held = readBlock(SECRETS, "local sso clients");
	const lines = APPS.map((app) => {
		const key = secretKey(app.slug);
		return `${key}=${held[key] ?? randomBytes(32).toString("base64url")}`;
	});
	writeBlock(SECRETS, "local sso clients", lines);
	return readBlock(SECRETS, "local sso clients");
}

const secrets = clientSecrets();
const clients: MockClient[] = APPS.map((app) => ({
	slug: app.slug,
	clientId: `${app.slug}-local`,
	clientSecret: secrets[secretKey(app.slug)] ?? "",
	redirectUris: [app.callback],
	postLogoutRedirectUris: [app.home],
	...(app.backchannel ? { logoutUri: `${new URL(app.home).origin}/auth/backchannel-logout` } : {}),
}));

for (const client of clients) {
	if (client.slug === "cms") continue;
	const changed = writeBlock(join(ROOT, "apps", client.slug, ".env"), "local sso", [
		`OIDC_ISSUER=${ORIGIN}/application/o/${client.slug}/`,
		"OIDC_ALLOW_INSECURE_LOOPBACK=true",
		`OIDC_CLIENT_ID=${client.clientId}`,
		`OIDC_CLIENT_SECRET=${client.clientSecret}`,
	]);
	if (changed)
		console.log(
			`apps/${client.slug}/.env: OIDC lines written (restart that dev server to read them)`,
		);
}

const mock = await startMockIssuer({
	port: PORT,
	hosts: ["127.0.0.1", "::1"],
	origin: ORIGIN,
	chooser: true,
	clients,
	people: DEMO_PEOPLE,
});
console.log(
	`local identity provider (DEV ONLY) at ${mock.origin}; apps: ${clients.map((c) => c.slug).join(", ")}`,
);
console.log(
	`cms .env: OIDC_ISSUER=${ORIGIN}/application/o/cms/  OIDC_CLIENT_ID=cms-local  OIDC_CLIENT_SECRET=<CMS_CLIENT_SECRET in packages/account/.env.sso>`,
);
