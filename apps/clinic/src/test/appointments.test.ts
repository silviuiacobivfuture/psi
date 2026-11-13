import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blankEditor } from "../pages/editor-form";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER, { today: "2026-11-16" });
	await c.signIn();
});
afterEach(() => c.close());

const SSE = { "content-type": "application/json", "datastar-request": "true" };
const DAY = "2027-02-02"; // a day the seed leaves empty

const editor = (over: Record<string, unknown> = {}) => ({
	...blankEditor({
		date: DAY,
		startMin: 600,
		col: "p1",
		service: { id: "s1", name: "x", durationMin: 50, priceBani: 15000 },
	}),
	client: "c1",
	clientName: "Ștefan Exemplu 01",
	...over,
});
const save = (over: Record<string, unknown> = {}) =>
	c.post("/calendar/editor/save", JSON.stringify({ ed: editor(over) }), SSE);
const day = async (date = DAY) => (await c.port.calendar("psizone", date, date)).appointments;
const auditCount = async () => (await c.port.audit("psizone")).length;

describe("opening the editor", () => {
	it("a new one at a slot is prefilled with that date, time and column", async () => {
		const body = await (await c.get(`/calendar/editor?date=${DAY}&time=14:30&col=p2`)).text();
		expect(body).toContain('id="editor-body"');
		expect(body).toContain('"time":"14:30"');
		expect(body).toContain('"col":"p2"');
		expect(body).toContain(`"date":"${DAY}"`);
	});
	it("an unknown column or a garbled time falls back to the first column and 09:00", async () => {
		const body = await (await c.get("/calendar/editor?date=2027-02-02&time=zz&col=nope")).text();
		expect(body).toContain('"time":"09:00"');
		expect(body).toContain('"col":"p1"');
	});
	it("an existing one opens with its own values; an unknown id says so and writes nothing", async () => {
		const [a] = await day("2026-11-16");
		const body = await (await c.get(`/calendar/editor?id=${a?.id}`)).text();
		expect(body).toContain(`"id":"${a?.id}"`);
		const missing = await (await c.get("/calendar/editor?id=zz")).text();
		expect(missing).not.toContain('id="editor-body"');
	});
	it("the page itself opens it with ?new=1, and the details with ?appt=", async () => {
		const html = await (await c.get(`/calendar?date=${DAY}&new=1`)).text();
		expect(html).toContain('id="editor-body"');
		const [a] = await day("2026-11-16");
		const detail = await (await c.get(`/calendar?date=2026-11-16&appt=${a?.id}`)).text();
		expect(detail).toContain('id="detail-body"');
		expect(detail).toContain("Marchează prezent");
	});
});

describe("creating", () => {
	it("one appointment with the service's duration and price; the audit log says so", async () => {
		const body = await (await save()).text();
		expect(body).toContain("Programarea a fost adăugată.");
		const [a] = await day();
		expect(a).toMatchObject({
			startMin: 600,
			durationMin: 50,
			columnId: "p1",
			clientId: "c1",
			priceBani: 15000,
			status: "confirmed",
			packageId: null,
			paidMethod: null,
			remind: true,
		});
		expect((await c.port.audit("psizone"))[0]?.action).toBe("appointment.create");
	});
	it("a chosen duration, status, note, room and device are stored; a reminder can be off", async () => {
		await save({
			dur: 80,
			status: "requested",
			note: "Notă ăîâșț 🙂",
			room: "r1",
			device: "d1",
			remind: false,
		});
		const [a] = await day();
		expect(a).toMatchObject({
			durationMin: 80,
			status: "requested",
			note: "Notă ăîâșț 🙂",
			resourceIds: ["r1", "d1"],
			remind: false,
		});
	});
	it("a new client typed inline is created with the appointment: one save", async () => {
		const before = (await c.port.clients("psizone", "current", "")).length;
		await save({
			client: "",
			clientName: "",
			newc: true,
			nName: "Client Nou Exemplu",
			nPhone: "0700 111 222",
			nGuardian: "Tutore Nou",
		});
		const clients = await c.port.clients("psizone", "current", "Client Nou");
		expect(clients).toHaveLength(1);
		expect(clients[0]).toMatchObject({ phone: "0700 111 222", guardian: "Tutore Nou" });
		expect((await c.port.clients("psizone", "current", "")).length).toBe(before + 1);
		expect((await day())[0]?.clientId).toBe(clients[0]?.id);
	});
	it("paying now records the method; drawing from a package charges nothing", async () => {
		await save({ payNow: true, payMethod: "card" });
		expect((await day())[0]).toMatchObject({ paidMethod: "card", priceBani: 15000 });
		await save({ time: "12:00", pkg: "k1" });
		const second = (await day()).find((a) => a.startMin === 720);
		expect(second).toMatchObject({ packageId: "k1", priceBani: 0, paidMethod: null });
	});
	it("a weekly series by count is created whole, one id, same time each week", async () => {
		await save({ rec: "count", recN: 3 });
		const dates = ["2027-02-02", "2027-02-09", "2027-02-16"];
		const made = (await Promise.all(dates.map((d) => day(d)))).flat();
		expect(made).toHaveLength(3);
		expect(new Set(made.map((a) => a.seriesId)).size).toBe(1);
		expect(made[0]?.seriesId).not.toBeNull();
	});
	it("a weekly series until a day stops at that day", async () => {
		await save({ rec: "until", recUntil: "2027-02-17" });
		expect((await day("2027-02-16")).length).toBe(1);
		expect((await day("2027-02-23")).length).toBe(0);
	});
});

describe("conflicts block, and say what is free", () => {
	beforeEach(async () => {
		await save();
	});
	it("the same practitioner at an overlapping time: refused, nothing written, a way out offered", async () => {
		const audit = await auditCount();
		const body = await (await save({ time: "10:30", client: "c3", clientName: "x" })).text();
		expect(body).toContain("Terapeut Alfa e ocupat 10:00–10:50");
		expect(body).toContain("Liber la:");
		expect(body).toContain("Ora aleasă e ocupată");
		expect(await day()).toHaveLength(1);
		expect(await auditCount()).toBe(audit);
	});
	it("the offer names a free colleague of the same kind", async () => {
		const body = await (await save({ time: "10:30", client: "c3" })).text();
		expect(body).toContain("Terapeut Beta");
	});
	it("a room or device already in use blocks even with another practitioner", async () => {
		await save({ time: "12:00", device: "d1" });
		const body = await (await save({ time: "12:10", col: "p2", device: "d1" })).text();
		expect(body).toContain("Aparat NFB 1 e ocupat 12:00–12:50");
		expect(await day()).toHaveLength(2);
	});
	it("touching is not overlapping: right after, and right before, are free", async () => {
		await save({ time: "10:50" });
		await save({ time: "09:10" });
		expect(await day()).toHaveLength(3);
	});
	it("a cancelled appointment frees its time", async () => {
		const [a] = await day();
		await c.port.cancelAppointment("psizone", a?.id ?? "", "test");
		await save({ client: "c3" });
		expect((await day()).filter((x) => x.status !== "cancelled")).toHaveLength(1);
	});
	it("a series with one taken week is refused whole: nothing written for any week", async () => {
		await save({ date: "2027-02-16", time: "10:00", client: "c3" });
		const before = (await Promise.all(["2027-02-09", "2027-02-23"].map((d) => day(d)))).flat();
		const body = await (
			await save({ rec: "count", recN: 4, date: "2027-02-09", time: "10:20" })
		).text();
		expect(body).toContain("ocupat");
		const after = (await Promise.all(["2027-02-09", "2027-02-23"].map((d) => day(d)))).flat();
		expect(after).toEqual(before);
	});
	it("the live check shows the conflict without writing", async () => {
		const audit = await auditCount();
		const body = await (
			await c.post("/calendar/editor/check", JSON.stringify({ ed: editor({ time: "10:20" }) }), SSE)
		).text();
		expect(body).toContain("Terapeut Alfa e ocupat");
		expect(await auditCount()).toBe(audit);
	});
	it("editing an appointment never conflicts with itself", async () => {
		const [a] = await day();
		const body = await (await save({ id: a?.id, time: "10:10", note: "mutat" })).text();
		expect(body).toContain("Programarea a fost adăugată.");
		expect((await day())[0]).toMatchObject({ startMin: 610, note: "mutat" });
	});
});

describe("refusals: each says why, and nothing is written", () => {
	const nothing = async (over: Record<string, unknown>, text: string): Promise<void> => {
		const audit = await auditCount();
		const body = await (await save(over)).text();
		expect(body).toContain(text);
		expect(await day()).toEqual([]);
		expect(await auditCount()).toBe(audit);
	};
	it("no client", () => nothing({ client: "", clientName: "" }, "Alege un client"));
	it("a new client without a name", () =>
		nothing({ client: "", newc: true, nName: "   " }, "Alege un client"));
	it("an unknown service", () => nothing({ svc: "zz" }, "Alege serviciul"));
	it.each([0, 4, 601, 1.5, Number.NaN])("a duration of %s", (dur) =>
		nothing({ dur }, "Durata trebuie"));
	it("a bad date", () => nothing({ date: "2027-13-45x" }, "Completează"));
	it("an unreadable price", () => nothing({ price: "mult" }, "Valoarea nu poate fi citită"));
	it.each([
		{ rec: "count", recN: 1 },
		{ rec: "count", recN: 53 },
		{ rec: "until", recUntil: "" },
		{ rec: "until", recUntil: DAY },
	])("a series of %j", (over) => nothing(over, "Pentru repetare"));
	it("a body that is not the editor's", async () => {
		const body = await (
			await c.post("/calendar/editor/save", JSON.stringify({ ed: { id: 5 } }), SSE)
		).text();
		expect(body).toContain("Completează");
		expect(await day()).toEqual([]);
	});
	it("an unknown column, or a package that is not the client's", async () => {
		await nothing({ col: "nope" }, "Completează");
		await nothing({ pkg: "k2" }, "Completează");
	});
});

describe("searching a client as you type", () => {
	const find = async (q: string) =>
		await (
			await c.post("/calendar/editor/clients", JSON.stringify({ ed: editor({ q }) }), SSE)
		).text();
	it("by name, by phone; at most six; archived clients are not offered", async () => {
		expect(await find("Ioana")).toContain("Ioana Exemplu 02");
		expect(await find("0700 000 002")).toContain("Ioana Exemplu 02");
		expect((await find("Exemplu")).match(/class="ed-client"/g)?.length).toBe(6);
		expect(await find("Exemplu 23")).not.toContain('class="ed-client"');
	});
	it("nothing typed shows nothing; no match says so; unicode and markup are safe", async () => {
		expect(await find("")).not.toContain('class="ed-client"');
		expect(await find("zzzz")).toContain("Niciun client pentru");
		expect(await find('<b>&"')).not.toContain("<b>&");
	});
});

describe("the details of an appointment", () => {
	const open = async () => {
		await save({ time: "15:00" });
		return (await day()).find((a) => a.startMin === 900)?.id ?? "";
	};
	const act = (id: string, what: string, body: Record<string, unknown> = {}) =>
		c.post(`/appointments/${id}/${what}`, JSON.stringify(body), SSE);
	it("marks present and absent, each audited once", async () => {
		const id = await open();
		await act(id, "attended");
		expect((await c.port.appointment("psizone", id))?.status).toBe("attended");
		await act(id, "no-show");
		expect((await c.port.appointment("psizone", id))?.status).toBe("no-show");
		expect((await c.port.audit("psizone"))[0]?.action).toBe("appointment.edit");
	});
	it("a no-show or attended session counts as used on its package", async () => {
		await save({ time: "15:00", pkg: "k1" });
		const id = (await day()).find((a) => a.startMin === 900)?.id ?? "";
		const before = await (await c.get("/clients/c1/packages")).text();
		await act(id, "attended");
		const after = await (await c.get("/clients/c1/packages")).text();
		const used = (h: string) => Number(/data-testid="used">(\d+)</.exec(h)?.[1]);
		expect(used(after)).toBe(used(before) + 1);
	});
	it("collects the payment with the chosen method", async () => {
		const id = await open();
		await act(id, "pay", { dtPay: "transfer" });
		expect((await c.port.appointment("psizone", id))?.paidMethod).toBe("transfer");
	});
	it("refuses an unknown method: nothing recorded", async () => {
		const id = await open();
		await act(id, "pay", { dtPay: "gold" });
		expect((await c.port.appointment("psizone", id))?.paidMethod).toBeNull();
	});
	it("cancels with a reason, which is kept, and frees the time", async () => {
		const id = await open();
		await act(id, "cancel", { dtReason: "Clientul s-a îmbolnăvit" });
		expect(await c.port.appointment("psizone", id)).toMatchObject({
			status: "cancelled",
			cancelReason: "Clientul s-a îmbolnăvit",
		});
		expect((await save({ time: "15:00", client: "c3" })).status).toBe(200);
	});
	it.each(["", "   ", undefined])("refuses to cancel without a reason (%j)", async (reason) => {
		const id = await open();
		await act(id, "cancel", { dtReason: reason });
		expect((await c.port.appointment("psizone", id))?.status).toBe("confirmed");
	});
	it("an unknown appointment is a 404 for every action and for the details", async () => {
		for (const what of ["attended", "no-show", "pay", "cancel"])
			expect((await act("zz", what)).status).toBe(404);
		const body = await (await c.get("/calendar/appointment/zz")).text();
		expect(body).not.toContain('id="detail-body"');
	});
	it("shows who, when, where, the package and the money; a reminder link only for an open one", async () => {
		await save({ time: "16:00", pkg: "k1" });
		const id = (await day()).find((a) => a.startMin === 960)?.id ?? "";
		const body = await (await c.get(`/calendar/appointment/${id}`)).text();
		for (const t of [
			"Ștefan Exemplu 01",
			"Terapeut Alfa",
			"Abonament 10 ședințe",
			"wa.me",
			"Deschide clientul",
		])
			expect(body).toContain(t);
		await act(id, "cancel", { dtReason: "x" });
		const cancelled = await (await c.get(`/calendar/appointment/${id}`)).text();
		expect(cancelled).not.toContain("wa.me");
		expect(cancelled).not.toContain("Marchează prezent");
	});
});

describe("the port's own rules (what the SDK must mirror)", () => {
	it("createAppointments refuses an unknown service, column, resource, client and package", async () => {
		const base = { date: DAY, startMin: 600, columnId: "p1", clientId: "c1", serviceId: "s1" };
		for (const bad of [
			{ serviceId: "zz" },
			{ columnId: "zz" },
			{ resourceIds: ["zz"] },
			{ clientId: "zz" },
			{ packageId: "zz" },
			{ packageId: "k2" },
		])
			await expect(c.port.createAppointments("psizone", { ...base, ...bad })).rejects.toMatchObject(
				{
					code: "invalid",
				},
			);
		expect(await day()).toEqual([]);
	});
	it("a conflict carries what collides", async () => {
		await c.port.createAppointments("psizone", {
			date: DAY,
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
		});
		await expect(
			c.port.createAppointments("psizone", {
				date: DAY,
				startMin: 620,
				columnId: "p1",
				clientId: "c3",
				serviceId: "s1",
			}),
		).rejects.toMatchObject({
			code: "conflict",
			conflicts: [{ columnId: "p1", startMin: 600, endMin: 650 }],
		});
	});
	it("updateAppointment refuses an unknown id and a package of another client", async () => {
		await expect(c.port.updateAppointment("psizone", "zz", { note: "x" })).rejects.toMatchObject({
			code: "not-found",
		});
		const [a] = await c.port.createAppointments("psizone", {
			date: DAY,
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
		});
		await expect(
			c.port.updateAppointment("psizone", a?.id ?? "", { packageId: "k2" }),
		).rejects.toMatchObject({ code: "invalid" });
	});
	it("apps are separate: another app's appointment is not found", async () => {
		const [a] = await c.port.createAppointments("psizone", {
			date: DAY,
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
		});
		expect(await c.port.appointment("hemisync", a?.id ?? "")).toBeNull();
	});
});
