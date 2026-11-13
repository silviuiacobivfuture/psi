import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

/** The console reaches the scheduling service in-cluster: the URL, the Service, and both NetworkPolicies must agree. */
describe("the console's deployment points at scheduling-api, and the two policies agree", () => {
	const deployment = read("gitops/services/clinic/base/deployment.yaml");
	const service = read("gitops/services/scheduling-api/base/service.yaml");
	const apiPolicy = read("gitops/services/scheduling-api/base/networkpolicy.yaml");
	const policy = read("gitops/services/clinic/base/networkpolicy.yaml");
	const apiNamespace = /^namespace: (\S+)/m.exec(
		read("gitops/services/scheduling-api/base/kustomization.yaml"),
	)?.[1];
	const serviceName = /kind: Service\nmetadata:\n {2}name: (\S+)/.exec(service)?.[1];
	const targetPort = /targetPort: (\d+)/.exec(service)?.[1];
	const url = /name: SCHEDULING_API_URL, value: "([^"]+)"/.exec(deployment)?.[1];

	it("SCHEDULING_API_URL is the in-cluster Service of scheduling-api", () => {
		expect(apiNamespace).toBe("scheduling-api");
		expect(url).toBe(`http://${serviceName}.${apiNamespace}.svc`);
	});
	it("the URL is one the console accepts at boot", () => {
		expect(
			readEnv({ NODE_ENV: "production", SCHEDULING_API_URL: url, SESSION_SECRET: "s".repeat(40) })
				.schedulingApi,
		).toBe(url);
	});
	it("the console may call that namespace and pod on the pod port; the service admits the console's namespace and pod on it", () => {
		expect(policy).toMatch(
			new RegExp(
				`kubernetes.io/metadata.name: ${apiNamespace} \\} \\}\\n\\s+podSelector: \\{ matchLabels: \\{ app: ${serviceName} \\} \\}\\n\\s+ports: \\[\\{ port: ${targetPort} \\}\\]`,
			),
		);
		expect(apiPolicy).toMatch(
			/kubernetes\.io\/metadata\.name: clinic \}\n\s+podSelector:\n\s+matchLabels: \{ app: clinic \}/,
		);
		expect(apiPolicy).toContain(`port: ${targetPort}`);
	});
	it("production refuses the fake clinic and the development sign-in, and a missing service URL or session secret, by name", () => {
		expect(deployment).toContain("NODE_ENV");
		expect(() => readEnv({ NODE_ENV: "production", CLINIC_FAKE_PORT: "1" })).toThrow(
			/CLINIC_FAKE_PORT/,
		);
		expect(() => readEnv({ NODE_ENV: "production", SESSION_SECRET: "s".repeat(40) })).toThrow(
			/SCHEDULING_API_URL/,
		);
		expect(() => readEnv({ NODE_ENV: "production", SCHEDULING_API_URL: url })).toThrow(
			/SESSION_SECRET/,
		);
	});
});
