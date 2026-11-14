import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../../../", import.meta.url);
const root = rootUrl.pathname;
const read = (p: string): string => readFileSync(new URL(p, rootUrl), "utf8");

const OVERLAYS = [
	"account-db",
	"scheduling-backend",
	"scheduling-deploy",
	"scheduling-sync",
	"scheduling-api",
	"clinic",
] as const;
const PROD_NAMESPACES = [
	"account-db-prod",
	"clinic-prod",
	"scheduling-api-prod",
	"scheduling-backend-prod",
];
/** What production only READS from dev's paths: the estate's single OpenFGA, its store id, the registry, object storage. */
const SHARED_PATHS = [
	"apps/openfga/env",
	"apps/autorizare/env",
	"apps/scheduling-sync/old-app",
	"platform/harbor/pull",
	"platform/object-storage/dev",
];

const kustomize = spawnSync("kustomize", ["version"]).status === 0;
const render = (service: string): string =>
	execFileSync("kustomize", ["build", `gitops/services/${service}/overlays/prod`], {
		cwd: root,
		encoding: "utf8",
	});

describe.skipIf(!kustomize)("the production overlays, rendered", () => {
	const rendered = Object.fromEntries(OVERLAYS.map((s) => [s, render(s)]));
	const all = Object.values(rendered).join("\n---\n");

	it("every namespaced object lands in a production namespace, never dev's", () => {
		const namespaces = [...all.matchAll(/^ {2}namespace: (\S+)$/gm)].map((m) => m[1]);
		expect(namespaces.length).toBeGreaterThan(20);
		for (const ns of namespaces) expect(PROD_NAMESPACES).toContain(ns);
	});

	it("no NetworkPolicy admits or targets a dev namespace of the appointments system", () => {
		const targeted = [...all.matchAll(/kubernetes\.io\/metadata\.name: (\S+)/g)].map((m) => m[1]);
		for (const dev of ["clinic", "scheduling", "scheduling-api"])
			expect(targeted, `a policy names the dev namespace ${dev}`).not.toContain(dev);
	});

	it("reads only its own OpenBao paths, plus the estate's shared read-only ones", () => {
		const keys = new Set(
			[...all.matchAll(/key: ((?:apps|platform)\/\S+)/g)].map((m) => m[1] ?? ""),
		);
		const own = (k: string): boolean => /^apps\/[a-z-]+-prod\//.test(k);
		for (const k of keys)
			expect(own(k) || SHARED_PATHS.includes(k), `${k} is a dev path`).toBe(true);
		expect([...keys].filter(own).sort()).toEqual([
			"apps/account-prod/db",
			"apps/account-prod/openfga",
			"apps/clinic-prod/env",
			"apps/clinic-prod/oidc",
			"apps/notify-prod/reminder-links",
			"apps/novu-prod/estate",
			"apps/scheduling-api-prod/env",
			"apps/scheduling-api-prod/mail",
			"apps/scheduling-api-prod/sso",
			"apps/scheduling-prod/admin",
			"apps/scheduling-prod/db",
			"apps/scheduling-prod/env",
		]);
	});

	it("names no dev host, dev service address or dev bucket, and the production ones", () => {
		expect(all).not.toMatch(/-dev\.psizone\.ro/);
		expect(all).not.toMatch(/\.scheduling\.svc/);
		expect(all).not.toMatch(/\.scheduling-api\.svc/);
		expect(all).not.toContain("psi-scheduling-dev");
		expect(all).not.toContain("cnpg/account-db\n");
		for (const host of ["programari.psizone.ro", "api-programari.psizone.ro"])
			expect(all).toContain(host);
		expect(all).toContain("CONSOLE_URL");
		expect(rendered["scheduling-api"]).toMatch(
			/CONSOLE_URL\n\s+value: https:\/\/programari\.psizone\.ro/,
		);
	});

	it("scopes the app objects in the shared OpenFGA store with prod-", () => {
		expect(rendered["scheduling-api"]).toMatch(/OPENFGA_APP_PREFIX\n\s+value: prod-/);
		expect(read("gitops/services/scheduling-api/base/deployment.yaml")).not.toContain(
			"OPENFGA_APP_PREFIX",
		);
	});

	it("holds every notice until the cut-over: real people are still told by the old app, and dev is not held", () => {
		expect(rendered["scheduling-api"]).toMatch(/NOTIFY_DELIVERY\n\s+value: hold/);
		expect(read("gitops/services/scheduling-api/base/deployment.yaml")).not.toContain(
			"NOTIFY_DELIVERY",
		);
	});

	it("has its own Postgres and backups: own prefixes, prune-guarded, nothing shared with dev", () => {
		expect(rendered["scheduling-backend"]).toContain(
			"s3://psi-tfstate-dev/cnpg/scheduling-db-prod",
		);
		expect(rendered["scheduling-backend"]).toContain("POSTGRES_URL");
		expect(rendered["account-db"]).toContain("s3://psi-tfstate-dev/cnpg/account-db-prod");
		expect(rendered.clinic).not.toMatch(/^kind: Cluster$/m);
		for (const s of ["scheduling-backend", "account-db"])
			expect(rendered[s]).toContain("argocd.argoproj.io/sync-options: Prune=false,Delete=false");
	});

	it("the prod store admits only prod callers", () => {
		const policy = rendered["scheduling-backend"]?.split("kind: NetworkPolicy")[1] ?? "";
		expect(policy).toContain("scheduling-api-prod");
		for (const dev of ["psizone-web", "hemisync-web", "cms"]) expect(policy).not.toContain(dev);
	});

	it("every image is a promoted tag or the not-yet-promoted placeholder, never CI's bootstrap value", () => {
		for (const s of OVERLAYS.filter((o) => o !== "account-db")) {
			const tag = /newTag: "([^"]+)"/.exec(
				read(`gitops/services/${s}/overlays/prod/kustomization.yaml`),
			);
			expect(tag?.[1]).toMatch(/^(unpromoted|[0-9a-f]{7})$/);
		}
	});
});

describe("production's registration and admission", () => {
	it("each production Application points at its prod overlay and namespace, on the dev branch", () => {
		const apps: Record<string, [string, string]> = {
			"clinic-prod": ["clinic", "clinic-prod"],
			"scheduling-api-prod": ["scheduling-api", "scheduling-api-prod"],
			"scheduling-backend-prod": ["scheduling-backend", "scheduling-backend-prod"],
			"scheduling-deploy-prod": ["scheduling-deploy", "scheduling-backend-prod"],
			"account-db-prod": ["account-db", "account-db-prod"],
		};
		const list = read("gitops/apps/overlays/dev/apps/kustomization.yaml");
		for (const [name, [service, ns]] of Object.entries(apps)) {
			const a = read(`gitops/apps/overlays/dev/apps/${name}.yaml`);
			expect(list).toContain(`- ${name}.yaml`);
			expect(a).toMatch(new RegExp(`^ {2}name: ${name}$`, "m"));
			expect(a).toContain(`path: gitops/services/${service}/overlays/prod`);
			expect(a).toMatch(new RegExp(`namespace: ${ns} \\}|namespace: ${ns}$`, "m"));
			expect(a).toContain("targetRevision: dev");
		}
	});

	it("OpenFGA admits the production console and API on the same ports as dev's, the write port to the API only", () => {
		const p = read("gitops/services/openfga-access/base/networkpolicy.yaml");
		const rules = p.split("    - from:").slice(1);
		const ruleFor = (port: number): string =>
			rules.find((r) => r.includes(`port: ${port} }`)) ?? "";
		const check = ruleFor(8081);
		expect(check).toMatch(
			/metadata\.name: clinic-prod \}\n\s+podSelector:\n\s+matchLabels: \{ app: clinic \}/,
		);
		expect(check).toMatch(
			/metadata\.name: scheduling-api-prod \}\n\s+podSelector:\n\s+matchLabels: \{ app: scheduling-api \}/,
		);
		const write = ruleFor(8080);
		expect(write).toMatch(/metadata\.name: scheduling-api-prod \}/);
		expect(write).not.toContain("clinic");
	});

	it("CI never bumps a production tag: it runs on dev only and writes overlays/<branch>", () => {
		const wf = read(".github/workflows/apps.yml");
		expect(wf).toMatch(/branches: \[dev\]/);
		expect(wf).toContain("overlays/$ENV_BRANCH/kustomization.yaml");
		expect(wf).not.toContain("overlays/prod");
	});

	it("Authentik has the production client, its secrets and its blueprint, wired", () => {
		const bp = read("gitops/platform/authentik/blueprints-clinic-prod.yaml");
		expect(bp).toContain("https://programari.psizone.ro/auth/callback");
		expect(bp).not.toContain("programari-dev");
		expect(bp).toContain("name: clinic-prod");
		expect(read("gitops/platform/authentik/clinic-prod-oidc-externalsecret.yaml")).toContain(
			"apps/clinic-prod/oidc",
		);
		expect(read("gitops/platform/authentik/kustomization.yaml")).toContain(
			"- blueprints-clinic-prod.yaml",
		);
		const a = read("gitops/apps/overlays/dev/authentik.yaml");
		expect(a).toContain("authentik-blueprints-clinic-prod");
		expect(a).toContain("authentik-clinic-prod-oidc");
	});
});
