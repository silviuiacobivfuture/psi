import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LocalAuthentik, startLocalAuthentik } from "./authentik.fixture";
import { AuthentikAuthProvider, GATE_HEADER } from "./authentik-provider";
import { groupAuthorizer } from "./authorize";
import { edgeGuard } from "./edge-guard";
import { createGateVerifier } from "./verify-gate";

let ak: LocalAuthentik;
beforeAll(async () => {
	ak = await startLocalAuthentik();
});
afterAll(async () => {
	await ak.close();
});

/** The guard as the deployer mounts it: after the request context exists, before every route. */
type Env = { Variables: { requestContext: RequestContext } };

function app(mode: "read-only" | "operate"): { app: Hono<Env>; seen: () => string | undefined } {
	const provider = new AuthentikAuthProvider({
		gate: createGateVerifier({
			issuer: ak.issuer("agent-studio"),
			userinfoUrl: new URL("/application/o/userinfo/", ak.origin),
		}),
		authorizer: groupAuthorizer({
			view: ["app-agent-studio-viewer"],
			operate: ["app-agent-studio-operator"],
		}),
		mode,
		log: () => {},
	});
	let resource: string | undefined;
	const h = new Hono<Env>();
	h.use("*", async (c, next) => {
		c.set("requestContext", new RequestContext());
		await next();
	});
	h.use("*", edgeGuard(provider));
	h.all("*", (c) => {
		const id: unknown = c.get("requestContext").get(MASTRA_RESOURCE_ID_KEY);
		resource = typeof id === "string" ? id : undefined;
		return c.text("reached");
	});
	return { app: h, seen: () => resource };
}

async function token(groups: string[]): Promise<string> {
	const sub = `sub-${groups.join("+")}`;
	return ak.issueGateToken({ sub, iss: ak.issuer("agent-studio") }, { sub, groups });
}

describe("edgeGuard", () => {
	it("refuses no identity with 401, before any route runs", async () => {
		const res = await app("operate").app.request("/api/agents");
		expect(res.status).toBe(401);
	});

	it("lets a viewer read the page and the API, and sets their resource id", async () => {
		const { app: a, seen } = app("read-only");
		const t = await token(["app-agent-studio-viewer"]);
		expect((await a.request("/agents", { headers: { [GATE_HEADER]: t } })).status).toBe(200);
		expect((await a.request("/api/agents", { headers: { [GATE_HEADER]: t } })).status).toBe(200);
		expect(seen()).toBe("sub-app-agent-studio-viewer");
	});

	it("refuses an operator's run in read-only mode and allows it in operate mode", async () => {
		const t = await token(["app-agent-studio-operator"]);
		const init = { method: "POST", headers: { [GATE_HEADER]: t } };
		expect((await app("read-only").app.request("/api/agents/x/generate", init)).status).toBe(403);
		expect((await app("operate").app.request("/api/agents/x/generate", init)).status).toBe(200);
	});

	it("refuses a signed-in person outside Studio's groups with 403", async () => {
		const t = await token(["app-plane-admin"]);
		expect(
			(await app("operate").app.request("/api/agents", { headers: { [GATE_HEADER]: t } })).status,
		).toBe(403);
	});
});
