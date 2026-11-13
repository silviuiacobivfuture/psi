import { describe, expect, it } from "vitest";
import { FakeStaffPort } from "../testing";
import { call, proposalIdOf, sessionFor } from "./helpers";

const OPEN = { screen: "appointment", appointmentId: "a1" } as const;

describe("write tools only propose", () => {
	it("createAppointment: a card and a stored proposal, and nothing written", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "createAppointment", {
			clientId: "c2",
			service: "Evaluare",
			date: "2026-11-16",
			time: "10:00",
			resources: ["Ana Pop", "Cabinet Terapie"],
		});
		expect(out.status).toBe("needs_confirmation");
		expect(session.cards.at(-1)).toMatchObject({ kind: "proposal", destructive: false });
		expect(port.writes()).toEqual([]);
		expect(String(out.summary)).toContain("<record-data>Ion Exemplu</record-data>");
	});

	it("createAppointment: a taken slot is a conflict and no proposal exists", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "createAppointment", {
			clientId: "c2",
			service: "s1",
			date: "2026-11-13",
			time: "10:00",
			resources: ["p1"],
		});
		expect(out).toMatchObject({ status: "refused", reason: "conflict" });
		expect(session.cards).toEqual([]);
	});

	it("createAppointment: unknown or ambiguous service, person or client", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const base = { clientId: "c2", date: "2026-11-16", time: "10:00", resources: ["p1"] };
		expect(await call(session, "createAppointment", { ...base, service: "zzz" })).toMatchObject({
			status: "none",
		});
		expect(await call(session, "createAppointment", { ...base, service: "e" })).toMatchObject({
			status: "ambiguous",
		});
		expect(
			await call(session, "createAppointment", { ...base, service: "s1", resources: ["zzz"] }),
		).toMatchObject({ status: "none" });
		expect(
			await call(session, "createAppointment", { ...base, service: "s1", resources: ["a"] }),
		).toMatchObject({ status: "ambiguous" });
		expect(
			await call(session, "createAppointment", { ...base, service: "s1", clientId: "nobody" }),
		).toMatchObject({ status: "missing", missing: ["client_not_found"] });
		expect(session.cards.filter((c) => c.kind === "proposal")).toEqual([]);
	});

	it("an ambiguous answer also shows tappable choices", async () => {
		const session = await sessionFor(new FakeStaffPort());
		await call(session, "createAppointment", {
			clientId: "c2",
			service: "s1",
			date: "2026-11-16",
			time: "10:00",
			resources: ["a"],
		});
		const choices = session.cards.find((c) => c.kind === "choices");
		expect(choices?.kind === "choices" && choices.options.length).toBeGreaterThan(1);
		expect(
			choices?.kind === "choices" && choices.options.every((o) => /\[\w+\]$/.test(o.ask)),
		).toBe(true);
	});

	it("createAppointment: refused input shapes (time, date, no resource)", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const ok = {
			clientId: "c2",
			service: "s1",
			date: "2026-11-16",
			time: "10:00",
			resources: ["p1"],
		};
		await expect(call(session, "createAppointment", { ...ok, time: "25:00" })).rejects.toThrow();
		await expect(
			call(session, "createAppointment", { ...ok, date: "16/11/2026" }),
		).rejects.toThrow();
		await expect(call(session, "createAppointment", { ...ok, resources: [] })).rejects.toThrow();
	});

	it("without the permission the person gets not_allowed, no proposal, and the tool is blocked for the turn", async () => {
		const port = new FakeStaffPort();
		port.denied.add("appointments.create");
		const session = await sessionFor(port);
		const input = {
			clientId: "c2",
			service: "s1",
			date: "2026-11-16",
			time: "10:00",
			resources: ["p1"],
		};
		expect(await call(session, "createAppointment", input)).toMatchObject({
			status: "refused",
			reason: "not_allowed",
		});
		expect(await call(session, "createAppointment", input)).toMatchObject({
			status: "refused",
			reason: "repeat",
		});
		expect(port.callsTo("can")).toHaveLength(1);
		expect(session.cards).toEqual([]);
	});

	it("moveAppointment: keeps the duration, defaults to the open appointment, checks the new place", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port, { page: OPEN });
		const out = await call(session, "moveAppointment", { date: "2026-11-16", time: "11:00" });
		expect(out.status).toBe("needs_confirmation");
		expect(port.writes()).toEqual([]);
		// Taken: Dan's 11:00 on the 13th uses p2 and d1.
		const clash = await call(session, "moveAppointment", {
			appointmentId: "a1",
			date: "2026-11-13",
			time: "11:00",
			resources: ["p2"],
		});
		expect(clash).toMatchObject({ reason: "conflict" });
		expect(
			await call(await sessionFor(port), "moveAppointment", { date: "2026-11-16", time: "11:00" }),
		).toMatchObject({ reason: "invalid" });
		expect(
			await call(session, "moveAppointment", {
				appointmentId: "nope",
				date: "2026-11-16",
				time: "11:00",
			}),
		).toMatchObject({ reason: "not_found" });
	});

	it("moving onto itself is allowed (the appointment's own slot is ignored)", async () => {
		const out = await call(
			await sessionFor(new FakeStaffPort(), { page: OPEN }),
			"moveAppointment",
			{ date: "2026-11-13", time: "10:15" },
		);
		expect(out.status).toBe("needs_confirmation");
	});

	it("cancelAppointment: destructive card; already cancelled is a conflict", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port, { page: OPEN });
		expect((await call(session, "cancelAppointment")).status).toBe("needs_confirmation");
		expect(session.cards.at(-1)).toMatchObject({ kind: "proposal", destructive: true });
		port.data.appointments[1] = { ...port.appointmentOf("a2"), status: "cancelled" };
		expect(await call(session, "cancelAppointment", { appointmentId: "a2" })).toMatchObject({
			reason: "conflict",
		});
		expect(port.writes()).toEqual([]);
	});

	it("markAttendance: attended and no-show, never for a cancelled one", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port, { page: OPEN });
		expect((await call(session, "markAttendance", { status: "attended" })).status).toBe(
			"needs_confirmation",
		);
		expect((await call(session, "markAttendance", { status: "no-show" })).status).toBe(
			"needs_confirmation",
		);
		await expect(call(session, "markAttendance", { status: "confirmed" })).rejects.toThrow();
		port.data.appointments[0] = { ...port.appointmentOf("a1"), status: "cancelled" };
		expect(await call(session, "markAttendance", { status: "attended" })).toMatchObject({
			reason: "conflict",
		});
	});

	it("recordPayment: picks the only package with a balance, in bani, and refuses overpaying", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const ok = await call(session, "recordPayment", {
			clientId: "c1",
			amount: 100.5,
			method: "cash",
		});
		expect(ok.status).toBe("needs_confirmation");
		expect(
			await call(session, "recordPayment", { clientId: "c1", amount: 700, method: "card" }),
		).toMatchObject({ reason: "invalid" });
		expect(
			await call(session, "recordPayment", { clientId: "c1", amount: 10.001, method: "card" }),
		).toMatchObject({ reason: "invalid" });
		await expect(
			call(session, "recordPayment", { clientId: "c1", amount: -5, method: "cash" }),
		).rejects.toThrow();
		await expect(
			call(session, "recordPayment", { clientId: "c1", amount: 5, method: "bitcoin" }),
		).rejects.toThrow();
		expect(port.writes()).toEqual([]);
	});

	it("recordPayment: no package, several packages, a named package, no client", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect(
			await call(session, "recordPayment", { clientId: "c2", amount: 10, method: "cash" }),
		).toMatchObject({ status: "none" });
		port.data.packages.push({
			...port.packageOf("k1"),
			id: "k2",
			name: "5 sessions",
			version: "kv9",
		});
		expect(
			await call(session, "recordPayment", { clientId: "c1", amount: 10, method: "cash" }),
		).toMatchObject({ status: "ambiguous" });
		expect(
			(
				await call(session, "recordPayment", {
					clientId: "c1",
					packageId: "k2",
					amount: 10,
					method: "cash",
				})
			).status,
		).toBe("needs_confirmation");
		expect(await call(session, "recordPayment", { amount: 10, method: "cash" })).toMatchObject({
			reason: "invalid",
		});
	});

	it("requestLeave: for the person themselves by default, for another when named, never backwards", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(
			(await call(session, "requestLeave", { from: "2026-12-01", to: "2026-12-05", kind: "leave" }))
				.status,
		).toBe("needs_confirmation");
		expect(
			(
				await call(session, "requestLeave", {
					personId: "p2",
					from: "2026-12-01",
					to: "2026-12-01",
					kind: "medical",
				})
			).status,
		).toBe("needs_confirmation");
		expect(
			await call(session, "requestLeave", { from: "2026-12-05", to: "2026-12-01", kind: "leave" }),
		).toMatchObject({ reason: "invalid" });
	});

	it("requestLeave: a person without a roster entry cannot request for themselves", async () => {
		const port = new FakeStaffPort();
		port.signIn({ personId: undefined });
		expect(
			await call(await sessionFor(port), "requestLeave", {
				from: "2026-12-01",
				to: "2026-12-02",
				kind: "leave",
			}),
		).toMatchObject({ reason: "invalid" });
	});

	it("markRequestHandled: open, already handled, unknown", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect((await call(session, "markRequestHandled", { requestId: "w1" })).status).toBe(
			"needs_confirmation",
		);
		port.data.requests[0] = { ...port.requestOf("w1"), handled: true };
		expect(await call(session, "markRequestHandled", { requestId: "w1" })).toMatchObject({
			reason: "conflict",
		});
		expect(await call(session, "markRequestHandled", { requestId: "zzz" })).toMatchObject({
			reason: "not_found",
		});
	});

	it("sendReminders: uses the clinic's template, only for reachable people, one proposal for all", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "sendReminders", {
			date: "2026-11-14",
			appointmentIds: ["a3"],
			channel: "email",
		});
		expect(out.status).toBe("needs_confirmation");
		const card = session.cards.at(-1);
		expect(card?.kind === "proposal" && card.lines.map((l) => l.value).join("|")).toContain(
			"Hello Maria Test",
		);
		port.data.reminders[0] = { ...port.reminderOf("a3"), email: null };
		expect(
			await call(session, "sendReminders", {
				date: "2026-11-14",
				appointmentIds: ["a3"],
				channel: "email",
			}),
		).toMatchObject({ status: "none" });
		expect(
			(
				await call(session, "sendReminders", {
					date: "2026-11-14",
					appointmentIds: ["a3"],
					channel: "whatsapp",
				})
			).status,
		).toBe("needs_confirmation");
		expect(
			await call(session, "sendReminders", {
				date: "2026-11-14",
				appointmentIds: ["zzz"],
				channel: "whatsapp",
			}),
		).toMatchObject({ status: "none" });
		expect(port.writes()).toEqual([]);
	});

	it("every proposal gets its own unguessable id", async () => {
		const session = await sessionFor(new FakeStaffPort(), { page: OPEN });
		const a = proposalIdOf(await call(session, "cancelAppointment"));
		const b = proposalIdOf(await call(session, "cancelAppointment", { appointmentId: "a2" }));
		expect(a).toMatch(/^prop_[0-9a-f]{32}$/);
		expect(a).not.toBe(b);
	});
});
