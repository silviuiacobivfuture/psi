import { APP_KEYS } from "@psi/notify";
import { describe, expect, it } from "vitest";
import { catalogueWorkflows, createBridge } from "./bridge";
import { loadBridgeConfig } from "./config";

const CONFIG = { NOVU_SECRET_KEY: "sk_test_bridge", NOVU_API_URL: "http://127.0.0.1:1" };

describe("the bridge serves psi's catalogue", () => {
	const workflows = catalogueWorkflows();

	it("serves every workflow of @psi/notify, each id unique and named for one of psi's apps", () => {
		expect(workflows.length).toBeGreaterThan(0);
		const ids = workflows.map((w) => w.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids)
			expect(
				APP_KEYS.some((app) => id.startsWith(`${app}-`)),
				id,
			).toBe(true);
	});

	it("says how many it discovered, and that it is up", async () => {
		const res = await createBridge(CONFIG).request("/api/novu");
		expect(res.status).toBe(200);
		const body: unknown = await res.json();
		expect(body).toMatchObject({ status: "ok", discovered: { workflows: workflows.length } });
	});

	it("refuses an unsigned discovery: only Novu, with the environment's key, reads the workflows", async () => {
		const res = await createBridge(CONFIG).request("/api/novu?action=discover");
		expect(res.status).toBe(401);
	});

	it("answers the probe, and nothing else on the probe's path", async () => {
		const res = await createBridge(CONFIG).request("/healthz");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("answers 404 for a path it does not serve", async () => {
		expect((await createBridge(CONFIG).request("/")).status).toBe(404);
	});
});

describe("its configuration", () => {
	it("needs the environment's secret key and API address; the port defaults to 8080", () => {
		expect(loadBridgeConfig(CONFIG)).toEqual({ ...CONFIG, PORT: 8080 });
	});
	it.each([
		["no secret key", { NOVU_API_URL: CONFIG.NOVU_API_URL }, /NOVU_SECRET_KEY/],
		["an empty secret key", { ...CONFIG, NOVU_SECRET_KEY: "" }, /NOVU_SECRET_KEY/],
		["no API address", { NOVU_SECRET_KEY: CONFIG.NOVU_SECRET_KEY }, /NOVU_API_URL/],
		["an API address that is not a URL", { ...CONFIG, NOVU_API_URL: "novu-api" }, /NOVU_API_URL/],
		["a port out of range", { ...CONFIG, PORT: "70000" }, /PORT/],
	])("refuses %s, by name", (_what, env, name) => {
		expect(() => loadBridgeConfig(env)).toThrow(name);
	});
});
