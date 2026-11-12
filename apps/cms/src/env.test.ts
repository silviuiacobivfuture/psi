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
	OIDC_ISSUER: "https://auth.psizone.ro/application/o/cms/",
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
		["OIDC_ISSUER", "https://auth.psizone.ro/application/o/cms"],
		["PAYLOAD_SECRET", "short"],
		["BREAKGLASS_PASSWORD", "short"],
		["DATABASE_URI", "mysql://x"],
	])("refuses a malformed %s", (key, value) => {
		expect(() => parseEnv({ ...good, [key]: value })).toThrow(key);
	});
	it("accepts an environment without object storage (media on disk, development)", () => {
		const { S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, ...rest } =
			good;
		expect(parseEnv(rest).S3_BUCKET).toBeUndefined();
	});
	it("needs OpenFGA's address, store and token when the openfga adapter is chosen", () => {
		expect(() => parseEnv({ ...good, AUTHZ_ADAPTER: "openfga" })).toThrow(
			"MISSING OR INVALID ENV: OPENFGA_API_TOKEN, OPENFGA_API_URL, OPENFGA_STORE_ID",
		);
	});
	it("refuses a short shared secret and a malformed site list", () => {
		expect(() => parseEnv({ ...good, CMS_REVALIDATE_SECRET: "short" })).toThrow(
			"CMS_REVALIDATE_SECRET",
		);
		expect(() => parseEnv({ ...good, SITE_WEBHOOK_URLS: "https://blog.psizone.ro/" })).toThrow(
			"SITE_WEBHOOK_URLS",
		);
		expect(
			parseEnv({ ...good, SITE_WEBHOOK_URLS: "https://blog.psizone.ro, https://psizone.ro" })
				.SITE_WEBHOOK_URLS,
		).toEqual(["https://blog.psizone.ro", "https://psizone.ro"]);
	});
	it("does not put a secret's value into the error", () => {
		try {
			parseEnv({ ...good, PAYLOAD_SECRET: "leaky" });
		} catch (e) {
			expect(String(e)).not.toContain("leaky");
		}
	});
});
