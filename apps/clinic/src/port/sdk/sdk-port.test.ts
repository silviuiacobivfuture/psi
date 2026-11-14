import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { DEFAULT_SETTINGS } from "../schema-settings";
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
		expect(reception.fieldGroups).toEqual(expect.arrayContaining(["contact", "guardian", "money"]));
		expect(reception.fieldGroups).not.toContain("clinical");
		expect(Object.hasOwn(reception.permissions, "clients_view_clinical")).toBe(false);
		const therapist = await (await as("dora")).capabilities("dora", "psizone");
		expect(therapist.permissions.calendars_view).toEqual(["own"]);
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
	it("createAppointments: stores the chosen local time as the right instant", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-16", "2026-11-16");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services.find((s) => s.name === "Evaluare");
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		const [made] = await port.createAppointments("psizone", {
			date: "2026-11-16",
			startMin: 9 * 60 + 30,
			columnId: dora.id,
			clientId: client.id,
			serviceId: service.id,
		});
		if (!made) throw new Error("one appointment expected");
		expect(made).toMatchObject({
			date: "2026-11-16",
			startMin: 570,
			durationMin: 60,
			columnId: dora.id,
		});
		const stored = (await owner("GET", `/appointments/${made.id}`)).json as { start: number };
		expect(stored.start).toBe(Date.UTC(2026, 10, 16, 7, 30));
	});
	it("createAppointments: the same slot twice is a conflict, and nothing more is written", async () => {
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
		await port.createAppointments("psizone", input);
		const before = await api.world.fingerprint();
		const second = await refusal(() => port.createAppointments("psizone", input));
		expect(second.code).toBe("conflict");
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("createAppointments: an unknown service is invalid before anything is sent", async () => {
		const port = await as("olga");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.createAppointments("psizone", {
				date: "2026-11-18",
				startMin: 600,
				columnId: "x00000000001",
				clientId: "x00000000002",
				serviceId: "nope",
			}),
		);
		expect(e.code).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("createAppointments: a volunteer is forbidden, and nothing is written", async () => {
		const port = await as("vera");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.createAppointments("psizone", {
				date: "2026-11-18",
				startMin: 600,
				columnId: "x00000000001",
				clientId: "x00000000002",
				serviceId: "x00000000003",
			}),
		);
		expect(e.code).toBe("forbidden");
		expect(await api.world.fingerprint()).toBe(before);
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
		expect(accountant).toMatchObject({ phone: "0712 345 678", guardian: null, note: "" });
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
	it("packages: money in the console's units, the payments read from the service", async () => {
		const [pkg] = await (await as("olga")).packages("psizone", api.world.ids.c1);
		expect(pkg).toMatchObject({
			id: api.world.ids.pkg,
			totalBani: 110_000,
			sessions: 10,
			bonus: 1,
		});
		expect(pkg?.payments.reduce((sum, p) => sum + p.amountBani, 0)).toBe(50_000);
	});
	it("packages: a role without money is not found", async () => {
		expect(
			(await refusal(async () => (await as("dora")).packages("psizone", api.world.ids.c1))).code,
		).toBe("not-found");
	});
	it("createPackage: sells a package at the typed total", async () => {
		const port = await as("olga");
		const made = await port.createPackage("psizone", api.world.ids.c1, {
			name: "Pachet nou",
			sessions: 5,
			bonus: 1,
			totalBani: 90_000,
			note: "",
		});
		expect(made).toMatchObject({ name: "Pachet nou", sessions: 5, bonus: 1, totalBani: 90_000 });
	});
	it("createPackage: a note is kept and read back", async () => {
		const port = await as("olga");
		const made = await port.createPackage("psizone", api.world.ids.c1, {
			name: "Cu notă",
			sessions: 5,
			bonus: 0,
			totalBani: 90_000,
			note: "plătește în două rate",
		});
		expect(made.note).toBe("plătește în două rate");
		const [again] = (await port.packages("psizone", api.world.ids.c1)).filter(
			(p) => p.id === made.id,
		);
		expect(again?.note).toBe("plătește în două rate");
	});
	it("updatePackage: a note is changed and emptied", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const noted = await port.updatePackage("psizone", api.world.ids.c1, pkg.id, { note: "o notă" });
		expect(noted.note).toBe("o notă");
		const cleared = await port.updatePackage("psizone", api.world.ids.c1, pkg.id, { note: "" });
		expect(cleared.note).toBe("");
	});
	it("createPackage: a note too long is invalid, and nothing is written", async () => {
		const port = await as("olga");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.createPackage("psizone", api.world.ids.c1, {
				name: "Prea lung",
				sessions: 5,
				bonus: 0,
				totalBani: 90_000,
				note: "x".repeat(1001),
			}),
		);
		expect(e.code).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("updatePackage: a new total keeps the discount the package already has", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const saved = await port.updatePackage("psizone", api.world.ids.c1, pkg.id, {
			name: "Renamed",
			totalBani: 100_000,
		});
		expect(saved).toMatchObject({ name: "Renamed", totalBani: 100_000 });
		const stored = (await owner("GET", `/packages/${pkg.id}`)).json as {
			package: { discountCents: number; priceCents: number };
		};
		expect(stored.package.discountCents).toBe(10_000);
		expect(stored.package.priceCents).toBe(110_000);
	});
	it("updatePackage: fewer sessions than are used is invalid, and nothing is written", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.updatePackage("psizone", api.world.ids.c1, pkg.id, { sessions: 0, bonus: 0 }),
		);
		expect(["invalid"]).toContain(e.code);
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("updatePackage: a package of another client is not found, and nothing is written", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.updatePackage("psizone", api.world.ids.c2, pkg.id, { name: "x" }),
		);
		expect(e.code).toBe("not-found");
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("updatePackage: someone who may not edit it is refused, and nothing is written", async () => {
		const port = await as("ana");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.updatePackage("psizone", api.world.ids.c1, pkg.id, { name: "Nope" }),
		);
		expect(["forbidden", "not-found"]).toContain(e.code);
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("addPayment: appends a payment and the ledger follows", async () => {
		const port = await as("olga");
		const [pkg] = await port.packages("psizone", api.world.ids.c1);
		if (!pkg) throw new Error("fixture");
		const had = pkg.payments.length;
		const after = await port.addPayment(
			"psizone",
			api.world.ids.c1,
			pkg.id,
			{ date: "2026-11-13", amountBani: 20_000, method: "card" },
			"Someone else",
		);
		expect(after.payments).toHaveLength(had + 1);
		expect(after.payments.map((p) => [p.amountBani, p.method])).toContainEqual([20_000, "card"]);
		// Who took it is the signed-in person, whatever name the caller passes.
		const team = (await owner("GET", "/members?limit=500")).json.items as {
			subject: string;
			displayName: string;
		}[];
		const mine = after.payments.find((p) => p.amountBani === 20_000);
		expect(mine?.recordedBy).toBe(team.find((m) => m.subject === "olga")?.displayName);
	});
});

describe("the floor plan", () => {
	it("an app with no plan reads an empty one; the owner may draw, reception may not", async () => {
		const owner = await (await as("olga")).floorPlan("psizone");
		expect(owner.doc.revision).toBe(0);
		expect(owner.doc.floors).toHaveLength(1);
		expect(owner.writable).toBe(true);
		const reception = await (await as("rita")).floorPlan("psizone");
		expect(reception.writable).toBe(false);
		expect(reception.doc.revision).toBe(0);
	});
	it("a plan is saved at the next revision and read back; a save from an old revision is stale", async () => {
		const port = await as("olga");
		const { doc } = await port.floorPlan("psizone");
		const saved = await port.saveFloorPlan("psizone", { ...doc, northDeg: 30 });
		expect(saved).toMatchObject({ ok: true, doc: { revision: doc.revision + 1, northDeg: 30 } });
		expect((await port.floorPlan("psizone")).doc.northDeg).toBe(30);
		expect(await port.saveFloorPlan("psizone", { ...doc, northDeg: 99 })).toEqual({
			ok: false,
			reason: "stale",
		});
		expect((await port.floorPlan("psizone")).doc.northDeg).toBe(30);
	});
	it("a plan the service refuses is invalid, and nothing is written", async () => {
		const port = await as("olga");
		const { doc } = await port.floorPlan("psizone");
		const before = await api.world.fingerprint();
		expect(await port.saveFloorPlan("psizone", { ...doc, width: 10 })).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("someone who may not draw is refused, and nothing is written", async () => {
		const port = await as("rita");
		const { doc } = await port.floorPlan("psizone");
		const before = await api.world.fingerprint();
		expect((await refusal(() => port.saveFloorPlan("psizone", doc))).code).toBe("forbidden");
		expect(await api.world.fingerprint()).toBe(before);
	});
});

describe("a weekly series, through the adapter", () => {
	const mk = async (port: Awaited<ReturnType<typeof as>>, date: string) => {
		const calendar = await port.calendar("psizone", date, date);
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		return { date, startMin: 600, columnId: dora.id, clientId: client.id, serviceId: service.id };
	};
	it("books every week in one step, on the same wall-clock time, with one series id", async () => {
		const port = await as("olga");
		const made = await port.createAppointments("psizone", {
			...(await mk(port, "2026-12-01")),
			recurrence: { count: 3 },
		});
		expect(made.map((a) => a.date)).toEqual(["2026-12-01", "2026-12-08", "2026-12-15"]);
		expect(new Set(made.map((a) => a.seriesId)).size).toBe(1);
		expect(made[0]?.seriesId).toBe(made[0]?.id);
		expect(made.every((a) => a.startMin === 600)).toBe(true);
		expect((await port.appointment("psizone", made[2]?.id ?? ""))?.seriesId).toBe(made[0]?.id);
	});
	it("ends on a day", async () => {
		const port = await as("olga");
		const made = await port.createAppointments("psizone", {
			...(await mk(port, "2027-01-04")),
			recurrence: { until: "2027-01-18" },
		});
		expect(made.map((a) => a.date)).toEqual(["2027-01-04", "2027-01-11", "2027-01-18"]);
	});
	it("refuses the whole series when one week is taken, and nothing is written", async () => {
		const port = await as("olga");
		const input = await mk(port, "2027-02-01");
		await port.createAppointments("psizone", { ...input, date: "2027-02-15" });
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			port.createAppointments("psizone", { ...input, recurrence: { count: 4 } }),
		);
		expect(e.code).toBe("conflict");
		expect(await api.world.fingerprint()).toBe(before);
	});
});

describe("the edits of an appointment, through the adapter", () => {
	let n = 0;
	/** A new appointment of its own on a day of its own, made through the port. */
	const fresh = async (
		port: Awaited<ReturnType<typeof as>>,
		extra: Record<string, unknown> = {},
	) => {
		const date = `2026-12-${String(1 + ++n).padStart(2, "0")}`;
		const calendar = await port.calendar("psizone", date, date);
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		const clients = calendar.clients;
		if (!dora || !service || clients.length < 2) throw new Error("fixture");
		const [made] = await port.createAppointments("psizone", {
			date,
			startMin: 600,
			columnId: dora.id,
			clientId: api.world.ids.c1,
			serviceId: service.id,
			...extra,
		});
		if (made === undefined) throw new Error("fixture");
		return { made, date, service, other: clients.find((c) => c.id !== api.world.ids.c1) };
	};

	it("moves the appointment to another client", async () => {
		const port = await as("olga");
		const { made } = await fresh(port);
		const moved = await port.updateAppointment("psizone", made.id, { clientId: api.world.ids.c2 });
		expect(moved.clientId).toBe(api.world.ids.c2);
		expect((await port.appointment("psizone", made.id))?.clientId).toBe(api.world.ids.c2);
	});

	it("changes the price and switches the reminder off and on", async () => {
		const port = await as("olga");
		const { made } = await fresh(port, { priceBani: 10_000 });
		expect(made).toMatchObject({ priceBani: 10_000, remind: true });
		const edited = await port.updateAppointment("psizone", made.id, {
			priceBani: 7_000,
			remind: false,
		});
		expect(edited).toMatchObject({ priceBani: 7_000, remind: false });
		expect((await port.updateAppointment("psizone", made.id, { remind: true })).remind).toBe(true);
	});

	it("is made without its reminder, or requested, then confirmed; a requested one shows as requested", async () => {
		const port = await as("olga");
		const { made } = await fresh(port, { status: "requested", remind: false });
		expect(made).toMatchObject({ status: "requested", remind: false });
		const confirmed = await port.updateAppointment("psizone", made.id, { status: "confirmed" });
		expect(confirmed.status).toBe("confirmed");
		expect((await port.appointment("psizone", made.id))?.status).toBe("confirmed");
	});

	it("changes the service, and takes an appointment out of its package", async () => {
		const port = await as("olga");
		const { made, service } = await fresh(port, { packageId: api.world.ids.pkg });
		expect(made.packageId).toBe(api.world.ids.pkg);
		const out = await port.updateAppointment("psizone", made.id, { packageId: null });
		expect(out.packageId).toBeNull();
		const same = await port.updateAppointment("psizone", made.id, { serviceId: service.id });
		expect(same.serviceId).toBe(service.id);
	});

	it("a confirmed appointment cannot go back to waiting, and nothing is written", async () => {
		const port = await as("olga");
		const { made } = await fresh(port);
		const before = await api.world.fingerprint();
		expect(
			(await refusal(() => port.updateAppointment("psizone", made.id, { status: "requested" })))
				.code,
		).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
	});

	it("a client that is not there, and another client's package, are refused and nothing is written", async () => {
		const port = await as("olga");
		const { made } = await fresh(port, { packageId: api.world.ids.pkg });
		const before = await api.world.fingerprint();
		expect(
			(
				await refusal(() =>
					port.updateAppointment("psizone", made.id, { clientId: "nosuchone000" }),
				)
			).code,
		).toBe("invalid");
		expect(
			(
				await refusal(() =>
					port.updateAppointment("psizone", made.id, { clientId: api.world.ids.c2 }),
				)
			).code,
		).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
		expect((await port.appointment("psizone", made.id))?.clientId).toBe(api.world.ids.c1);
	});
});

describe("changing, cancelling and paying an appointment", () => {
	it("appointment: reads one, null for one that is not there", async () => {
		const port = await as("olga");
		expect(await port.appointment("psizone", api.world.ids.a1)).toMatchObject({
			id: api.world.ids.a1,
			date: "2026-11-14",
			startMin: 600,
		});
		expect(await port.appointment("psizone", "x00000000009")).toBeNull();
	});
	it("updateAppointment: moves it in the clinic's wall clock", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-23", "2026-11-23");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		const [made] = await port.createAppointments("psizone", {
			date: "2026-11-23",
			startMin: 600,
			columnId: dora.id,
			clientId: client.id,
			serviceId: service.id,
		});
		if (!made) throw new Error("one appointment expected");
		const moved = await port.updateAppointment("psizone", made.id, { startMin: 660 });
		expect(moved).toMatchObject({
			date: "2026-11-23",
			startMin: 660,
			durationMin: made.durationMin,
		});
		const attended = await port.updateAppointment("psizone", made.id, { status: "attended" });
		expect(attended.status).toBe("attended");
	});
	it("cancelAppointment: cancels with its reason", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-24", "2026-11-24");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		const client = calendar.clients[0];
		if (!dora || !service || !client) throw new Error("fixture");
		const [made] = await port.createAppointments("psizone", {
			date: "2026-11-24",
			startMin: 600,
			columnId: dora.id,
			clientId: client.id,
			serviceId: service.id,
		});
		if (!made) throw new Error("one appointment expected");
		const gone = await port.cancelAppointment("psizone", made.id, "Clientul a anulat");
		expect(gone).toMatchObject({ status: "cancelled", cancelReason: "Clientul a anulat" });
	});
	it("findConflicts: names what the asked time collides with, from the day's calendar", async () => {
		const port = await as("olga");
		const calendar = await port.calendar("psizone", "2026-11-14", "2026-11-14");
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		if (!dora) throw new Error("fixture");
		const hits = await port.findConflicts("psizone", {
			date: "2026-11-14",
			startMin: 630,
			durationMin: 30,
			columnIds: [dora.id],
		});
		expect(hits.map((h) => h.appointmentId)).toContain(api.world.ids.a1);
		expect(
			await port.findConflicts("psizone", {
				date: "2026-11-14",
				startMin: 900,
				durationMin: 30,
				columnIds: [dora.id],
			}),
		).toEqual([]);
	});
	it("createClient: a client with a phone and a guardian", async () => {
		const made = await (await as("olga")).createClient("psizone", {
			name: "Nou Client",
			phone: "0700 111 222",
			guardian: "Un părinte",
		});
		expect(made).toMatchObject({
			name: "Nou Client",
			phone: "0700 111 222",
			guardian: "Un părinte",
		});
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
	it("markReminderSent: someone whose reminders were taken away is refused", async () => {
		await owner("PUT", "/members/rita/overrides", { grant: [], deny: ["reminders_send_all"] });
		const before = await api.world.fingerprint();
		const refused = await refusal(async () =>
			(await as("rita")).markReminderSent("psizone", api.world.ids.a1),
		);
		const after = await api.world.fingerprint();
		await owner("PUT", "/members/rita/overrides", { grant: [], deny: [] });
		// the service answers a record it will not let her act on as it does for one she cannot see
		expect(["forbidden", "not-found"]).toContain(refused.code);
		expect(after).toBe(before);
	});
});

describe("settings: columns, services, roles, audit, team, push preferences", () => {
	it("columns: people, rooms, devices and groups, each as its kind", async () => {
		const cols = await (await as("olga")).columns("psizone");
		const kinds = new Set(cols.map((c) => c.kind));
		expect([...kinds].sort()).toEqual(["device", "group", "person", "room"]);
	});
	it("columns: a kind the person may not list is left out, not an error", async () => {
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: ["rooms_view_all"] });
		const cols = await (await as("nina")).columns("psizone");
		expect(cols.some((c) => c.kind === "room")).toBe(false);
		expect(cols.some((c) => c.kind === "person")).toBe(true);
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: [] });
	});
	it("services: with prices for someone who may see them, null for someone who may not", async () => {
		expect(
			(await (await as("olga")).services("psizone")).find((s) => s.name === "Evaluare")?.priceBani,
		).toBe(25_000);
		await owner("PUT", "/members/nina/overrides", { grant: [], deny: ["prices_view_all"] });
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
		// an unmapped permission (people_view_all: the role editor has no row for it) survives
		expect(before.role.permissions).toContain("people_view_all");
		expect(after.role.permissions).toContain("people_view_all");
		expect(after.role.permissions).toContain("clients_view_all_contact");
		expect(after.role.permissions).not.toContain("clients_view_all_money");
		expect(after.role.permissions).toContain("web_requests_view_all");
	});
	it("saveRole: a role administrator only, and a refusal changes nothing", async () => {
		const port = await as("rita");
		const roles = await (await as("olga")).roles("psizone");
		const target = roles[0];
		if (!target) throw new Error("fixture");
		const before = await api.world.fingerprint();
		expect((await refusal(() => port.saveRole("psizone", target))).code).toBe("forbidden");
		expect(await api.world.fingerprint()).toBe(before);
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
	it("my settings: the defaults until saved, then the saved set, each person's own", async () => {
		const olga = await as("olga");
		expect(await olga.mySettings("psizone", "olga")).toEqual({
			...DEFAULT_SETTINGS,
			stored: false,
		});
		const wanted = {
			...DEFAULT_SETTINGS,
			locale: "en" as const,
			calendarView: "week" as const,
			quietHours: { start: "21:30", end: "06:45" },
		};
		expect(await olga.saveMySettings("psizone", "olga", wanted)).toEqual({
			...wanted,
			stored: true,
		});
		expect(await olga.mySettings("psizone", "olga")).toEqual({ ...wanted, stored: true });
		// The subject argument is not what decides: the token is Rita's, so these are Rita's.
		expect((await (await as("rita")).mySettings("psizone", "olga")).stored).toBe(false);
	});
	it("my settings: a set the contract refuses is `invalid`, and nothing is stored", async () => {
		const port = await as("dora");
		const refused = await refusal(() =>
			port.saveMySettings("psizone", "dora", {
				...DEFAULT_SETTINGS,
				quietHours: { start: "08:00", end: "08:00" },
			}),
		);
		expect(refused.code).toBe("invalid");
		expect((await port.mySettings("psizone", "dora")).stored).toBe(false);
	});
});

describe("view as", () => {
	it("start and stop are audited events of the administrator, and a non-administrator is forbidden", async () => {
		const port = await as("olga");
		const seen = await port.startViewAs("olga", "psizone", "role:psizone-reception");
		expect(seen.fieldGroups).toEqual(expect.arrayContaining(["contact", "guardian", "money"]));
		await port.stopViewAs("olga", "psizone");
		const actions = (await port.audit("psizone")).map((e) => e.action);
		expect(actions).toContain("view_as.start");
		expect(actions).toContain("view_as.stop");
		const before = await api.world.fingerprint();
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
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("a port made for viewing as someone else is read-only at the service: every write is forbidden", async () => {
		const port = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			viewAs: "role:psizone-reception",
		});
		const before = await api.world.fingerprint();
		expect((await refusal(() => port.archiveClient("psizone", api.world.ids.c1))).code).toBe(
			"forbidden",
		);
		expect((await refusal(() => port.markReminderSent("psizone", api.world.ids.a1))).code).toBe(
			"forbidden",
		);
		expect(await api.world.fingerprint()).toBe(before);
		expect((await port.clients("psizone", "current", "")).length).toBeGreaterThan(0);
	});
});
