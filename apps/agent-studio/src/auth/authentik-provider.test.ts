import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { type LocalAuthentik, startLocalAuthentik } from "./authentik.fixture";
import { AuthentikAuthProvider, GATE_HEADER, relationFor } from "./authentik-provider";
import { groupAuthorizer } from "./authorize";
import { studioAuthFor } from "./from-config";
import { createBearerVerifier } from "./verify-bearer";
import { createGateVerifier } from "./verify-gate";

let ak: LocalAuthentik;
beforeAll(async () => {
	ak = await startLocalAuthentik();
});
afterAll(async () => {
	await ak.close();
});

const logged: string[] = [];
function provider(mode: "read-only" | "operate"): AuthentikAuthProvider {
	return new AuthentikAuthProvider({
		gate: createGateVerifier({
			issuer: ak.issuer("agent-studio"),
			userinfoUrl: new URL("/application/o/userinfo/", ak.origin),
		}),
		bearer: createBearerVerifier({
			issuer: ak.issuer("agent-studio-api"),
			audience: "agent-studio-api",
			jwksUrl: new URL("jwks/", ak.issuer("agent-studio-api")),
		}),
		authorizer: groupAuthorizer({
			view: ["app-agent-studio-viewer"],
			operate: ["app-agent-studio-operator"],
		}),
		mode,
		log: (m) => logged.push(m),
	});
}

async function gateRequest(
	groups: string[],
	method = "GET",
	path = "/api/agents",
): Promise<Request> {
	const token = await ak.issueGateToken(
		{ sub: `sub-${groups.join("+") || "none"}`, iss: ak.issuer("agent-studio") },
		{ sub: `sub-${groups.join("+") || "none"}`, groups },
	);
	return new Request(`http://studio.test${path}`, { method, headers: { [GATE_HEADER]: token } });
}

describe("AuthentikAuthProvider", () => {
	it("authenticates the gate's token from its header (Mastra passes an empty bearer)", async () => {
		const req = await gateRequest(["app-agent-studio-viewer"]);
		const user = await provider("read-only").authenticateToken("", req);
		expect(user).toMatchObject({ id: "sub-app-agent-studio-viewer", via: "gate" });
	});

	it("authenticates an RS256 bearer when there is no gate header", async () => {
		const token = await ak.signRs256({
			sub: "cli-1",
			groups: ["app-agent-studio-operator"],
			iss: ak.issuer("agent-studio-api"),
			aud: "agent-studio-api",
		});
		const req = new Request("http://studio.test/api/agents", {
			headers: { authorization: `Bearer ${token}` },
		});
		const user = await provider("operate").authenticateToken(`Bearer ${token}`, req);
		expect(user).toMatchObject({ id: "cli-1", via: "bearer" });
	});

	it("answers null (401) for no identity and for a refused one, logging why", async () => {
		const p = provider("read-only");
		expect(await p.authenticateToken("", new Request("http://studio.test/api/agents"))).toBeNull();
		const forged = new Request("http://studio.test/api/agents", {
			headers: { [GATE_HEADER]: "a.b.c" },
		});
		expect(await p.authenticateToken("", forged)).toBeNull();
		expect(logged.some((m) => m.includes("not a JWT"))).toBe(true);
	});

	it("lets a viewer read and refuses them anything that runs", async () => {
		const p = provider("operate");
		const read = await gateRequest(["app-agent-studio-viewer"]);
		const user = await p.authenticateToken("", read);
		if (user === null) throw new Error("expected a user");
		expect(await p.authorizeUser(user, read)).toBe(true);
		const run = new Request("http://studio.test/api/agents/x/generate", { method: "POST" });
		expect(await p.authorizeUser(user, run)).toBe(false);
	});

	it("lets an operator run in operate mode, and nobody in read-only mode", async () => {
		const req = await gateRequest(["app-agent-studio-operator"], "POST", "/api/agents/x/generate");
		const operate = provider("operate");
		const user = await operate.authenticateToken("", req);
		if (user === null) throw new Error("expected a user");
		expect(await operate.authorizeUser(user, req)).toBe(true);
		expect(await provider("read-only").authorizeUser(user, req)).toBe(false);
	});

	it("refuses a signed-in person outside Studio's groups (403)", async () => {
		const req = await gateRequest(["app-plane-admin"]);
		const p = provider("operate");
		const user = await p.authenticateToken("", req);
		if (user === null) throw new Error("expected a user");
		expect(await p.authorizeUser(user, req)).toBe(false);
	});

	it("maps the person to their own memory resource", () => {
		expect(
			provider("read-only").mapUserToResourceId({
				id: "s",
				email: null,
				username: null,
				groups: [],
				via: "gate",
			}),
		).toBe("s");
	});

	it("reads only the method", () => {
		expect(relationFor("get")).toBe("view");
		expect(relationFor("DELETE")).toBe("operate");
	});
});

describe("configuration", () => {
	it("refuses production without an issuer, or with auth off", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "production", AGENT_STUDIO_PUBLIC_URL: "https://studio.psizone.ro" }),
		).toThrow(/AUTHENTIK_GATE_ISSUER/);
		expect(() =>
			loadConfig({
				NODE_ENV: "production",
				AGENT_STUDIO_AUTH: "off",
				AGENT_STUDIO_PUBLIC_URL: "https://studio.psizone.ro",
			}),
		).toThrow(/refused in production/);
	});

	it("refuses a partial OpenFGA configuration", () => {
		expect(() =>
			loadConfig({
				AUTHENTIK_GATE_ISSUER: "https://auth.psizone.ro/application/o/agent-studio/",
				OPENFGA_ENDPOINT: "http://fga:8081",
			}),
		).toThrow(/go together/);
	});

	it("builds the gate with Authentik's userinfo beside the issuer, read-only by default", () => {
		const c = loadConfig({
			NODE_ENV: "production",
			AGENT_STUDIO_PUBLIC_URL: "https://studio.psizone.ro",
			AUTHENTIK_GATE_ISSUER: "https://auth.psizone.ro/application/o/agent-studio/",
		});
		expect(c.mode).toBe("read-only");
		expect(c.auth).toMatchObject({
			kind: "on",
			gate: { userinfoUrl: new URL("https://auth.psizone.ro/application/o/userinfo/") },
		});
		expect(studioAuthFor(c, () => {})).toBeInstanceOf(AuthentikAuthProvider);
	});
});
