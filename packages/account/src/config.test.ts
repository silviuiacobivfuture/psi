import { describe, expect, it } from "vitest";
import { createAuthzClient, StaticTokenSource } from "./authz/client";
import { defaultIssuer, loadAccountConfig } from "./config";

const FULL = {
	OIDC_CLIENT_ID: "id",
	OIDC_CLIENT_SECRET: "secret",
	SESSION_SECRET: "s".repeat(32),
	OPENFGA_ENDPOINT: "http://openfga.openfga.svc:8081",
	OPENFGA_STORE_ID: "01STORE",
	OPENFGA_MODEL_ID: "01MODEL",
	OPENFGA_TOKEN: "key",
	ACCOUNT_DATABASE_URL: "postgres://u:p@account-db-rw.account:5432/account",
};

describe("account configuration", () => {
	it("defaults the issuer to the site's own Authentik application at auth.psizone.ro", () => {
		expect(defaultIssuer({}, "blog-web")).toBe("https://auth.psizone.ro/application/o/blog-web/");
		const c = loadAccountConfig({ ...FULL, NODE_ENV: "production" }, "blog-web");
		expect(c.identity).toMatchObject({
			kind: "ready",
			config: { issuer: "https://auth.psizone.ro/application/o/blog-web/" },
		});
		expect(c.authz.kind).toBe("ready");
	});

	it("in production, no account settings at all turns accounts off instead of failing", () => {
		const c = loadAccountConfig(
			{
				NODE_ENV: "production",
				OIDC_ISSUER: "https://auth.psizone.ro/application/o/blog-web/",
			},
			"blog-web",
		);
		expect(c.enabled).toBe(false);
		expect(c.identity.kind).toBe("missing");
		expect(c.authz.kind).toBe("missing");
		expect(loadAccountConfig({ ...FULL, NODE_ENV: "production" }, "blog-web").enabled).toBe(true);
	});

	it("in production, a partial configuration fails loud, naming every missing key at once", () => {
		expect(() =>
			loadAccountConfig(
				{
					NODE_ENV: "production",
					OIDC_CLIENT_ID: "id",
					SESSION_SECRET: "s".repeat(32),
				},
				"blog-web",
			),
		).toThrow(
			"MISSING REQUIRED SECRET: OIDC_CLIENT_SECRET, ACCOUNT_DATABASE_URL, OPENFGA_ENDPOINT, OPENFGA_STORE_ID, OPENFGA_MODEL_ID, OPENFGA_TOKEN",
		);
		const { OPENFGA_TOKEN: _dropped, ...almost } = FULL;
		expect(() => loadAccountConfig({ ...almost, NODE_ENV: "production" }, "blog-web")).toThrow(
			"MISSING REQUIRED SECRET: OPENFGA_TOKEN",
		);
	});

	it("boots outside production with what is missing reported, never thrown", () => {
		const c = loadAccountConfig({}, "blog-web");
		expect(c.identity).toEqual({
			kind: "missing",
			keys: ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "SESSION_SECRET"],
		});
		expect(c.databaseUrl).toBeNull();
	});

	it("refuses plain http to a non-loopback issuer, the loopback flag in production, and a short secret", () => {
		expect(() =>
			loadAccountConfig({ ...FULL, OIDC_ISSUER: "http://auth.psizone.ro/application/o/x/" }, "x"),
		).toThrow("https");
		expect(() =>
			loadAccountConfig(
				{
					...FULL,
					NODE_ENV: "production",
					OIDC_ALLOW_INSECURE_LOOPBACK: "true",
				},
				"x",
			),
		).toThrow("refused in production");
		expect(() => loadAccountConfig({ ...FULL, SESSION_SECRET: "short" }, "x")).toThrow("32");
		expect(
			loadAccountConfig(
				{
					...FULL,
					OIDC_ISSUER: "http://127.0.0.1:4361/application/o/x/",
					OIDC_ALLOW_INSECURE_LOOPBACK: "true",
				},
				"x",
			).identity.kind,
		).toBe("ready");
	});

	it("refuses an OpenFGA client without a pinned model (D5)", () => {
		const token = new StaticTokenSource("k");
		expect(() =>
			createAuthzClient({
				endpoint: "http://x",
				storeId: "s",
				modelId: "",
				token,
			}),
		).toThrow("pinned");
		expect(() =>
			createAuthzClient({
				endpoint: "http://x",
				storeId: "s",
				modelId: "latest",
				token,
			}),
		).toThrow("pinned");
	});
});
