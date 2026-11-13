import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

describe("the deployment declares every secret in all four places", () => {
	const external = sorted(
		[
			...read("gitops/services/scheduling-api/base/externalsecret.yaml").matchAll(
				/secretKey: (\w+)/g,
			),
		].map((m) => m[1] ?? ""),
	);
	const asserted = sorted(
		[
			...read("gitops/services/scheduling-api/base/deployment.yaml").matchAll(
				/MISSING REQUIRED SECRET: (\w+)/g,
			),
		].map((m) => m[1] ?? ""),
	);
	const declared = read("apps/scheduling-api/seb.app.yaml");
	const required = sorted(
		[
			...(declared.split("requiredEnv:")[1]?.split("initContainers:")[0] ?? "").matchAll(
				/- (\w+)/g,
			),
		].map((m) => m[1] ?? ""),
	);

	it("ExternalSecret data[], assert-secrets and seb.app.yaml name the same keys", () => {
		expect(external.length).toBeGreaterThan(10);
		expect(asserted).toEqual(external);
		expect(required).toEqual(external);
	});

	it("the APP-SECRETS row names every key (or the OpenBao property it is read from)", () => {
		const row =
			read("estate/APP-SECRETS.md")
				.split("\n")
				.find((l) => l.startsWith("| `scheduling-api`")) ?? "";
		const alias: Record<string, string> = {
			OPENFGA_TOKEN: "OPENFGA_AUTHN_PRESHARED_KEYS",
			S3_ACCESS_KEY_ID: "access_key_id",
			S3_SECRET_ACCESS_KEY: "secret_access_key",
			NOVU_SECRET_KEY: "secret_key",
		};
		for (const key of external)
			expect(row.includes(key) || row.includes(alias[key] ?? "\u0000"), key).toBe(true);
	});

	it("the notification settings are wired: Novu's key and the link secret are secrets, its address plain env, and egress reaches Novu", () => {
		const d = read("gitops/services/scheduling-api/base/deployment.yaml");
		const e = read("gitops/services/scheduling-api/base/externalsecret.yaml");
		expect(external).toEqual(expect.arrayContaining(["NOVU_SECRET_KEY", "REMINDER_LINK_SECRET"]));
		expect(e).toContain("key: apps/novu/estate, property: secret_key");
		expect(e).toContain("key: apps/notify/reminder-links, property: REMINDER_LINK_SECRET");
		expect(d).toContain('name: NOVU_API_URL, value: "http://novu-api.novu.svc:3000"');
		expect(d).not.toMatch(/name: (NOVU_SECRET_KEY|REMINDER_LINK_SECRET), value/);
		const policy = read("gitops/services/scheduling-api/base/networkpolicy.yaml");
		// namespace AND pod in ONE `to` element (two elements would be an OR), on the API's port
		expect(policy).toMatch(
			/- to:\n\s+- namespaceSelector:\n\s+matchLabels: \{ kubernetes.io\/metadata.name: novu \}\n\s+podSelector:\n\s+matchLabels: \{ app.kubernetes.io\/name: novu-api \}\n\s+ports:\n\s+- \{ protocol: TCP, port: 3000 \}/,
		);
		const declared = read("apps/scheduling-api/seb.app.yaml");
		expect(declared).toContain("path: apps/notify/reminder-links");
		expect(declared.match(/NOVU_SECRET_KEY/g)?.length).toBeGreaterThanOrEqual(3);
	});

	it("the sign-in's settings are an OPTIONAL set: their own ExternalSecret, an optional envFrom, in no required list, and never half in plain env", () => {
		const sso = read("gitops/services/scheduling-api/base/sso-externalsecret.yaml");
		const d = read("gitops/services/scheduling-api/base/deployment.yaml");
		const keys = sorted([...sso.matchAll(/secretKey: (\w+)/g)].map((m) => m[1] ?? ""));
		expect(keys).toEqual(["AUTHENTIK_API_TOKEN", "AUTHENTIK_URL"]);
		expect(sso).toContain("name: scheduling-api-sso");
		expect(sso).not.toContain("dataFrom:");
		for (const key of keys) expect(sso).toContain(`key: apps/scheduling-api/sso, property: ${key}`);
		expect(d).toContain("secretRef: { name: scheduling-api-sso, optional: true }");
		// One half in plain env would stop the boot (the service refuses an address without its token): both come from the secret.
		expect(d).not.toMatch(/name: AUTHENTIK_/);
		for (const key of keys) {
			expect(asserted).not.toContain(key);
			expect(required).not.toContain(key);
			expect(external).not.toContain(key);
		}
		expect(read("gitops/services/scheduling-api/base/kustomization.yaml")).toContain(
			"sso-externalsecret.yaml",
		);
		const row =
			read("estate/APP-SECRETS.md")
				.split("\n")
				.find((l) => l.startsWith("| `scheduling-api`")) ?? "";
		for (const needle of [
			"secret/apps/scheduling-api/sso",
			"AUTHENTIK_URL",
			"AUTHENTIK_API_TOKEN",
			"optional",
		])
			expect(row, needle).toContain(needle);
	});

	it("no ExternalSecret reads everything from a path", () => {
		expect(read("gitops/services/scheduling-api/base/externalsecret.yaml")).not.toContain(
			"dataFrom:",
		);
	});

	it("the pod is non-root with a read-only filesystem, dropped capabilities and limits; the model id is a secret pin, not plain env", () => {
		const d = read("gitops/services/scheduling-api/base/deployment.yaml");
		for (const needle of [
			"runAsNonRoot: true",
			"readOnlyRootFilesystem: true",
			'drop: ["ALL"]',
			"limits:",
			"replicas: 2",
			"harbor-pull",
		])
			expect(d, needle).toContain(needle);
		expect(d).not.toMatch(/name: OPENFGA_MODEL_ID, value/);
	});

	it("is built by apps.yml (a Dockerfile in the app) and registered with Argo, beside the clinic console", () => {
		expect(read("apps/scheduling-api/Dockerfile")).toContain("scheduling-api");
		// @psi/notify generates its messages: the image builds the packages the service depends on before it bundles.
		expect(read("apps/scheduling-api/Dockerfile")).toContain('"@psi/scheduling-api^..."');
		const registered = read("gitops/apps/overlays/dev/apps/kustomization.yaml");
		expect(registered).toContain("- scheduling-api.yaml");
		expect(registered).toContain("- clinic.yaml");
		expect(read("gitops/apps/overlays/dev/apps/scheduling-api.yaml")).toContain(
			"name: scheduling-api",
		);
	});

	it("the dev host is the one the ingress, the public URL and the CORS origin name, and the store admits this pod", () => {
		const d = read("gitops/services/scheduling-api/base/deployment.yaml");
		const ingress = read("gitops/services/scheduling-api/base/ingress.yaml");
		expect(ingress.match(/api-programari-dev\.psizone\.ro/g)).toHaveLength(3);
		expect(d).toContain('name: PUBLIC_URL, value: "https://api-programari-dev.psizone.ro"');
		expect(d).toContain('name: CORS_ORIGINS, value: "https://programari-dev.psizone.ro"');
		expect(d).toContain('name: CONSOLE_URL, value: "https://programari-dev.psizone.ro"');
		expect(read("gitops/services/scheduling-backend/base/networkpolicy.yaml")).toMatch(
			/kubernetes\.io\/metadata\.name: scheduling-api \}\n\s+podSelector:\n\s+matchLabels: \{ app: scheduling-api \}/,
		);
	});
});
