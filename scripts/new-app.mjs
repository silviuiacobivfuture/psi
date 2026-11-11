#!/usr/bin/env node
// One command for a new application, in this estate's convention (apps/README.md):
//
//   pnpm new-app <name>              a web application (the default), e.g. pnpm new-app landing
//   pnpm new-app <name> --service    a TypeScript HTTP service instead
//
// Writes apps/<name>/ (package.json with build, type-check and test; Dockerfile; seb.app.yaml),
// gitops/services/<name>/ (base + one overlay per environment, whose image tag CI moves) and
// registers it with Argo in every environment (gitops/apps/overlays/<env>/apps/<name>.yaml,
// listed in that folder's kustomization).
//
// A web application (./app-web.mjs) is Vite + React on the platform's design system and
// translations, taken BUILT from the installed SEB bundle: its package.json depends on
// .seb-bundle/libs/npm/<lib>.tgz, and the root package.json gets one pnpm override per library,
// so a library that depends on another (the design system on the translations) resolves to
// the bundle's copy too, never to a registry. The estate's theme is <BRAND_ASSETS_DIR>/estate.css.
//
// Refuses a name that is not lower-kebab-case or an app that already exists. Then run
// `pnpm install` once, so the lock records the new member.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tarball, WEB_LIBRARIES, webAppFiles } from "./app-web.mjs";

const repo = join(fileURLToPath(import.meta.url), "../..");
const name = process.argv[2] ?? "";
const flags = process.argv.slice(3);
if (flags.some((f) => f !== "--service")) {
	process.stderr.write(`new-app: unknown option ${flags.find((f) => f !== "--service")}\n`);
	process.exit(2);
}
const kind = flags.includes("--service") ? "service" : "web";
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
	process.stderr.write(
		"usage: pnpm new-app <name> [--service]   (lower-kebab-case, e.g. landing)\n",
	);
	process.exit(2);
}
if (existsSync(join(repo, "apps", name))) {
	process.stderr.write(`new-app: apps/${name} already exists\n`);
	process.exit(3);
}

/** @param {string} key @returns {string} */
function identity(key) {
	const text = readFileSync(join(repo, "estate/identity.yaml"), "utf8");
	const m = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, "m").exec(text);
	if (!m || m[1] === undefined) {
		process.stderr.write(`new-app: MISSING REQUIRED ESTATE VALUE: ${key} (estate/identity.yaml)\n`);
		process.exit(3);
	}
	return m[1];
}
const slug = identity("ESTATE_SLUG");
const registry = identity("REGISTRY_HOST");
const project = identity("REGISTRY_PROJECT_APPS");
const domain = identity("BASE_DOMAIN");
const labelDomain = identity("ESTATE_LABEL_DOMAIN");
const gitHost = identity("GIT_HOST");
const gitOwner = identity("GIT_OWNER");
const gitRepo = identity("GIT_REPO");
const brandDir = identity("BRAND_ASSETS_DIR");
const envs = identity("ENVIRONMENTS")
	.split(",")
	.filter((e) => e !== "");
const image = `${registry}/${project}/${name}`;

/** @type {Record<string, string>} */
const serviceFiles = {
	[`apps/${name}/package.json`]: `${JSON.stringify(
		{
			name: `@${slug}/${name}`,
			version: "0.0.0",
			private: true,
			type: "module",
			scripts: {
				build: "tsc -p tsconfig.json",
				"type-check": "tsc -p tsconfig.json --noEmit",
				test: "vitest run --minWorkers=1 --maxWorkers=2",
				start: "node dist/main.js",
			},
			devDependencies: { "@types/node": "^24.7.2", typescript: "^5.7.3", vitest: "^2.1.9" },
		},
		null,
		"\t",
	)}\n`,
	[`apps/${name}/tsconfig.json`]: `${JSON.stringify(
		{
			extends: "../../tsconfig.base.json",
			compilerOptions: {
				outDir: "dist",
				rootDir: "src",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				lib: ["ES2022"],
				types: ["node"],
			},
			include: ["src"],
			exclude: ["src/**/*.test.ts"],
		},
		null,
		"\t",
	)}\n`,
	[`apps/${name}/src/respond.ts`]: `/** What ${name} answers for a path: a health check, or its page. */
export function respond(path: string): { status: number; body: string } {
	if (path === "/healthz") return { status: 200, body: "ok" };
	return { status: 200, body: "${name}" };
}
`,
	[`apps/${name}/src/respond.test.ts`]: `import { describe, expect, it } from "vitest";
import { respond } from "./respond.js";

describe("respond", () => {
	it("answers the health check", () => {
		expect(respond("/healthz")).toEqual({ status: 200, body: "ok" });
	});
	it("answers every other path with the page", () => {
		expect(respond("/")).toEqual({ status: 200, body: "${name}" });
	});
});
`,
	[`apps/${name}/src/main.ts`]: `import { createServer } from "node:http";
import { respond } from "./respond.js";

const port = Number(process.env.PORT ?? "8080");
createServer((req, res) => {
	const r = respond(req.url ?? "/");
	res.writeHead(r.status, { "content-type": "text/plain; charset=utf-8" });
	res.end(r.body);
}).listen(port);
`,
	[`apps/${name}/Dockerfile`]: `# Built from the repository root: docker build -f apps/${name}/Dockerfile \\
#   --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… .
# Base images come from the estate's Harbor mirror; there is no default registry.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM \${REGISTRY_HOST}/\${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @${slug}/${name}... && pnpm --filter @${slug}/${name} run build

FROM \${REGISTRY_HOST}/\${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
WORKDIR /app
COPY --from=build /repo/apps/${name}/dist ./dist
USER 1000
EXPOSE 8080
CMD ["node", "dist/main.js"]
`,
};
/** @type {Record<string, string>} */
const files = {
	...(kind === "web" ? webAppFiles({ name, slug, brandDir }) : serviceFiles),
	[`apps/${name}/seb.app.yaml`]: `# ${name}'s declaration to the platform (SEB schema/app.schema.json): what it runs, where its
# manifests are, which secrets it reads. SEB's secret seeding and health checks are driven by it.
schema: seb.app/v1
key: ${name}
name: ${name}
displayName: ${name}
namespace: ${name}
components:
  - name: ${name}
    path: apps/${name}
    namespace: ${name}
    gitops: gitops/services/${name}
    image: ${project}/${name}
    port: 8080
    overlayImages:
      - ${project}/${name}
    workloads:
      - name: ${name}
        kind: Deployment
        images:
          - ${project}/${name}
externalSecrets: []
secrets: []
groups: []
ci:
  workflows: []
health:
  secretChecks: []
  buildVarChecks: []
  convexEnvChecks: []
docs:
  appSecretsRows: []
  paths: []
  keys: []
findings: []
`,
	[`gitops/services/${name}/base/kustomization.yaml`]: `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: ${name}
resources:
  - deployment.yaml
  - service.yaml
`,
	[`gitops/services/${name}/base/deployment.yaml`]: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  annotations:
    alerts.${labelDomain}/owner: ${slug}
spec:
  replicas: 1
  selector:
    matchLabels: { app: ${name} }
  template:
    metadata:
      labels: { app: ${name} }
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: ${name}
          image: ${image}
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet: { path: /healthz, port: 8080 }
          resources:
            requests: { cpu: 20m, memory: 64Mi }
            limits: { memory: 128Mi }
`,
	[`gitops/services/${name}/base/service.yaml`]: `apiVersion: v1
kind: Service
metadata:
  name: ${name}
spec:
  selector: { app: ${name} }
  ports:
    - port: 80
      targetPort: 8080
`,
};
for (const env of envs) {
	files[`gitops/services/${name}/overlays/${env}/kustomization.yaml`] =
		`# ${name} on ${env}. CI moves newTag after each image it pushes; never edit it by hand.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
images:
  - name: ${image}
    newTag: "unbuilt"
`;
	files[`gitops/apps/overlays/${env}/apps/${name}.yaml`] = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${name}
  namespace: argocd
spec:
  project: default
  source:
    repoURL: git@${gitHost}:${gitOwner}/${gitRepo}.git
    targetRevision: ${env}
    path: gitops/services/${name}/overlays/${env}
  destination:
    server: https://kubernetes.default.svc
    namespace: ${name}
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
`;
}
for (const [rel, text] of Object.entries(files)) {
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), text);
}
// A web application's SEB libraries resolve to the bundle's tarballs wherever they are named,
// a library's own dependency on another included: one root override per library.
if (kind === "web") {
	const rootFile = join(repo, "package.json");
	/** @type {unknown} */
	const root = JSON.parse(readFileSync(rootFile, "utf8"));
	if (typeof root !== "object" || root === null || Array.isArray(root)) {
		process.stderr.write("new-app: the root package.json is not an object\n");
		process.exit(3);
	}
	/** @type {unknown} */
	const pnpmField = Reflect.get(root, "pnpm") ?? {};
	/** @type {unknown} */
	const overrides =
		typeof pnpmField === "object" && pnpmField !== null
			? (Reflect.get(pnpmField, "overrides") ?? {})
			: {};
	if (typeof overrides !== "object" || overrides === null || typeof pnpmField !== "object") {
		process.stderr.write("new-app: the root package.json's pnpm.overrides is not an object\n");
		process.exit(3);
	}
	for (const lib of WEB_LIBRARIES)
		Reflect.set(overrides, lib, `file:.seb-bundle/libs/npm/${tarball(lib)}`);
	Reflect.set(pnpmField, "overrides", overrides);
	Reflect.set(root, "pnpm", pnpmField);
	writeFileSync(rootFile, `${JSON.stringify(root, null, "\t")}\n`);
}
// The registration folder is the estate's: created here when absent. The overlay ABOVE it is
// genesis's render; it must list `apps`, and this says so instead of editing it.
/** @type {string[]} */
const notices = [];
/** @param {string} file @returns {string} */
function readIfThere(file) {
	return existsSync(file) ? readFileSync(file, "utf8") : "";
}
for (const env of envs) {
	const k = join(repo, "gitops/apps/overlays", env, "apps/kustomization.yaml");
	const text = existsSync(k)
		? readFileSync(k, "utf8").replace(/^resources: \[\]\n/m, "resources:\n")
		: `# The estate's own applications on ${env}: one Argo Application file each.\napiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n`;
	writeFileSync(k, `${text.trimEnd()}\n  - ${name}.yaml\n`);
	const root = join(repo, "gitops/apps/overlays", env, "kustomization.yaml");
	if (!existsSync(root) || !/^\s*-\s*apps\/?\s*$/m.test(readFileSync(root, "utf8")))
		notices.push(
			`NOTICE: gitops/apps/overlays/${env}/kustomization.yaml does not list \`apps\` (genesis writes it): ${name} is not deployed on ${env} until it does.`,
		);
}
const kustomize = (() => {
	try {
		execFileSync("kubectl", ["version", "--client"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();
if (kustomize)
	for (const env of envs)
		execFileSync("kubectl", ["kustomize", join(repo, "gitops/services", name, "overlays", env)], {
			stdio: "ignore",
		});
// Written in the repository's own format, so the first lint is clean.
const biome = join(repo, "node_modules/.bin/biome");
if (existsSync(biome))
	execFileSync(
		biome,
		["format", "--config-path", ".mono/biome.json", "--write", `apps/${name}`, "package.json"],
		{
			cwd: repo,
			stdio: "ignore",
		},
	);
if (kind === "web" && !/^digest\s*=/m.test(readIfThere(join(repo, "estate/platform.lock"))))
	notices.push(
		"NOTICE: estate/platform.lock names no bundle digest yet: `pnpm install` refuses until it does (the design system and translations come from that bundle).",
	);
for (const n of notices) process.stdout.write(`${n}\n`);
process.stdout.write(
	`new-app: apps/${name} (@${slug}/${name}), gitops/services/${name}, registered on ${envs.join(", ")} at https://${name}.${domain} once routed.\nNext: pnpm install, then pnpm nx run @${slug}/${name}:test and :build.\n`,
);
