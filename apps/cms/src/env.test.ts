import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const good = {
	PAYLOAD_SECRET: "x".repeat(32),
	DATABASE_URI: "postgresql://u:p@cms-db-rw:5432/cms",
	SERVER_URL: "https://cms.psizone.ro",
	S3_BUCKET: "psi-cms-dev",
	S3_REGION: "nbg1",
	S3_ENDPOINT: "https://nbg1.your-objectstorage.com",
	S3_ACCESS_KEY_ID: "a",
	S3_SECRET_ACCESS_KEY: "b",
	OIDC_ISSUER: "https://sso.psizone.ro/application/o/cms/",
	OIDC_CLIENT_ID: "c",
	OIDC_CLIENT_SECRET: "d",
	BREAKGLASS_EMAIL: "breakglass@psizone.ro",
	BREAKGLASS_PASSWORD: "y".repeat(16),
};

describe("parseEnv", () => {
	it("accepts a complete environment", () => {
		expect(parseEnv(good).SERVER_URL).toBe("https://cms.psizone.ro");
	});
	it.each(Object.keys(good))("names %s when it is missing, and never its value", (key) => {
		const env: Record<string, string | undefined> = { ...good, [key]: undefined };
		expect(() => parseEnv(env)).toThrow(`MISSING OR INVALID ENV: ${key}`);
	});
	it.each([
		["SERVER_URL", "https://cms.psizone.ro/"],
		["OIDC_ISSUER", "https://sso.psizone.ro/application/o/cms"],
		["PAYLOAD_SECRET", "short"],
		["BREAKGLASS_PASSWORD", "short"],
		["DATABASE_URI", "mysql://x"],
	])("refuses a malformed %s", (key, value) => {
		expect(() => parseEnv({ ...good, [key]: value })).toThrow(key);
	});
	it("does not put a secret's value into the error", () => {
		try {
			parseEnv({ ...good, PAYLOAD_SECRET: "leaky" });
		} catch (e) {
			expect(String(e)).not.toContain("leaky");
		}
	});
});
