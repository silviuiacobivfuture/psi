import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { createSdkPort } from "./index";

const A = "/v1/apps/psizone";
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

/** The port as a person of the populated clinic: the service sees THEIR token. */
const as = async (subject: string, extra: { fetch?: typeof globalThis.fetch } = {}) =>
	createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject), ...extra });
const refusal = async (run: () => Promise<unknown>): Promise<PortError> => {
	try {
		await run();
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("expected a refusal");
};
const owner = (method: string, path: string, body?: unknown) =>
	api.world.call("olga", method, `${A}${path}`, body);
const newClient = async (name: string): Promise<string> =>
	String((await owner("POST", "/clients", { name, contact: { phone: "0700 000 111" } })).json.id);

describe("memberships and capabilities", () => {
	it("memberships: the apps the person belongs to, with their roles", async () => {
		const port = await as("olga");
		expect(await port.memberships("olga")).toEqual([{ app: "psizone", roles: ["psizone-owner"] }]);
	});
	it("memberships: a stranger belongs to nothing", async () => {
		expect(await (await as("mallory")).memberships("mallory")).toEqual([]);
	});
	it("capabilities: what the service says this person may do, by role", async () => {
		const reception = await (await as("rita")).capabilities("rita", "psizone");
		expect(reception.fieldGroups).toEqual(["contact", "guardian", "money"]);
		expect(Object.hasOwn(reception.permissions, "clients_clinical_view")).toBe(false);
		const therapist = await (await as("dora")).capabilities("dora", "psizone");
		expect(therapist.permissions.calendar_view).toEqual(["own"]);
		expect(therapist.timeZone).toBe("Europe/Bucharest");
	});
});

describe("the calendar and appointments", () => {
	it("calendar: the clinic's wall clock, not UTC (08:00 UTC is 10:00 in Bucharest)", async () => {
		const data = await (await as("olga")).calendar("psizone", "2026-11-14", "2026-11-14");
		const dora = data.columns.find((c) => c.name === "Dora Test");
		expect(dora).toMatchObject({ kind: "person" });
		const appts = data.appointments.filter((a) => a.columnId === dora?.id);
		expect(appts).toHaveLength(1);
		expect(appts[0]).toMatchObject({
			date: "2026-11-14",
			startMin: 600,
			durationMin: 60,
			status: "confirmed",
		});
		expect(data.services.map((s) => s.name)).toContain("Evaluare");
		expect(data.clients.map((c) => c.name)).toContain("Client One");
	});
	it("calendar: a day outside the appointments is empty", async () => {
		const data = await (await as("olga")).calendar("psizone", "2026-12-20", "2026-12-20");
		expect(data.appointments).toEqual([]);
	});
	it("calendar: a therapist sees their own column only (the service decides)", async () => {
		const data = await (await as("dora")).calendar("psizone", "2026-11-14", "2026-11-14");
		expect(data.columns.map((c) => c.name)).toEqual(["Dora Test"]);
	});
	it("createAppointment: stores the chosen local time as the right instant", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-16", "2026-11-16");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services.find((s) => s.name === "Evaluare");
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		const made = await port.createAppointment("psizone", {
			date: "2026-11-16",
			startMin: 9 * 60 + 30,
			columnId: dora.id,
			clientId: client.id,
			serviceId: service.id,
		});
		expect(made).toMatchObject({
			date: "2026-11-16",
			startMin: 570,
			durationMin: 60,
			columnId: dora.id,
		});
		const stored = (await owner("GET", `/appointments/${made.id}`)).json as { start: number };
		expect(stored.start).toBe(Date.UTC(2026, 10, 16, 7, 30));
	});
	it("createAppointment: the same slot twice is a conflict, and nothing more is written", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-17", "2026-11-17");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		const input = {
			date: "2026-11-17",
			startMin: 600,
			columnId: dora.id,
			clientId: client.id,
			serviceId: service.id,
		};
		await port.createAppointment("psizone", input);
		const before = api.world.fingerprint();
		const second = await refusal(() => port.createAppointment("psizone", input));
		expect(second.code).toBe("conflict");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("createAppointment: an unknown service is invalid before anything is sent", async () => {
		const port = await as("olga");
		const before = api.world.fingerprint();
		const e = await refusal(() =>
			port.createAppointment("psizone", {
				date: "2026-11-18",
				startMin: 600,
				columnId: "x00000000001",
				clientId: "x00000000002",
				serviceId: "nope",
			}),
		);
		expect(e.code).toBe("invalid");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("createAppointment: a volunteer is forbidden, and nothing is written", async () => {
		const port = await as("vera");
		const before = api.world.fingerprint();
		const e = await refusal(() =>
			port.createAppointment("psizone", {
				date: "2026-11-18",
				startMin: 600,
				columnId: "x00000000001",
				clientId: "x00000000002",
				serviceId: "x00000000003",
			}),
		);
		expect(e.code).toBe("forbidden");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("clientAppointments: sorted, only that client's", async () => {
		const list = await (await as("olga")).clientAppointments("psizone", api.world.ids.c1);
		expect(list.map((a) => a.id)).toContain(api.world.ids.a1);
		expect(list.every((a) => a.clientId === api.world.ids.c1)).toBe(true);
	});
});

describe("clients and search", () => {
	it("clients: current and archived are apart; a query narrows by name", async () => {
		const port = await as("olga");
		const id = await newClient("Archivable Unique");
		await owner("POST", `/clients/${id}/archive`);
		expect((await port.clients("psizone", "current", "")).map((c) => c.id)).not.toContain(id);
		expect((await port.clients("psizone", "archived", "")).map((c) => c.id)).toContain(id);
		expect((await port.clients("psizone", "current", "Client One")).map((c) => c.name)).toEqual([
			"Client One",
		]);
	});
	it("client: maps the field groups the caller may see; absent groups are empty, never invented", async () => {
		const full = await (await as("olga")).client("psizone", api.world.ids.c1);
		expect(full).toMatchObject({
			name: "Client One",
			phone: "0712 345 678",
			guardian: "Guardian of one",
			note: "synthetic-notes-one",
			status: "current",
		});
		const reception = await (await as("rita")).client("psizone", api.world.ids.c1);
		expect(reception?.phone).toBe("0712 345 678");
		expect(reception?.note).toBe("");
		const accountant = await (await as("ana")).client("psizone", api.world.ids.c1);
		expect(accountant).toMatchObject({ phone: null, email: null, guardian: null, note: "" });
	});
	it("client: one that does not exist (or is not theirs) is null, not an error", async () => {
		expect(await (await as("olga")).client("psizone", "x00000000009")).toBeNull();
		expect(await (await as("dora")).client("psizone", api.world.ids.c2)).toBeNull();
	});
	it("archiveClient and deleteClient: write through, and a stranger's attempt is refused", async () => {
		const id = await newClient("Gone Soon");
		const denied = await refusal(async () => (await as("vera")).archiveClient("psizone", id));
		expect(denied.code).toBe("not-found");
		await (await as("olga")).archiveClient("psizone", id);
		expect(((await owner("GET", `/clients/${id}`)).json as { status: string }).status).toBe(
			"archived",
		);
		await (await as("olga")).deleteClient("psizone", id);
		expect(((await owner("GET", `/clients/${id}`)).json as { status: string }).status).toBe(
			"deleted",
		);
	});
	it("search: finds a client by name and brings their upcoming appointment", async () => {
		const hits = await (await as("olga")).search("psizone", "Client One");
		expect(hits.find((h) => h.kind === "client")).toMatchObject({ label: "Client One" });
		expect(hits.find((h) => h.kind === "appointment")).toMatchObject({ date: "2026-11-14" });
		expect(await (await as("olga")).search("psizone", "   ")).toEqual([]);
	});
});

describe("packages", () => {
	it("packages: money in the console's units", async () => {
		const [pkg] = await (await as("olga")).packages("psizone", api.world.ids.c1);
		expect(pkg).toMatchObject({
			id: api.world.ids.pkg,
			totalBani: 110_000,
			paidBani: 50_000,
			sessions: 10,
			bonus: 1,
		});
	});
	it("packages: a role without money is forbidden", async () => {
		expect(
			(await refusal(async () => (await as("dora")).packages("psizone", api.world.ids.c1))).code,
		).toBe("not-found");
	});
	it("savePackage: a new total, and a higher paid figure records a cash payment of the difference", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const saved = await port.savePackage("psizone", {
			...pkg,
			name: "Renamed",
			totalBani: 100_000,
			paidBani: 70_000,
		});
		expect(saved).toMatchObject({ name: "Renamed", totalBani: 100_000, paidBani: 70_000 });
		const stored = (await owner("GET", `/packages/${pkg.id}`)).json as {
			payments: { amountCents: number; method: string }[];
			package: { discountCents: number; priceCents: number };
		};
		expect(stored.payments.map((p) => [p.amountCents, p.method])).toContainEqual([20_000, "cash"]);
		expect(stored.package.discountCents).toBe(10_000);
		expect(stored.package.priceCents).toBe(110_000);
	});
	it("savePackage: a lower paid figure is refused, and nothing is written", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = api.world.fingerprint();
		const e = await refusal(() => port.savePackage("psizone", { ...pkg, paidBani: 1 }));
		expect(e.code).toBe("invalid");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("savePackage: a package of another client is not found, and nothing is written", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = api.world.fingerprint();
		const e = await refusal(() =>
			port.savePackage("psizone", { ...pkg, clientId: api.world.ids.c2 }),
		);
		expect(e.code).toBe("not-found");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("savePackage: reception may not change prices of packages they cannot edit... (forbidden is its own case)", async () => {
		const port = await as("ana");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = api.world.fingerprint();
		const e = await refusal(() => port.savePackage("psizone", { ...pkg, name: "Nope" }));
		expect(["forbidden", "not-found"]).toContain(e.code);
		expect(api.world.fingerprint()).toBe(before);
	});
});

describe("the roster, requests and reminders", () => {
	it("roster: the week's people and entries, in the console's kinds", async () => {
		await owner("PUT", `/roster/${api.world.ids.dora}/2026-11-16`, { kind: "leave_cm" });
		await owner("PUT", `/roster/${api.world.ids.dora}/2026-11-17`, {
			kind: "work",
			start: 540,
			end: 1020,
		});
		const got = await (await as("olga")).roster("psizone", "2026-11-16");
		expect(got.people.map((p) => p.name)).toContain("Dora Test");
		expect(got.entries).toContainEqual({
			personId: api.world.ids.dora,
			date: "2026-11-16",
			kind: "medical",
			fromMin: null,
			toMin: null,
		});
		expect(got.entries).toContainEqual({
			personId: api.world.ids.dora,
			date: "2026-11-17",
			kind: "work",
			fromMin: 540,
			toMin: 1020,
		});
	});
	it("requests: a callback arrives open, and marking it handled confirms it", async () => {
		const made = await api.world.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Caller Test", phone: "0733 000 222" },
			locale: "ro",
		});
		expect(made.status).toBe(200);
		const port = await as("rita");
		const open = (await port.requests("psizone")).filter((r) => !r.handled);
		const mine = open.find((r) => r.name === "Caller Test");
		expect(mine).toMatchObject({ phone: "0733 000 222", handled: false });
		await port.markRequestHandled("psizone", mine?.id ?? "");
		expect((await port.requests("psizone")).find((r) => r.id === mine?.id)?.handled).toBe(true);
	});
	it("requests: a held slot is confirmed when handled, and the appointment appears", async () => {
		const now = Date.UTC(2026, 10, 13, 8);
		const key = (method: string, path: string, body?: unknown) =>
			api.world.callKey("psizone-web", method, `${A}${path}`, body);
		const slots = (
			await key(
				"GET",
				`/book/slots?service=evaluation&from=${now}&to=${now + 10 * 86_400_000}&limit=5`,
			)
		).json.slots as { practitioner: string; start: number }[];
		const slot = slots[0];
		if (!slot) throw new Error("no slot");
		const held = await key("POST", "/book/holds", {
			service: "evaluation",
			practitioner: slot.practitioner,
			start: slot.start,
			mode: "onsite",
			locale: "ro",
			channel: "form",
		});
		await key("POST", `/book/holds/${held.json.reference}/submit`, {
			holdToken: held.json.holdToken,
			contact: { name: "Slot Visitor", phone: "0733 000 333" },
		});
		const port = await as("rita");
		const mine = (await port.requests("psizone")).find((r) => r.name === "Slot Visitor");
		expect(mine?.handled).toBe(false);
		await port.markRequestHandled("psizone", mine?.id ?? "");
		expect((await port.requests("psizone")).find((r) => r.id === mine?.id)?.handled).toBe(true);
		const appts = (await owner("GET", `/appointments?from=${slot.start}&to=${slot.start + 1}`)).json
			.items as { note?: string }[];
		expect(appts.some((a) => a.note?.includes("confirmed"))).toBe(true);
	});
	it("markRequestHandled: an unknown reference is not found, and a therapist is forbidden", async () => {
		expect(
			(await refusal(async () => (await as("rita")).markRequestHandled("psizone", "NOPE-NOPE")))
				.code,
		).toBe("not-found");
		expect(
			(await refusal(async () => (await as("dora")).markRequestHandled("psizone", "NOPE-NOPE")))
				.code,
		).toBe("forbidden");
	});
	it("reminders: tomorrow's list joins the appointment, the column and the contact; marking sends it", async () => {
		const port = await as("rita");
		const items = await port.reminders("psizone", "2026-11-14");
		const one = items.find((i) => i.client.name === "Client One");
		expect(one).toMatchObject({
			sent: false,
			column: { name: "Dora Test" },
			appointment: { startMin: 600 },
			client: { phone: "0712 345 678" },
		});
		await port.markReminderSent("psizone", one?.appointment.id ?? "");
		expect(
			(await port.reminders("psizone", "2026-11-14")).find((i) => i.client.name === "Client One")
				?.sent,
		).toBe(true);
	});
	it("markReminderSent: a therapist is forbidden", async () => {
		expect(
			(await refusal(async () => (await as("dora")).markReminderSent("psizone", api.world.ids.a1)))
				.code,
		).toBe("forbidden");
	});
});

describe("settings: columns, services, roles, audit, team, push preferences", () => {
	it("columns: people, rooms, devices and groups, each as its kind", async () => {
		const cols = await (await as("olga")).columns("psizone");
		const kinds = new Set(cols.map((c) => c.kind));
		expect([...kinds].sort()).toEqual(["device", "group", "person", "room"]);
	});
	it("columns: a kind the person may not list is left out, not an error", async () => {
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: ["rooms_view"] });
		const cols = await (await as("nina")).columns("psizone");
		expect(cols.some((c) => c.kind === "room")).toBe(false);
		expect(cols.some((c) => c.kind === "person")).toBe(true);
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: [] });
	});
	it("services: with prices for someone who may see them, null for someone who may not", async () => {
		expect(
			(await (await as("olga")).services("psizone")).find((s) => s.name === "Evaluare")?.priceBani,
		).toBe(25_000);
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: ["prices_view"] });
		expect(
			(await (await as("nina")).services("psizone")).find((s) => s.name === "Evaluare")?.priceBani,
		).toBeNull();
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: [] });
	});
	it("roles: the editor's grants, the member counts and the field groups", async () => {
		const roles = await (await as("olga")).roles("psizone");
		const reception = roles.find((r) => r.id === "psizone-reception");
		expect(reception?.grants.clients?.view).toBe("all");
		expect(reception?.fieldGroups).toEqual(["contact", "guardian", "money"]);
		expect(reception?.members).toBe(1);
	});
	it("saveRole: changes what the editor shows and keeps every permission it cannot show", async () => {
		const port = await as("olga");
		const created = await owner("POST", "/roles", {
			name: "Editable",
			copyFrom: "psizone-reception",
		});
		const id = String((created.json as { id: string }).id);
		const before = (await owner("GET", `/roles/${id}`)).json as { role: { permissions: string[] } };
		const current = (await port.roles("psizone")).find((r) => r.id === id);
		if (!current) throw new Error("fixture");
		const grants = { ...current.grants, requests: { view: "all" as const } };
		delete (grants as Record<string, unknown>).audit;
		const saved = await port.saveRole("psizone", {
			...current,
			name: "Edited",
			fieldGroups: ["contact"],
			grants,
		});
		expect(saved.name).toBe("Edited");
		const after = (await owner("GET", `/roles/${id}`)).json as { role: { permissions: string[] } };
		// an unmapped permission (people_view: the role editor has no row for it) survives
		expect(before.role.permissions).toContain("people_view");
		expect(after.role.permissions).toContain("people_view");
		expect(after.role.permissions).toContain("clients_contact_view_all");
		expect(after.role.permissions).not.toContain("clients_money_view_all");
		expect(after.role.permissions).toContain("requests_view");
	});
	it("saveRole: a role administrator only, and a refusal changes nothing", async () => {
		const port = await as("rita");
		const roles = await (await as("olga")).roles("psizone");
		const target = roles[0];
		if (!target) throw new Error("fixture");
		const before = api.world.fingerprint();
		expect((await refusal(() => port.saveRole("psizone", target))).code).toBe("forbidden");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("audit: the events, newest first, in the console's shape", async () => {
		const events = await (await as("olga")).audit("psizone");
		expect(events.length).toBeGreaterThan(0);
		expect(events[0]).toMatchObject({
			actor: expect.any(String),
			action: expect.any(String),
			target: expect.stringContaining(":"),
		});
		expect((await refusal(async () => (await as("rita")).audit("psizone"))).code).toBe("forbidden");
	});
	it("members: the team, for the view-as picker", async () => {
		const team = await (await as("olga")).members("psizone");
		expect(team.map((m) => m.subject)).toContain("rita");
	});
	it("push preferences: not in the service yet, said as such (no storage invented)", async () => {
		const port = await as("olga");
		expect((await refusal(() => port.pushPrefs("olga"))).code).toBe("not-available-yet");
		expect(
			(await refusal(() => port.savePushPrefs("olga", { requests: true, reminders: true }))).code,
		).toBe("not-available-yet");
	});
});

describe("view as", () => {
	it("start and stop are audited events of the administrator, and a non-administrator is forbidden", async () => {
		const port = await as("olga");
		const seen = await port.startViewAs("olga", "psizone", "role:psizone-reception");
		expect(seen.fieldGroups).toEqual(["contact", "guardian", "money"]);
		await port.stopViewAs("olga", "psizone");
		const actions = (await port.audit("psizone")).map((e) => e.action);
		expect(actions).toContain("view_as.start");
		expect(actions).toContain("view_as.stop");
		const before = api.world.fingerprint();
		expect(
			(
				await refusal(async () =>
					(await as("rita")).startViewAs("rita", "psizone", "role:psizone-owner"),
				)
			).code,
		).toBe("forbidden");
		expect(
			(
				await refusal(async () =>
					(await as("rita")).capabilities("rita", "psizone", "role:psizone-owner"),
				)
			).code,
		).toBe("forbidden");
		expect(api.world.fingerprint()).toBe(before);
	});
	it("a port made for viewing as someone else is read-only at the service: every write is forbidden", async () => {
		const port = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			viewAs: "role:psizone-reception",
		});
		const before = api.world.fingerprint();
		expect((await refusal(() => port.archiveClient("psizone", api.world.ids.c1))).code).toBe(
			"forbidden",
		);
		expect((await refusal(() => port.markReminderSent("psizone", api.world.ids.a1))).code).toBe(
			"forbidden",
		);
		expect(api.world.fingerprint()).toBe(before);
		expect((await port.clients("psizone", "current", "")).length).toBeGreaterThan(0);
	});
});
