import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER);
	await c.signIn();
});
afterEach(() => c.close());

const datastar = { "content-type": "application/json", "datastar-request": "true" };

describe("web requests", () => {
	it("mark handled: the one request leaves the open list, the others stay, and it is audited", async () => {
		const open = (await c.port.requests("psizone")).filter((r) => !r.handled).length;
		const res = await c.post("/requests/w1/handled", "{}", datastar);
		expect(await res.text()).toContain("Cererea a fost marcată ca rezolvată.");
		const after = await c.port.requests("psizone");
		expect(after.find((r) => r.id === "w1")?.handled).toBe(true);
		expect(after.filter((r) => !r.handled).length).toBe(open - 1);
		expect((await c.port.audit("psizone"))[0]?.action).toBe("request.handled");
		expect(await (await c.get("/requests?show=handled")).text()).toContain("Solicitant Exemplu 01");
	});
	it("does not touch the other app's request with the same id", async () => {
		await c.post("/requests/w1/handled", "{}", datastar);
		expect((await c.port.requests("hemisync")).find((r) => r.id === "w1")?.handled).toBe(false);
	});
});

describe("reminders", () => {
	it("one tap: a wa.me link per row, and no confirmation dialog anywhere in the page", async () => {
		const html = await (await c.get("/reminders?date=2026-11-16")).text();
		expect(html).toContain("https://wa.me/407000000");
		expect(html).toContain('target="_blank"');
		expect(html).not.toMatch(/confirm\(|data-on:click="[^"]*confirm|role="alertdialog"/);
		expect(html).toContain("mailto:");
	});
	it("marking sent records it once and leaves the rest unsent", async () => {
		const items = await c.port.reminders("psizone", "2026-11-16");
		const first = items[0];
		if (first === undefined) throw new Error("seed has no appointments on 2026-11-16");
		await c.post(`/reminders/${first.appointment.id}/sent`, "{}", datastar);
		const after = await c.port.reminders("psizone", "2026-11-16");
		expect(after.filter((i) => i.sent).map((i) => i.appointment.id)).toEqual([
			first.appointment.id,
		]);
		expect(await (await c.get("/reminders?date=2026-11-16")).text()).toContain("Trimis");
	});
});

describe("ids from the path are looked up before anything is written or echoed", () => {
	it("a request that does not exist is a 404, not a stream error", async () => {
		const before = await c.port.audit("psizone");
		expect((await c.post("/requests/nope/handled", "{}", datastar)).status).toBe(404);
		expect(await c.port.audit("psizone")).toEqual(before);
	});
	it("a reminder for an appointment that does not exist is a 404 and is never echoed into a script", async () => {
		const evil = encodeURIComponent("x');alert(1);('");
		const res = await c.post(`/reminders/${evil}/sent`, "{}", datastar);
		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain("alert");
		expect((await c.port.audit("psizone"))[0]?.action).not.toBe("reminder.send");
	});
	it("marking a real reminder patches an escaped pill, with no script at all", async () => {
		const first = (await c.port.reminders("psizone", "2026-11-16"))[0];
		if (first === undefined) throw new Error("seed has no appointments on 2026-11-16");
		const body = await (
			await c.post(`/reminders/${first.appointment.id}/sent`, "{}", datastar)
		).text();
		expect(body).toContain(`rem-state-${first.appointment.id}`);
		expect(body).not.toContain("<script");
		expect(body).not.toContain("execute");
	});
});

describe("the install prompt", () => {
	it("is in the user menu, in the console's own words", async () => {
		expect(await (await c.get("/calendar")).text()).toContain("Instalează aplicația");
	});
});

describe("new appointment (tap to create)", () => {
	const create = (over: Record<string, string>) =>
		c.post(
			"/calendar/new",
			JSON.stringify({
				apDate: "2026-11-18",
				apTime: "10:30",
				apCol: "p1",
				apClient: "c1",
				apService: "s1",
				...over,
			}),
			datastar,
		);

	it("creates it with the service's duration and closes the sheet", async () => {
		const before = (await c.port.calendar("psizone", "2026-11-18", "2026-11-18")).appointments
			.length;
		const body = await (await create({})).text();
		expect(body).toContain("Programarea a fost adăugată.");
		expect(body).toContain("newAppt");
		const after = (await c.port.calendar("psizone", "2026-11-18", "2026-11-18")).appointments;
		expect(after.length).toBe(before + 1);
		expect(after.at(-1)).toMatchObject({
			startMin: 630,
			durationMin: 50,
			columnId: "p1",
			clientId: "c1",
			status: "confirmed",
		});
	});
	it.each([
		["a client that does not exist", { apClient: "zz" }],
		["a service that does not exist", { apService: "zz" }],
		["a column that does not exist", { apCol: "zz" }],
		["a bad time", { apTime: "9am" }],
		["a bad date", { apDate: "tomorrow" }],
		["an empty client", { apClient: "" }],
	])("refuses %s and writes nothing", async (_name, over) => {
		const before = (await c.port.calendar("psizone", "2026-11-01", "2026-12-31")).appointments
			.length;
		const auditBefore = (await c.port.audit("psizone")).length;
		const body = await (await create(over)).text();
		expect(body).toContain("Completează toate câmpurile");
		expect((await c.port.calendar("psizone", "2026-11-01", "2026-12-31")).appointments.length).toBe(
			before,
		);
		expect((await c.port.audit("psizone")).length).toBe(auditBefore);
	});
});

describe("search", () => {
	it("finds clients and appointments by name, live, as patched elements", async () => {
		const res = await c.get(
			`/search/live?datastar=${encodeURIComponent(JSON.stringify({ q: "Exemplu 04" }))}`,
		);
		const body = await res.text();
		expect(body).toContain("adm-search-results");
		expect(body).toContain("Ilinca Exemplu 04");
	});
	it("says when nothing matches, and clears for an empty query", async () => {
		const miss = await (
			await c.get(`/search/live?datastar=${encodeURIComponent(JSON.stringify({ q: "qqqq" }))}`)
		).text();
		expect(miss).toContain("Niciun rezultat");
		const blank = await (
			await c.get(`/search/live?datastar=${encodeURIComponent(JSON.stringify({ q: "  " }))}`)
		).text();
		expect(blank).not.toContain("Niciun rezultat");
	});
	it("escapes what was typed", async () => {
		const body = await (
			await c.get(
				`/search/live?datastar=${encodeURIComponent(JSON.stringify({ q: "<img src=x onerror=1>" }))}`,
			)
		).text();
		expect(body).not.toContain("<img");
	});
});

describe("preferences and apps", () => {
	it("switches the language and the theme by cookie and renders in them", async () => {
		await c.post("/prefs", new URLSearchParams({ lang: "en", theme: "dark" }), {
			"content-type": "application/x-www-form-urlencoded",
		});
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain('lang="en"');
		expect(html).toContain('data-theme="admin-dark"');
		expect(html).toContain("New appointment");
	});
	it("ignores a preference it does not know", async () => {
		await c.post("/prefs", new URLSearchParams({ lang: "xx", theme: "neon" }), {
			"content-type": "application/x-www-form-urlencoded",
		});
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain('lang="ro"');
		expect(html).toContain('data-theme="admin-light"');
	});
	it("switches app for a member of both, and tints the console", async () => {
		expect(await (await c.get("/calendar")).text()).toContain('data-app="psizone"');
		await c.get("/switch/hemisync");
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain('data-app="hemisync"');
		expect(html).toContain("Ghid Sesiuni");
	});
	it("will not switch into an app the person is not in", async () => {
		const solo = await startConsole(
			MEMBER,
			{},
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
		);
		await solo.signIn();
		await solo.get("/switch/hemisync");
		expect(await (await solo.get("/calendar")).text()).toContain('data-app="psizone"');
		await solo.close();
	});
});

describe("roles", () => {
	const form = (entries: Record<string, string>) =>
		c.post("/settings/roles/therapist", new URLSearchParams(entries), {
			"content-type": "application/x-www-form-urlencoded",
		});

	it("saves the matrix, applies it at once, and audits it", async () => {
		await form({
			"perm.clients.view": "all",
			"perm.appointments.view": "own",
			"field.contact": "on",
			"field.money": "on",
		});
		const role = (await c.port.roles("psizone")).find((r) => r.id === "therapist");
		expect(role?.grants).toEqual({ clients: { view: "all" }, appointments: { view: "own" } });
		expect(role?.fieldGroups).toEqual(["contact", "money"]);
		expect((await c.port.audit("psizone"))[0]?.action).toBe("role.save");
	});
	it("leaves the other roles and the other app alone", async () => {
		const owner = (await c.port.roles("psizone")).find((r) => r.id === "owner");
		const other = (await c.port.roles("hemisync")).find((r) => r.id === "therapist");
		await form({ "perm.clients.view": "all" });
		expect((await c.port.roles("psizone")).find((r) => r.id === "owner")).toEqual(owner);
		expect((await c.port.roles("hemisync")).find((r) => r.id === "therapist")).toEqual(other);
	});
	it("refuses a role that does not exist", async () => {
		expect(
			(
				await c.post("/settings/roles/ghost", new URLSearchParams({}), {
					"content-type": "application/x-www-form-urlencoded",
				})
			).status,
		).toBe(404);
	});
	it("shows the permission matrix with resource rows, action columns and a scope in each cell", async () => {
		const html = await (await c.get("/settings/roles?role=reception")).text();
		expect(html).toContain('name="perm.appointments.view"');
		expect(html).toContain("Toate din aplicație");
		expect(html).toContain('name="field.money"');
	});
});

describe("notifications", () => {
	it("keeps the person's choice", async () => {
		await c.post("/settings/notifications", new URLSearchParams({ requests: "on" }), {
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(await c.port.pushPrefs(MEMBER.sub)).toEqual({ requests: true, reminders: false });
	});
});
