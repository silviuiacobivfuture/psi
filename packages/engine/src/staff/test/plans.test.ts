import { describe, expect, it } from "vitest";
import { buildBriefing, overlaps } from "../briefing";
import { confirmProposal } from "../execute";
import { createMemoryProposalStore } from "../proposals";
import { FakeStaffPort } from "../testing";
import { call, proposalIdOf, sessionFor } from "./helpers";

function lineValues(session: Awaited<ReturnType<typeof sessionFor>>): string {
	const card = session.cards.filter((c) => c.kind === "proposal").at(-1);
	return card?.kind === "proposal"
		? card.lines.map((l) => `${l.label}=${l.value}`).join(" | ")
		: "";
}

describe("rooms and devices", () => {
	it("roomsAt says who holds each room and device, and until when", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "roomsAt", {
			date: "2026-11-13",
			time: "10:10",
		});
		const byName = Object.fromEntries(
			(out.resources as Array<{ name: string; free: boolean; until: string | null }>).map((r) => [
				r.name,
				r,
			]),
		);
		expect(byName["Cabinet Terapie"]).toMatchObject({ free: false, until: "10:50" });
		expect(byName["Sala Grup"]).toMatchObject({ free: true, until: null });
		expect(byName["NFB 1"]).toMatchObject({ free: true });
		expect(Object.keys(byName)).not.toContain("Ana Pop");
	});

	it("defaults to now in the clinic's zone", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "roomsAt");
		expect(out).toMatchObject({ date: "2026-11-13", time: "09:00" });
	});

	it("freeRooms filters by kind and equipment", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const nfb = await call(session, "freeRooms", {
			date: "2026-11-13",
			time: "11:00",
			equipment: "NFB",
		});
		expect(nfb.status).toBe("none");
		const at10 = await call(session, "freeRooms", {
			date: "2026-11-13",
			time: "10:00",
			equipment: "nfb",
		});
		expect((at10.rooms as Array<{ name: string }>).map((r) => r.name)).toEqual(["NFB 1"]);
		const rooms = await call(session, "freeRooms", {
			date: "2026-11-13",
			time: "10:00",
			kind: "room",
		});
		expect((rooms.rooms as Array<{ name: string }>).map((r) => r.name)).toEqual(["Sala Grup"]);
		expect(
			(await call(session, "freeRooms", { date: "2026-11-13", time: "10:00", kind: "device" }))
				.status,
		).toBe("ok");
	});

	it("refused rooms are refusals, and times are validated", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		await expect(call(session, "roomsAt", { time: "9:5" })).rejects.toThrow();
		port.denied.add("roomsAt");
		expect(await call(session, "roomsAt")).toMatchObject({ reason: "forbidden" });
		expect(await call(session, "freeRooms")).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("resolveDate", () => {
	it("answers in the clinic's today", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(await call(session, "resolveDate", { phrase: "joia viitoare" })).toMatchObject({
			kind: "day",
			date: "2026-11-19",
			weekday: "Thursday",
		});
		expect(await call(session, "resolveDate", { phrase: "săptămâna viitoare" })).toMatchObject({
			kind: "week",
			date: "2026-11-16",
			weekEnd: "2026-11-22",
		});
		expect(await call(session, "resolveDate", { phrase: "blah" })).toMatchObject({
			status: "none",
		});
	});
});

describe("attention and payment notices", () => {
	it("lists who owes and who runs out, with what can reach them", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "attention");
		expect(out.clients).toEqual([
			expect.objectContaining({
				clientId: "c1",
				dueBani: 60000,
				sessionsLeft: 7,
				canEmail: true,
				canWhatsapp: true,
			}),
		]);
	});

	it("only clients with sessions booked in the period when asked", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect(
			((await call(session, "attention", { onlyWithSessions: true })).clients as unknown[]).length,
		).toBe(1);
		port.data.appointments = [];
		expect(
			((await call(session, "attention", { onlyWithSessions: true })).clients as unknown[]).length,
		).toBe(0);
	});

	it("a package running out is listed even when paid", async () => {
		const port = new FakeStaffPort();
		port.data.packages[0] = { ...port.packageOf("k1"), used: 10, paidBani: 100000 };
		const out = await call(await sessionFor(port), "attention", { lowAt: 2 });
		expect(out.clients).toEqual([expect.objectContaining({ sessionsLeft: 1, dueBani: 0 })]);
	});

	it("paymentReminders: one proposal for the batch, only for those who owe and can be reached", async () => {
		const port = new FakeStaffPort();
		const proposals = createMemoryProposalStore();
		const session = await sessionFor(port, { proposals });
		const out = await call(session, "paymentReminders", {
			clientIds: ["c1", "c2"],
			channel: "email",
		});
		expect(out.status).toBe("needs_confirmation");
		expect(lineValues(session)).toContain("Maria Test");
		expect(lineValues(session)).not.toContain("Ion Exemplu");
		const done = await confirmProposal(session, proposalIdOf(out));
		expect(done.status).toBe("done");
		expect(port.data.sent).toHaveLength(1);
		expect(port.data.sent[0]?.text).toContain("600.00 lei");
		expect(
			await call(session, "paymentReminders", { clientIds: ["c2"], channel: "email" }),
		).toMatchObject({ status: "none" });
	});

	it("paymentReminders respects the permission", async () => {
		const port = new FakeStaffPort();
		port.denied.add("reminders.send");
		const session = await sessionFor(port);
		expect(
			await call(session, "paymentReminders", { clientIds: ["c1"], channel: "email" }),
		).toMatchObject({ reason: "not_allowed" });
	});
});

describe("copyWeek", () => {
	it("copies a week in one proposal, listing what cannot be copied", async () => {
		const port = new FakeStaffPort();
		// Next week: Maria's Friday slot is free; Ion's Friday slot is taken; Ana is away on the Saturday.
		port.data.appointments.push({
			...port.appointmentOf("a2"),
			id: "x1",
			date: "2026-11-20",
			clientId: "c3",
			clientName: "Block",
		});
		port.data.roster.push({
			personId: "p1",
			date: "2026-11-21",
			kind: "leave",
			fromMin: null,
			toMin: null,
		});
		const session = await sessionFor(port);
		const out = await call(session, "copyWeek", { fromDate: "2026-11-13", toDate: "2026-11-20" });
		expect(out.status).toBe("needs_confirmation");
		const lines = lineValues(session);
		expect(lines).toContain("Ion Exemplu");
		expect(lines).toContain("busy");
		expect(lines).toContain("on leave");
		const before = port.data.appointments.length;
		const done = await confirmProposal(session, proposalIdOf(out));
		expect(done.status).toBe("done");
		expect(port.data.appointments.length).toBe(before + 1);
		expect(port.data.appointments.at(-1)).toMatchObject({
			clientId: "c1",
			date: "2026-11-20",
			startMin: 600,
		});
	});

	it("the whole copy can be undone with one press", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const done = await confirmProposal(
			session,
			proposalIdOf(
				await call(session, "copyWeek", { fromDate: "2026-11-13", toDate: "2026-11-20" }),
			),
		);
		const created = port.data.appointments.filter(
			(a) => a.date >= "2026-11-16" && a.id.startsWith("a") && Number(a.id.slice(1)) > 3,
		);
		expect(created.length).toBeGreaterThan(0);
		await confirmProposal(session, done.card.undo?.proposalId ?? "");
		expect(created.every((c) => port.appointmentOf(c.id).status === "cancelled")).toBe(true);
	});

	it("refuses the same week, and says none when nothing can be copied", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(
			await call(session, "copyWeek", { fromDate: "2026-11-13", toDate: "2026-11-15" }),
		).toMatchObject({ reason: "invalid" });
		expect(
			await call(session, "copyWeek", { fromDate: "2026-12-01", toDate: "2026-12-08" }),
		).toMatchObject({ status: "none" });
	});

	it("is blocked without the create permission and writes nothing", async () => {
		const port = new FakeStaffPort();
		port.denied.add("appointments.create");
		const session = await sessionFor(port);
		expect(
			await call(session, "copyWeek", { fromDate: "2026-11-13", toDate: "2026-11-20" }),
		).toMatchObject({ reason: "not_allowed" });
		expect(port.writes()).toEqual([]);
	});
});

describe("absence", () => {
	function covered(): FakeStaffPort {
		const port = new FakeStaffPort();
		port.data.roster.push({
			personId: "p2",
			date: "2026-11-14",
			kind: "work",
			fromMin: 540,
			toMin: 1020,
		});
		return port;
	}

	it("one proposal: leave, a colleague takes the appointment, the client is told", async () => {
		const port = covered();
		const session = await sessionFor(port);
		const out = await call(session, "absence", {
			person: "Ana",
			date: "2026-11-14",
			kind: "medical",
		});
		expect(out.status).toBe("needs_confirmation");
		expect(lineValues(session)).toContain("Maria Test → Dan Ionescu");
		expect(port.writes()).toEqual([]);
		const done = await confirmProposal(session, proposalIdOf(out));
		expect(done.status).toBe("done");
		expect(port.data.leaves).toEqual([
			{ personId: "p1", from: "2026-11-14", to: "2026-11-14", kind: "medical" },
		]);
		expect(port.appointmentOf("a3").resourceIds).toEqual(["p2", "r1"]);
		expect(port.data.sent).toHaveLength(1);
		expect(port.data.sent[0]?.text).toContain("another therapist (Dan Ionescu)");
		expect(done.card.lines.map((l) => l.value).join(" ")).toContain("3 of 3 steps done");
		// Undo restores the therapist.
		await confirmProposal(session, done.card.undo?.proposalId ?? "");
		expect(port.appointmentOf("a3").resourceIds).toEqual(["p1", "r1"]);
	});

	it("when no colleague works or is free, the appointment is listed for rescheduling", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "absence", { person: "p1", date: "2026-11-14" });
		expect(out.status).toBe("needs_confirmation");
		expect(lineValues(session)).toContain("To reschedule=");
		const done = await confirmProposal(session, proposalIdOf(out));
		expect(done.status).toBe("done");
		expect(port.data.sent[0]?.text).toContain("cannot make the session");
	});

	it("does not give two overlapping appointments to the same colleague", async () => {
		const port = covered();
		port.data.appointments.push({
			...port.appointmentOf("a3"),
			id: "a7",
			clientId: "c2",
			clientName: "Ion Exemplu",
			startMin: 620,
			resourceIds: ["p1", "r2"],
		});
		const session = await sessionFor(port);
		await call(session, "absence", { person: "p1", date: "2026-11-14", notify: false });
		const text = lineValues(session);
		expect(text).toContain("Maria Test → Dan Ionescu");
		expect(text).toContain("To reschedule=");
	});

	it("without notices, and ambiguous or unknown person, or a room", async () => {
		const port = covered();
		const session = await sessionFor(port);
		await call(session, "absence", { person: "Ana", date: "2026-11-14", notify: false });
		expect(lineValues(session)).not.toContain("Messages");
		expect(await call(session, "absence", { person: "zzz", date: "2026-11-14" })).toMatchObject({
			status: "none",
		});
		expect(await call(session, "absence", { person: "o", date: "2026-11-14" })).toMatchObject({
			status: "ambiguous",
		});
		expect(
			await call(session, "absence", { person: "Cabinet Terapie", date: "2026-11-14" }),
		).toMatchObject({ reason: "invalid" });
	});

	it("needs every permission it uses", async () => {
		for (const action of ["leave.request", "appointments.move", "reminders.send"]) {
			const port = covered();
			port.denied.add(action);
			const out = await call(await sessionFor(port), "absence", {
				person: "Ana",
				date: "2026-11-14",
			});
			expect(out, action).toMatchObject({ reason: "not_allowed" });
			expect(port.writes()).toEqual([]);
		}
	});

	it("stops at the first refusal and says how far it got", async () => {
		const port = covered();
		const session = await sessionFor(port);
		const out = await call(session, "absence", { person: "Ana", date: "2026-11-14" });
		port.denied.add("moveAppointment");
		const done = await confirmProposal(session, proposalIdOf(out));
		expect(done.status).toBe("forbidden");
		expect(done.card.lines.map((l) => l.value).join(" ")).toContain("1 of 3 steps done");
		expect(port.data.sent).toEqual([]);
	});
});

describe("the briefing", () => {
	it("gathers the day without a model, with a one-tap follow-up per item", async () => {
		const port = new FakeStaffPort();
		port.data.appointments.push({ ...port.appointmentOf("a3"), id: "t1", status: "requested" });
		const card = await buildBriefing(await sessionFor(port));
		expect(card.kind).toBe("briefing");
		const text = JSON.stringify(card);
		expect(text).toContain("2 appointments today, the first at 10:00");
		expect(text).toContain("1 clients owe a balance");
		expect(text).toContain("1 new website requests");
		expect(text).toContain("1 unconfirmed appointments tomorrow");
		expect(text).toContain("Away today: Dan Ionescu");
		expect(
			card.kind === "briefing" &&
				card.sections.every((s) => s.items.every((i) => i.ask !== undefined)),
		).toBe(true);
	});

	it("leaves out what the person may not read", async () => {
		const port = new FakeStaffPort();
		port.denied.add("webRequests");
		port.denied.add("attention");
		const card = await buildBriefing(await sessionFor(port));
		expect(JSON.stringify(card)).not.toContain("website requests");
		expect(JSON.stringify(card)).not.toContain("owe a balance");
	});

	it("says all clear when there is nothing, and finds double bookings", async () => {
		const port = new FakeStaffPort();
		for (const m of ["agenda", "webRequests", "roster", "attention", "resources"])
			port.denied.add(m);
		const card = await buildBriefing(await sessionFor(port));
		expect(card).toMatchObject({
			kind: "briefing",
			sections: [],
			clear: "Everything is in order.",
		});
		const a = port.appointmentOf("a1");
		expect(overlaps([a, { ...a, id: "z", startMin: 620 }])).toBe(1);
		expect(overlaps([a, { ...a, id: "z", startMin: 700 }])).toBe(0);
		expect(overlaps([a, { ...a, id: "z", startMin: 620, status: "cancelled" }])).toBe(0);
	});
});
