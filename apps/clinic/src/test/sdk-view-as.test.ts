import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

const A = "/v1/apps/psizone";
const COOKIE = "psi-clinic-view-as";
let k: SdkConsole;
beforeAll(async () => {
	k = await startSdkConsole();
});
afterAll(async () => {
	await k.close();
});

const text = async (r: Response): Promise<string> => r.text();
const api = (method: string, path: string, body?: unknown) =>
	k.api.world.call("olga", method, `${A}${path}`, body);
const has = (html: string, href: string): boolean => html.includes(`href="${href}"`);
const c1 = (): string => k.api.world.ids.c1;
const form = { "content-type": "application/x-www-form-urlencoded" };
const auditActions = async (): Promise<string[]> =>
	((await api("GET", "/audit?limit=200")).json.items as { action: string }[]).map((e) => e.action);

async function viewAs(s: Session, as: string): Promise<Response> {
	return s.raw("/view-as", { method: "POST", body: new URLSearchParams({ as }), headers: form });
}
const startAs = async (subject: string, as: string): Promise<Session> => {
	const s = await k.as(subject);
	const r = await viewAs(s, as);
	expect(r.status, as).toBe(303);
	// the browser takes the cookie from the answer
	for (const line of r.headers.getSetCookie()) {
		const [pair] = line.split(";");
		const [name, ...value] = (pair ?? "").split("=");
		if (name) s.browser.cookies(ORIGIN).set(name, value.join("="));
	}
	return s;
};

describe("only a roles administrator can start it", () => {
	it("the picker and the menu entry: the owner has them, reception does not", async () => {
		const owner = await k.as("olga");
		const picker = await text(await owner.get("/view-as"));
		expect(picker).toContain("Vezi ca…");
		expect(picker).toContain("Recepție");
		expect(picker).toContain("rita test");
		const menu = await text(await owner.get("/clients"));
		expect(has(menu, "/view-as")).toBe(true);
		// who they are in this app, in the user menu
		expect(menu).toContain("Proprietar · Psizone");
		const rita = await k.as("rita");
		expect(has(await text(await rita.get("/clients")), "/view-as")).toBe(false);
	});
	it("the top bar carries the role pill and the assistant for the owner, the pill for nobody else", async () => {
		const owner = await k.as("olga");
		const bar = await text(await owner.get("/clients"));
		expect(bar).toContain("data-role-switch");
		expect(bar).toContain("Rol: Proprietar");
		const rita = await k.as("rita");
		expect(await text(await rita.get("/clients"))).not.toContain("data-role-switch");
	});
	it("the pill's menu lists roles and people, and is refused to anyone who cannot view as", async () => {
		const owner = await k.as("olga");
		const menu = await text(await owner.get("/view-as/menu"));
		expect(menu).toContain('data-view-as-choice="role:psizone-reception"');
		expect(menu).toContain('data-view-as-choice="member:');
		const before = await k.api.world.fingerprint();
		expect((await (await k.as("rita")).get("/view-as/menu")).status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("while viewing, the pill turns into the way out", async () => {
		const s = await startAs("olga", "role:psizone-reception");
		const bar = await text(await s.get("/clients"));
		expect(bar).toContain("data-view-as-pill");
		expect(bar).toContain('action="/view-as/stop"');
		expect(bar).not.toContain("data-role-switch");
	});
	it.each([
		"rita",
		"nina",
		"dora",
		"vera",
		"ana",
	])("%s: the picker is refused, starting is refused, no cookie is set, nothing is written", async (who) => {
		const s = await k.as(who);
		const before = await k.api.world.fingerprint();
		expect((await s.get("/view-as")).status).toBe(403);
		const r = await viewAs(s, "role:psizone-owner");
		expect(r.status).toBe(403);
		expect(r.headers.getSetCookie().join(";")).not.toContain(COOKIE);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("a malformed target is refused, and so is a role that does not exist", async () => {
		const s = await k.as("olga");
		expect((await viewAs(s, "everyone")).status).toBe(400);
		const before = await k.api.world.fingerprint();
		const missing = await viewAs(s, "role:nope-nope");
		expect(missing.status).toBe(404);
		expect(missing.headers.getSetCookie().join(";")).not.toContain(COOKIE);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("a cookie copied from the administrator to someone else does nothing", async () => {
		const owner = await startAs("olga", "role:psizone-volunteer");
		const stolen = owner.browser.cookies(ORIGIN).get(COOKIE) ?? "";
		expect(stolen).not.toBe("");
		const rita = await k.as("rita");
		rita.browser.cookies(ORIGIN).set(COOKIE, stolen);
		const html = await text(await rita.get("/clients"));
		expect(html).not.toContain("data-view-as-banner");
		expect(has(html, "/calendar")).toBe(true);
	});
	it("a tampered cookie does nothing", async () => {
		const owner = await startAs("olga", "role:psizone-volunteer");
		const value = owner.browser.cookies(ORIGIN).get(COOKIE) ?? "";
		owner.browser.cookies(ORIGIN).set(COOKIE, `${value.slice(0, -3)}AAA`);
		expect(await text(await owner.get("/clients"))).not.toContain("data-view-as-banner");
	});
});

describe("while viewing as a role the console shows what that role's people see", () => {
	it("Reception: no clinical tab, no audit, no roles; the banner and the pill say so; the state is not in the URL", async () => {
		const s = await startAs("olga", "role:psizone-reception");
		const start = await viewAs(await k.as("olga"), "role:psizone-reception");
		expect(start.headers.get("location")).toBe("/calendar");
		const html = await text(await s.get(`/clients/${c1()}`));
		expect(html).toContain("Vezi aplicația ca Recepție — doar vizualizare");
		expect(html).toContain("data-view-as-banner");
		expect(html).toContain("data-view-as-pill");
		expect(html).toContain("Ieși");
		expect(has(html, `/clients/${c1()}/records`)).toBe(false);
		expect(has(html, `/clients/${c1()}/packages`)).toBe(true);
		expect(has(html, "/audit")).toBe(false);
		expect(html).not.toContain("synthetic-notes-one");
		expect(html).toContain("0712 345 678");
		expect(html).not.toContain("?as=");
		expect((await s.get("/audit")).status).toBe(403);
		expect((await s.get("/settings/roles")).status).toBe(403);
	});
	it("Therapist as a role: the calendar reaches only their own rows, and a role has no person, so none", async () => {
		const s = await startAs("olga", "role:psizone-therapist");
		const html = await text(await s.get("/calendar?view=day&date=2026-11-14"));
		expect(html).not.toContain("Dora Test");
		expect(html).not.toContain("Elena Test");
		expect(has(html, "/requests")).toBe(false);
		expect(has(html, "/clients")).toBe(true);
	});
	it("Dora as a member: exactly her own calendar column", async () => {
		const s = await startAs("olga", "member:dora");
		const html = await text(await s.get("/calendar?view=day&date=2026-11-14"));
		expect(html).toContain("Dora Test");
		expect(html).not.toContain("Elena Test");
		const clients = await text(await s.get("/clients"));
		expect(clients).toContain("Client One");
		expect(clients).not.toContain("Client Two");
		expect(has(await text(await s.get(`/clients/${c1()}`)), `/clients/${c1()}/records`)).toBe(true);
		expect((await s.get(`/clients/${k.api.world.ids.c2}`)).status).toBe(404);
	});
	it("Volunteer: only the roster", async () => {
		const s = await startAs("olga", "role:psizone-volunteer");
		const landed = await s.get("/");
		const html = await text(landed);
		expect(has(html, "/roster")).toBe(true);
		for (const h of ["/calendar", "/clients", "/requests", "/audit", "/reminders", "/settings"])
			expect(has(html, h), h).toBe(false);
		expect((await s.get("/calendar")).status).toBe(403);
		expect((await s.get("/roster")).status).toBe(200);
	});
	it("Accountant: money and contact, no clinical data", async () => {
		const s = await startAs("olga", "role:psizone-accountant");
		const html = await text(await s.get(`/clients/${c1()}`));
		expect(has(html, `/clients/${c1()}/packages`)).toBe(true);
		expect(html).not.toContain("Guardian of one");
		expect(html).not.toContain("synthetic-notes-one");
	});
	it("a custom role is listed and can be viewed as", async () => {
		await api("POST", "/roles", { name: "Custom Viewer", copyFrom: "psizone-accountant" });
		const picker = await text(await (await k.as("olga")).get("/view-as"));
		expect(picker).toContain("Custom Viewer");
	});
});

describe("viewing as someone else is read-only, in the console and at the service", () => {
	it("every write is refused with a clear message, and nothing changes", async () => {
		const s = await startAs("olga", "role:psizone-reception");
		const before = await k.api.world.fingerprint();
		for (const path of [
			`/clients/${c1()}/archive`,
			`/clients/${c1()}/delete`,
			"/requests/AAAA-BBBB/handled",
			`/clients/${c1()}/packages/${k.api.world.ids.pkg}/payments`,
			"/calendar/editor/save",
			`/clients/${c1()}/packages`,
		]) {
			const r = await s.post(path);
			expect(r.status, path).toBe(403);
			expect(await text(r), path).toContain("nimic nu se poate modifica");
		}
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("even viewing as the owner, who may write, nothing can be written", async () => {
		const s = await startAs("olga", "role:psizone-owner");
		const before = await k.api.world.fingerprint();
		const r = await s.post("/settings/roles/psizone-reception", new URLSearchParams({}), form);
		expect(r.status).toBe(403);
		expect(await text(r)).toContain("nimic nu se poate modifica");
		expect((await s.post(`/clients/${c1()}/archive`)).status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("a Datastar write gets a toast, not a broken page", async () => {
		const s = await startAs("olga", "role:psizone-reception");
		const r = await s.post(`/clients/${c1()}/archive`, undefined, { "datastar-request": "true" });
		expect(r.headers.get("content-type")).toContain("text/event-stream");
		expect(await text(r)).toContain("nimic nu se poate modifica");
	});
	it("no write control is drawn: no new-appointment button, no archive button, no save", async () => {
		const s = await startAs("olga", "role:psizone-reception");
		expect(has(await text(await s.get("/calendar")), "/calendar?new=1")).toBe(false);
		const client = await text(await s.get(`/clients/${c1()}`));
		expect(client).not.toContain("askArchive = true");
		expect(client).not.toContain("askDelete = true");
		const packages = await text(await s.get(`/clients/${c1()}/packages`));
		expect(packages).not.toContain("adm-inline__view");
		expect(packages).not.toContain("pk__pay");
		expect(packages).not.toContain("newPkg = true");
	});
	it("the service itself refuses a write that says it is a view, even from a console that forgot", async () => {
		const token = await k.api.tokenFor("olga");
		const before = await k.api.world.fingerprint();
		const r = await fetch(`${k.api.url}${A}/clients/${c1()}/archive`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "x-psi-view-as": "role:psizone-reception" },
		});
		expect(r.status).toBe(403);
		expect(await r.json()).toMatchObject({ error: { detail: { reason: "view_as_readonly" } } });
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});

describe("starting and stopping are written down, and stopping returns to one's own view", () => {
	it("Exit: the banner goes, the own menu comes back, the cookie is cleared, and both events are audited as the administrator's", async () => {
		const s = await startAs("olga", "role:psizone-volunteer");
		expect(has(await text(await s.get("/roster")), "/audit")).toBe(false);
		const stop = await s.raw("/view-as/stop", { method: "POST" });
		expect(stop.status).toBe(303);
		expect(stop.headers.get("location")).toBe("/");
		for (const line of stop.headers.getSetCookie()) {
			const [pair] = line.split(";");
			const [name] = (pair ?? "").split("=");
			if (name === COOKIE) s.browser.cookies(ORIGIN).delete(name);
		}
		const html = await text(await s.get("/clients"));
		expect(html).not.toContain("data-view-as-banner");
		expect(has(html, "/audit")).toBe(true);
		const events = (await api("GET", "/audit?limit=200")).json.items as {
			action: string;
			actor: { subject: string };
			target: { id: string };
		}[];
		expect(
			events.some(
				(e) =>
					e.action === "view_as.start" &&
					e.actor.subject === "olga" &&
					e.target.id === "role:psizone-volunteer",
			),
		).toBe(true);
		expect(events.some((e) => e.action === "view_as.stop" && e.actor.subject === "olga")).toBe(
			true,
		);
	});
	it("the cookie ends with the browser session, is HttpOnly and never in the URL", async () => {
		const r = await viewAs(await k.as("olga"), "role:psizone-reception");
		const line = r.headers.getSetCookie().find((c) => c.startsWith(COOKIE)) ?? "";
		expect(line).toContain("HttpOnly");
		expect(line).not.toMatch(/max-age|expires/i);
		expect(r.headers.get("location")).not.toContain("role");
	});
	it("a person who stops being a roles administrator while viewing is put back in their own view at once", async () => {
		await api("POST", "/roles", { name: "Temp Admin", copyFrom: "psizone-owner" });
		const roles = (await api("GET", "/roles")).json.items as { id: string; name: string }[];
		const temp = roles.find((r) => r.name === "Temp Admin")?.id ?? "";
		await api("PUT", "/members/nina", { displayName: "nina test", roles: [temp], coordinates: [] });
		const s = await startAs("nina", "role:psizone-volunteer");
		expect(await text(await s.get("/roster"))).toContain("data-view-as-banner");
		await api("PUT", "/members/nina", {
			displayName: "nina test",
			roles: ["psizone-admin"],
			coordinates: [],
		});
		const html = await text(await s.get("/clients"));
		expect(html).not.toContain("data-view-as-banner");
		expect(has(html, "/clients")).toBe(true);
		expect(await auditActions()).toContain("view_as.start");
	});
});
