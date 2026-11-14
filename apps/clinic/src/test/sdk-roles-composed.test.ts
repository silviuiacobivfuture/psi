import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { highestFirst, rolesText } from "../chrome";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

const A = "/v1/apps/psizone";
let k: SdkConsole;
beforeAll(async () => {
	k = await startSdkConsole();
});
afterAll(async () => {
	await k.close();
});
const role = (slug: string): string => k.api.world.ids.roles[slug] ?? slug;
const api = (method: string, path: string, body?: unknown) =>
	k.api.world.call("olga", method, `${A}${path}`, body);
const form = (pairs: ReadonlyArray<[string, string]>) => new URLSearchParams([...pairs]);
const formHeaders = { "content-type": "application/x-www-form-urlencoded" };

describe("the role editor: what a role includes, and what it holds through them", () => {
	it("the Owner's sheet ticks the Administrator it includes and greys what comes from it", async () => {
		const s = await k.as("olga");
		const html = await (await s.get(`/settings/roles?role=${role("owner")}`)).text();
		expect(html).toContain("Include rolurile");
		expect(html).toMatch(new RegExp(`name="include" value="${role("admin")}" checked`));
		expect(html).not.toMatch(new RegExp(`name="include" value="${role("owner")}"`));
		// the Owner's matrix cells it holds only through the Administrator say so
		expect(html).toContain("data-inherited");
		expect(html).toMatch(/din Administrator: /);
	});

	it("saving the sheet with a role ticked makes the service's role include it; unticking takes it away", async () => {
		const made = (await api("POST", "/roles", { name: "Birou" })).json.id as string;
		const s = await k.as("olga");
		const saved = await s.post(
			`/settings/roles/${made}`,
			form([["include", role("volunteer")]]),
			formHeaders,
		);
		expect(saved.status).toBeLessThan(400);
		const held = (await api("GET", `/roles/${made}`)).json as {
			role: { includes: string[] };
			inherited: Record<string, string>;
		};
		expect(held.role.includes).toEqual([role("volunteer")]);
		expect(Object.values(held.inherited).length).toBeGreaterThan(0);
		await s.post(`/settings/roles/${made}`, form([]), formHeaders);
		expect(
			((await api("GET", `/roles/${made}`)).json as { role: { includes: string[] } }).role.includes,
		).toEqual([]);
	});

	it("a cycle is refused by the service and nothing changes", async () => {
		const s = await k.as("olga");
		const before = (await api("GET", `/roles/${role("admin")}`)).json as {
			role: { includes: string[] };
		};
		const r = await s.raw(`/settings/roles/${role("admin")}`, {
			method: "POST",
			body: form([["include", role("owner")]]),
			headers: formHeaders,
		});
		expect(r.status).toBeGreaterThanOrEqual(400);
		const after = (await api("GET", `/roles/${role("admin")}`)).json as {
			role: { includes: string[] };
		};
		expect(after.role.includes).toEqual(before.role.includes);
	});
});

describe("the role comparison marks what a role holds through another", () => {
	it("the Owner's column says 'din' the Administrator for what it does not hold itself; the Reception column never", async () => {
		const s = await k.as("olga");
		const html = await (await s.get("/roles/matrix")).text();
		expect(html).toContain(`data-from="${role("admin")}"`);
		expect(html).toMatch(/din Administrator\b/);
		// Reception includes nothing: none of its cells come from another role
		const reception =
			html.match(new RegExp(`data-col="${role("reception")}"[^>]*>[\\s\\S]*?</td>`, "g")) ?? [];
		expect(reception.length).toBeGreaterThan(0);
		for (const cell of reception) expect(cell).not.toContain("data-from");
	});
});

describe("the member editor marks a role contained in another picked one", () => {
	it("Recepție is 'inclus în' the Administrator and the Owner (by permissions); the Owner is in nothing", async () => {
		const s = await k.as("olga");
		const html = await (await s.get("/settings/members?edit=vera")).text();
		const mark = (id: string): string | undefined =>
			html.match(new RegExp(`value="${id}"[\\s\\S]*?data-included-in="([^"]*)"`))?.[1];
		const reception = mark(role("reception"))?.split(" ") ?? [];
		expect(reception).toContain(role("admin"));
		expect(reception).toContain(role("owner"));
		const owner = html.match(new RegExp(`value="${role("owner")}"[\\s\\S]*?</div>`))?.[0];
		expect(owner).toBeDefined();
		expect(owner).not.toContain("data-included-in");
		// Vera holds only Voluntar: no mark is shown before anything is ticked
		expect(html).toMatch(/data-included-in="[^"]*"[^>]*style="display:none"/);
	});

	it("saving Administrator and Owner together keeps the Owner alone", async () => {
		const s = await k.as("olga");
		await s.post(
			"/settings/members/vera/save",
			form([
				["displayName", "Vera Test"],
				["roles", role("admin")],
				["roles", role("owner")],
			]),
			formHeaders,
		);
		const held = (await api("GET", "/members/vera")).json as { roles: string[] };
		expect(held.roles).toEqual([role("owner")]);
		await api("PUT", "/members/vera", {
			displayName: "Vera Test",
			roles: [role("volunteer")],
			coordinates: [],
		});
	});
});

describe("the pill names the highest organisation role first", () => {
	it("Owner before Administrator before the rest, whatever the order held", () => {
		expect(highestFirst(["psizone-reception", "psizone-owner", "psizone-admin"])).toEqual([
			"psizone-owner",
			"psizone-admin",
			"psizone-reception",
		]);
		expect(highestFirst(["x1", "x2"], { x1: "Reception", x2: "Owner" })).toEqual(["x2", "x1"]);
		expect(rolesText(["psizone-reception", "psizone-owner"], "ro")).toBe("Proprietar + Recepție");
	});
});
