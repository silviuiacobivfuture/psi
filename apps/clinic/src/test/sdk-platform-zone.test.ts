import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/**
 * The platform zone over the real service: the estate administrator reaches it whether or not they belong to any
 * organisation (the authorizer makes them a member of every app through the platform). `root` is the world's estate
 * administrator and no app's member; `mallory` is no one.
 */
let k: SdkConsole;
beforeAll(async () => {
	k = await startSdkConsole();
});
afterAll(async () => {
	await k.close();
});

const form = { "content-type": "application/x-www-form-urlencoded" };

describe("the estate administrator without a membership", () => {
	it("opens Administrare, its organisations and the platform's assistant settings", async () => {
		const root = await k.as("root");
		const res = await root.get("/platform");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('href="/platform/assistant"');
		expect(html).toContain('data-org="psizone"');
		expect(html).toContain("Administrator platformă");
		const settings = await root.get("/platform/assistant");
		expect(settings.status).toBe(200);
		expect(await settings.text()).toContain('data-action="assistant.platform.save"');
	});
	it("saves the platform's assistant settings, and the service holds them", async () => {
		const root = await k.as("root");
		const page = await (await root.get("/platform/assistant")).text();
		const fields = Object.fromEntries(
			[...page.matchAll(/name="(ceilings\.[a-z]+\.[A-Za-z]+)"[^>]*value="([^"]*)"/g)].map((x) => [
				x[1] ?? "",
				x[2] ?? "",
			]),
		);
		const res = await root.post(
			"/platform/assistant",
			new URLSearchParams({
				...fields,
				"ceilings.staff.forceRedaction": "on",
				"ceilings.visitor.forceRedaction": "on",
				"ceilings.staff.maxToolCalls": "6",
				revision: "0",
			}),
			form,
		);
		expect(res.status).toBe(200);
		expect(await res.text()).not.toContain("Nu s-a salvat nimic");
		const held = await k.api.world.call("root", "GET", "/v1/assistant/platform");
		expect(held.json).toMatchObject({ revision: 1 });
	});
	it("opens an organisation from Administrare, and the menu offers every organisation", async () => {
		const root = await k.as("root");
		const opened = await root.get("/switch/psizone");
		expect(opened.status).toBe(200);
		const html = await (await root.get("/platform")).text();
		expect(html).toContain('href="/switch/psizone"');
	});
});

describe("someone who is neither a member nor the estate administrator", () => {
	it("is still turned away from the platform zone and everywhere else", async () => {
		const mallory = await k.as("mallory");
		expect((await mallory.get("/platform")).status).toBe(403);
		expect((await mallory.get("/platform/assistant")).status).toBe(403);
		expect((await mallory.get("/calendar")).status).toBe(403);
	});
});
