import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

/** CPU in millicores and memory in MiB, as Kubernetes writes them here (`250m`, `"1"`, `256Mi`, `2Gi`). */
const cpu = (v: string): number => (v.endsWith("m") ? Number(v.slice(0, -1)) : Number(v) * 1000);
const mem = (v: string): number =>
	v.endsWith("Gi") ? Number(v.slice(0, -2)) * 1024 : Number(v.slice(0, -2));
const unquote = (v: string): string => v.replace(/"/g, "");

/** The main container's requests and limits: the last `resources` block of the Deployment (init containers come first). */
function mainResources(deployment: string) {
	const blocks = [
		...deployment.matchAll(
			/requests: \{ cpu: ([^,]+), memory: ([^ ]+) \}\s+limits: \{ cpu: ([^,]+), memory: ([^ ]+) \}/g,
		),
	];
	const last = blocks.at(-1);
	if (last === undefined) throw new Error("no resources");
	return {
		requests: { cpu: cpu(unquote(last[1] ?? "")), mem: mem(unquote(last[2] ?? "")) },
		limits: { cpu: cpu(unquote(last[3] ?? "")), mem: mem(unquote(last[4] ?? "")) },
		inits: blocks.slice(0, -1).map((b) => ({
			requests: { cpu: cpu(unquote(b[1] ?? "")), mem: mem(unquote(b[2] ?? "")) },
			limits: { cpu: cpu(unquote(b[3] ?? "")), mem: mem(unquote(b[4] ?? "")) },
		})),
	};
}

const hpa = (path: string) => {
	const text = read(path);
	return {
		text,
		min: Number(/minReplicas: (\d+)/.exec(text)?.[1]),
		max: Number(/maxReplicas: (\d+)/.exec(text)?.[1]),
	};
};

describe.each([
	["scheduling-api", "gitops/services/scheduling-api/base"],
	["clinic", "gitops/services/clinic/base"],
])("%s runs two pods (its HPA capped at two while the cluster is one node), and keeps serving through a rollout and a drain", (name, base) => {
	const deployment = read(`${base}/deployment.yaml`);
	const scaler = hpa(`${base}/hpa.yaml`);

	it("an HPA owns the count (the Deployment names none, so Argo never fights it), at least two pods", () => {
		expect(deployment).not.toMatch(/^\s+replicas:/m);
		expect(scaler.text).toContain(`kind: Deployment, name: ${name}`);
		expect(scaler.min).toBeGreaterThanOrEqual(2);
		expect(scaler.max).toBeGreaterThanOrEqual(scaler.min);
		// One node at three quarters of its memory: no more than two pods until the cluster grows.
		expect(scaler.max).toBeLessThanOrEqual(2);
		expect(read(`${base}/kustomization.yaml`)).toMatch(/- hpa\.yaml/);
	});

	it("a rollout never takes a serving pod away first, and a drain is never blocked", () => {
		expect(deployment).toMatch(/rollingUpdate: \{ maxUnavailable: 0, maxSurge: 1 \}/);
		// maxUnavailable, not minAvailable: with one pod ready, a minAvailable budget would hold the one node's drain.
		const pdb = read(`${base}/pdb.yaml`);
		expect(pdb).toMatch(/maxUnavailable: 1/);
		expect(pdb).not.toMatch(/minAvailable/);
	});

	it("the main container states its requests and limits, a limit at least its request", () => {
		const r = mainResources(deployment);
		expect(r.requests.cpu).toBeGreaterThan(0);
		expect(r.limits.cpu).toBeGreaterThanOrEqual(r.requests.cpu);
		expect(r.limits.mem).toBeGreaterThanOrEqual(r.requests.mem);
	});
});

describe("scheduling-api's quota fits the HPA's largest count and a rollout's surge", () => {
	it("max replicas + one surge pod, each with its init containers, stay under every hard limit", () => {
		const r = mainResources(read("gitops/services/scheduling-api/base/deployment.yaml"));
		const pods = hpa("gitops/services/scheduling-api/base/hpa.yaml").max + 1;
		const quota = read("gitops/services/scheduling-api/base/resourcequota.yaml");
		const hard = (key: string): string =>
			unquote(new RegExp(`${key}: ([^\\s]+)`).exec(quota)?.[1] ?? "0");
		const init = (pick: (i: (typeof r.inits)[number]) => number) =>
			r.inits.reduce((s, i) => s + pick(i), 0);
		expect(pods * (r.requests.cpu + init((i) => i.requests.cpu))).toBeLessThanOrEqual(
			cpu(hard("requests.cpu")),
		);
		expect(pods * (r.requests.mem + init((i) => i.requests.mem))).toBeLessThanOrEqual(
			mem(hard("requests.memory")),
		);
		expect(pods * (r.limits.cpu + init((i) => i.limits.cpu))).toBeLessThanOrEqual(
			cpu(hard("limits.cpu")),
		);
		expect(pods * (r.limits.mem + init((i) => i.limits.mem))).toBeLessThanOrEqual(
			mem(hard("limits.memory")),
		);
		expect(pods).toBeLessThanOrEqual(Number(hard("pods")));
	});
});

describe("the scheduling functions are deployed before the service that calls them", () => {
	const deployment = read("gitops/services/scheduling-api/base/deployment.yaml");

	it("a new pod takes traffic only once ready, and ready means the backend serves its functions", () => {
		expect(deployment).toMatch(/readinessProbe:\s+httpGet: \{ path: \/ready, port: http \}/);
		const store = readFileSync(new URL("./store/convex.ts", import.meta.url), "utf8");
		expect(store).toMatch(/const gate = functionsGate\(clients\.rpc\)/);
		expect(store).toMatch(/ping: async \(\) => \{[^}]*await gate\.check\(\)/s);
	});

	it("the rollout waits long enough for scheduling-deploy (ten minutes for the backend, then the deploy)", () => {
		const deadline = Number(/progressDeadlineSeconds: (\d+)/.exec(deployment)?.[1]);
		expect(deadline).toBeGreaterThanOrEqual(1200);
	});

	it("the deploy job deploys the functions the readiness asks about", () => {
		expect(read("apps/scheduling-deploy/deploy.sh")).toContain('"$convex" deploy --yes');
		expect(read("packages/scheduling/convex/deployment.ts")).toMatch(
			/export const functionsHash = query/,
		);
	});

	it("the deploy job runs on every new image tag: a tracked Job Argo replaces, never a hook it leaves out of its diff", () => {
		const job = read("gitops/services/scheduling-deploy/base/job.yaml");
		expect(job).not.toMatch(/argocd\.argoproj\.io\/hook:/);
		expect(job).toMatch(/argocd\.argoproj\.io\/sync-options: Force=true,Replace=true/);
		expect(job).toMatch(/argocd\.argoproj\.io\/sync-wave: "1"/);
		expect(job).not.toMatch(/ttlSecondsAfterFinished/);
		expect(read("gitops/services/scheduling-deploy/base/kustomization.yaml")).toMatch(
			/- job\.yaml/,
		);
	});
});
