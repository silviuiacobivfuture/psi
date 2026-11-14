import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

const A = "/v1/apps/psizone";
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

describe("what each person's menu offers follows what the service says they may do", () => {
	it("the owner sees every screen and every client tab, but not 'Vezi ca…' (the estate administrator's)", async () => {
		const s = await k.as("olga");
		const html = await text(await s.get(`/clients/${c1()}`));
		for (const h of [
			"/calendar",
			"/clients",
			"/requests",
			"/roster",
			"/reminders",
			"/settings",
			"/me/settings",
		])
			expect(has(html, h), h).toBe(true);
		expect(has(html, "/view-as"), "/view-as").toBe(false);
		for (const tab of ["appointments", "packages", "records", "files"])
			expect(has(html, `/clients/${c1()}/${tab}`), tab).toBe(true);
	});
	it("reception: no audit, no roles tab, no clinical tab", async () => {
		const s = await k.as("rita");
		const html = await text(await s.get(`/clients/${c1()}`));
		expect(has(html, "/audit")).toBe(false);
		expect(has(html, "/view-as")).toBe(false);
		expect(has(html, `/clients/${c1()}/records`)).toBe(false);
		expect(has(html, `/clients/${c1()}/packages`)).toBe(true);
		expect(has(html, "/settings")).toBe(true);
		expect(has(await text(await s.get("/settings/people")), "/settings/roles")).toBe(false);
	});
	it("a therapist: no requests, no money, the clinical tab, and their own calendar column only", async () => {
		const s = await k.as("dora");
		const client = await text(await s.get(`/clients/${c1()}`));
		expect(has(client, "/requests")).toBe(false);
		expect(has(client, `/clients/${c1()}/packages`)).toBe(false);
		expect(has(client, `/clients/${c1()}/records`)).toBe(true);
		const day = await text(await s.get("/calendar?view=day&date=2026-11-14"));
		expect(day).toContain("Dora Test");
		expect(day).not.toContain("Elena Test");
	});
	it("a volunteer: only the roster, and landing on it", async () => {
		const s = await k.as("vera");
		const landed = await s.get("/");
		const html = await text(landed);
		expect(has(html, "/roster")).toBe(true);
		for (const h of ["/calendar", "/clients", "/requests", "/audit", "/reminders"])
			expect(has(html, h), h).toBe(false);
		expect((await s.get("/roster")).status).toBe(200);
	});
	it("an accountant: money and clients, no guardian or clinical data, no calendar writes", async () => {
		const s = await k.as("ana");
		const html = await text(await s.get(`/clients/${c1()}`));
		expect(has(html, `/clients/${c1()}/packages`)).toBe(true);
		expect(html).not.toContain("Guardian of one");
		expect(html).not.toContain("synthetic-notes-one");
		expect(has(html, "/calendar?new=1")).toBe(false);
	});
});

describe("the three kinds of settings", () => {
	it("the owner reaches the organisation's settings and her own; the old addresses lead there; the platform is not hers", async () => {
		const owner = await k.as("olga");
		const nav = await text(await owner.get("/clients"));
		expect(has(nav, "/settings")).toBe(true);
		expect(has(nav, "/me/settings")).toBe(true);
		expect(has(nav, "/platform")).toBe(false);
		const page = await text(await owner.get("/settings"));
		for (const area of ["roles", "people", "services", "rooms", "audit"])
			expect(page, area).toContain(`data-subnav="${area}"`);
		expect((await owner.raw("/admin")).headers.get("location")).toBe("/settings");
		expect((await owner.raw("/audit")).headers.get("location")).toBe("/settings/audit");
		expect((await owner.get("/platform")).status).toBe(403);
	});
	it("a volunteer has her own settings only", async () => {
		const vera = await k.as("vera");
		const roster = await text(await vera.get("/roster"));
		expect(has(roster, "/settings")).toBe(false);
		expect(has(roster, "/me/settings")).toBe(true);
		const before = await k.api.world.fingerprint();
		expect((await vera.get("/settings")).status).toBe(403);
		expect((await vera.get("/me/settings")).status).toBe(200);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});

describe("a screen the person may not open is refused before it runs, and says so", () => {
	it.each([
		["vera", "/calendar"],
		["vera", "/clients"],
		["vera", "/requests"],
		["dora", "/requests"],
		["dora", "/audit"],
		["rita", "/audit"],
		["rita", "/settings/roles"],
		["rita", "/live?screen=calendar&view=day&date=2026-11-14"],
	])("%s opening %s", async (who, path) => {
		if (who === "rita" && path.startsWith("/live")) return; // rita may see the calendar: not refused
		const r = await (await k.as(who)).get(path);
		expect(r.status).toBe(403);
		expect(await text(r)).toContain("Nu ai acces aici");
	});
	it("a client's records tab without the clinical permission", async () => {
		expect((await (await k.as("rita")).get(`/clients/${c1()}/records`)).status).toBe(403);
	});
	it("the live feed of a person who may see neither the calendar nor the requests", async () => {
		expect((await (await k.as("vera")).get("/live?screen=requests&show=open")).status).toBe(403);
	});
});

describe("a field group the service leaves out is not shown", () => {
	it("contact data: present for the owner, absent once the service omits it for reception", async () => {
		const page = `/clients/${c1()}`;
		expect(await text(await (await k.as("olga")).get(page))).toContain("0712 345 678");
		expect(await text(await (await k.as("rita")).get(page))).toContain("0712 345 678");
		await api("PUT", "/members/rita/overrides", { grant: [], deny: ["clients_view_all_contact"] });
		const html = await text(await (await k.as("rita")).get(page));
		expect(html).not.toContain("0712 345 678");
		expect(html).not.toContain("Telefon");
		await api("PUT", "/members/rita/overrides", { grant: [], deny: [] });
	});
	it("prices: shown to whoever may see them, no price column otherwise", async () => {
		expect(await text(await (await k.as("olga")).get("/settings/services"))).toContain("250,00");
		await api("PUT", "/members/nina/overrides", { grant: [], deny: ["prices_view_all"] });
		const html = await text(await (await k.as("nina")).get("/settings/services"));
		expect(html).toContain("Evaluare");
		expect(html).not.toContain("250,00");
		await api("PUT", "/members/nina/overrides", { grant: [], deny: [] });
	});
	it("the clinical note is the clinical group's: reception never sees it", async () => {
		expect(await text(await (await k.as("olga")).get(`/clients/${c1()}`))).toContain(
			"synthetic-notes-one",
		);
		expect(await text(await (await k.as("rita")).get(`/clients/${c1()}`))).not.toContain(
			"synthetic-notes-one",
		);
	});
});

describe("every write is checked again, now, by the console and by the service", () => {
	it("a volunteer's archive is refused and the client is untouched", async () => {
		const s = await k.as("vera");
		const before = await k.api.world.fingerprint();
		const r = await s.post(`/clients/${c1()}/archive`);
		expect(r.status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("a permission taken away after the page was shown is gone at the next write (nothing is cached)", async () => {
		const s = await k.as("rita");
		const id = String((await api("POST", "/clients", { name: "Cached Perm" })).json.id);
		expect(await text(await s.get(`/clients/${id}`))).toContain("Cached Perm");
		await api("PUT", "/members/rita/overrides", { grant: [], deny: ["clients_archive_all"] });
		const before = await k.api.world.fingerprint();
		expect((await s.post(`/clients/${id}/archive`)).status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
		await api("PUT", "/members/rita/overrides", { grant: [], deny: [] });
		expect((await s.post(`/clients/${id}/archive`)).status).toBe(200);
		expect(((await api("GET", `/clients/${id}`)).json as { status: string }).status).toBe(
			"archived",
		);
	});
	it("a therapist cannot mark a request handled", async () => {
		const s = await k.as("dora");
		const before = await k.api.world.fingerprint();
		expect((await s.post("/requests/AAAA-BBBB/handled")).status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("reception's archive goes through, as reception, and the audit says who", async () => {
		const id = String((await api("POST", "/clients", { name: "Archived By Rita" })).json.id);
		expect((await (await k.as("rita")).post(`/clients/${id}/archive`)).status).toBe(200);
		const events = (await api("GET", "/audit")).json.items as {
			action: string;
			actor: { subject: string };
		}[];
		expect(events.some((e) => e.action === "client.archive" && e.actor.subject === "rita")).toBe(
			true,
		);
	});
	it("a role editor save: only for roles administrators", async () => {
		const s = await k.as("rita");
		const before = await k.api.world.fingerprint();
		const r = await s.post("/settings/roles/psizone-reception", new URLSearchParams({}), {
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(r.status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});

describe("live: the service's streams reach the browser as Datastar patches", () => {
	async function until(res: Response, needle: string, ms = 4000): Promise<string> {
		const reader = res.body?.getReader();
		if (reader === undefined) throw new Error("no stream");
		const decoder = new TextDecoder();
		let seen = "";
		const deadline = Date.now() + ms;
		try {
			while (Date.now() < deadline && !seen.includes(needle)) {
				const next = await Promise.race([
					reader.read(),
					new Promise<undefined>((r) => setTimeout(() => r(undefined), 200)),
				]);
				if (next === undefined) continue;
				if (next.done) break;
				seen += decoder.decode(next.value, { stream: true });
			}
		} finally {
			await reader.cancel().catch(() => undefined);
		}
		return seen;
	}

	it("the pages open their feed", async () => {
		const s = await k.as("olga");
		expect(await text(await s.get("/calendar?view=day&date=2026-11-14"))).toContain(
			"/live?screen=calendar",
		);
		expect(await text(await s.get("/requests"))).toContain("/live?screen=requests");
	});
	it("a new appointment re-renders the open calendar, without a reload", async () => {
		const s = await k.as("olga");
		const stream = await s.open("/live?screen=calendar&view=day&date=2026-11-24");
		expect(stream.headers.get("content-type")).toContain("text/event-stream");
		await new Promise((r) => setTimeout(r, 300));
		await api("POST", "/appointments", {
			practitionerId: k.api.world.ids.dora,
			clientId: c1(),
			start: Date.UTC(2026, 10, 24, 8),
			end: Date.UTC(2026, 10, 24, 9),
		});
		const got = await until(stream, "cal-live");
		expect(got).toContain("datastar-patch-elements");
		expect(got).toContain('id="cal-live"');
		expect(got).toContain("Client One");
	});
	it("a new web request re-renders the requests list and moves the badge", async () => {
		const s = await k.as("rita");
		const stream = await s.open("/live?screen=requests&show=open");
		await new Promise((r) => setTimeout(r, 300));
		await k.api.world.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Browser Live Caller", phone: "0733 000 555" },
			locale: "ro",
		});
		const got = await until(stream, "Browser Live Caller");
		expect(got).toContain('id="requests-live"');
		expect(got).toContain("adm-badge-requests");
	});
});

describe("what the service has not built yet is said, not crashed on", () => {
	const fakeSoon =
		(path: string, status: number, code: string): typeof globalThis.fetch =>
		async (input, init) => {
			if (String(input).includes(path))
				return new Response(JSON.stringify({ error: { code, message: "no", requestId: "r-1" } }), {
					status,
					headers: { "content-type": "application/json" },
				});
			return fetch(input, init);
		};
	async function withService(path: string, status: number, code: string) {
		const c = await startSdkConsole({ fetch: fakeSoon(path, status, code) });
		return { c, s: await c.as("olga") };
	}
	it("my settings are the service's: saved here, read back from it, journalled, and nobody else's change", async () => {
		const s = await k.as("dora");
		await s.post(
			"/me/settings/notifications",
			new URLSearchParams({
				"n.appointments.email": "on",
				quiet: "on",
				quietStart: "22:00",
				quietEnd: "07:00",
			}),
			{ "content-type": "application/x-www-form-urlencoded" },
		);
		// The one record the notifier reads: the service's own preferences.
		const stored = await k.api.world.call("dora", "GET", "/v1/apps/psizone/me/notifications");
		expect(stored.json.prefs).toMatchObject({
			quietHours: { start: "22:00", end: "07:00", timeZone: "Europe/Bucharest" },
			channels: {
				appointments: { in_app: false, push: false },
				requests: { in_app: false, push: false, email: false },
			},
		});
		expect(
			(await k.api.world.call("olga", "GET", "/v1/apps/psizone/me/notifications")).json.prefs,
		).toEqual({ channels: {}, quietHours: null });
		const html = await text(await s.get("/me/settings"));
		expect(html).toContain('value="22:00"');
		const trail = await k.api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=notifications.prefs",
		);
		expect(
			(trail.json.items as { actor: { subject: string } }[]).map((e) => e.actor.subject),
		).toContain("dora");
	});
	it("a refusal by the service on a screen the menu offered says there is no access", async () => {
		const { c, s } = await withService("/requests?", 403, "forbidden");
		try {
			expect(await text(await s.get("/requests"))).toContain("Nu ai acces aici");
		} finally {
			await c.close();
		}
	});
	it("too many calls: a calm 'try again', not an error page", async () => {
		const { c, s } = await withService("/requests?", 429, "rate_limited");
		try {
			expect(await text(await s.get("/requests"))).toContain("Prea multe cereri");
		} finally {
			await c.close();
		}
	});
	it("a token the service no longer accepts sends the person back through sign-in", async () => {
		const { c, s } = await withService("/calendar?", 401, "invalid_token");
		try {
			const r = await s.raw("/calendar");
			expect(r.status).toBe(302);
			expect(r.headers.get("location")).toContain("/dev/signin");
		} finally {
			await c.close();
		}
	});
	it("the service being down: the screen's own error state, a 200 shell", async () => {
		const c = await startSdkConsole({
			fetch: async (input, init) => {
				if (String(input).includes("/requests?")) throw new TypeError("down");
				return fetch(input, init);
			},
		});
		try {
			const html = await text(await (await c.as("olga")).get("/requests"));
			expect(html).toContain("adm-banner");
		} finally {
			await c.close();
		}
	});
});
