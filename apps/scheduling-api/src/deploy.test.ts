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
		};
		for (const key of external)
			expect(row.includes(key) || row.includes(alias[key] ?? "\u0000"), key).toBe(true);
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

	it("is built by apps.yml (a Dockerfile in the app) and NOT registered with Argo", () => {
		expect(read("apps/scheduling-api/Dockerfile")).toContain("scheduling-api");
		expect(read("gitops/apps/overlays/dev/apps/kustomization.yaml")).not.toContain(
			"scheduling-api",
		);
		expect(read("gitops/apps/overlays/dev/apps/scheduling-api.yaml")).toContain(
			"name: scheduling-api",
		);
	});
});
