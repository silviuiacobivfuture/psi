import { describe, expect, it } from "vitest";
import { confirmProposal, dismissProposal } from "../execute";
import { createMemoryProposalStore, PROPOSAL_TTL_MS } from "../proposals";
import { FAKE_NOW, FakeStaffPort } from "../testing";
import { call, proposalIdOf, sessionFor } from "./helpers";

const OPEN = { screen: "appointment", appointmentId: "a1" } as const;

async function setup(extra: { now?: () => number } = {}) {
	const port = new FakeStaffPort();
	const proposals = createMemoryProposalStore();
	const session = await sessionFor(port, { proposals, page: OPEN, ...extra });
	return { port, proposals, session };
}

describe("confirming a proposal", () => {
	it("moves an appointment once, with the stored arguments, and audits start and end", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(
			await call(session, "moveAppointment", { date: "2026-11-16", time: "11:00" }),
		);
		expect(port.writes()).toEqual([]);
		const outcome = await confirmProposal(session, id);
		expect(outcome.status).toBe("done");
		expect(outcome.card).toMatchObject({ kind: "result", ok: true, proposalId: id });
		expect(port.callsTo("moveAppointment")).toHaveLength(1);
		expect(port.appointmentOf("a1")).toMatchObject({ date: "2026-11-16", startMin: 660 });
		const phases = port.audits.filter((a) => a.proposalId === id).map((a) => a.phase);
		expect(phases).toEqual(["propose", "execute_start", "execute"]);
		expect(port.audits.at(-1)).toMatchObject({ outcome: "ok", subjects: ["a1"] });
	});

	it("creates, cancels, marks attendance, records a payment, requests leave, handles a request", async () => {
		const { port, session } = await setup();
		const run = async (tool: Parameters<typeof call>[1], input: Record<string, unknown>) =>
			(await confirmProposal(session, proposalIdOf(await call(session, tool, input)))).status;
		expect(
			await run("createAppointment", {
				clientId: "c2",
				service: "s1",
				date: "2026-11-16",
				time: "10:00",
				resources: ["p1", "r1"],
			}),
		).toBe("done");
		expect(port.data.appointments.at(-1)).toMatchObject({
			clientId: "c2",
			date: "2026-11-16",
			startMin: 600,
			durationMin: 50,
		});
		expect(await run("markAttendance", { appointmentId: "a1", status: "no-show" })).toBe("done");
		expect(port.appointmentOf("a1").status).toBe("no-show");
		expect(await run("cancelAppointment", { appointmentId: "a2" })).toBe("done");
		expect(port.appointmentOf("a2").status).toBe("cancelled");
		expect(await run("recordPayment", { clientId: "c1", amount: 100, method: "card" })).toBe(
			"done",
		);
		expect(port.data.payments).toEqual([{ packageId: "k1", amountBani: 10000, method: "card" }]);
		expect(port.packageOf("k1").paidBani).toBe(50000);
		expect(await run("requestLeave", { from: "2026-12-01", to: "2026-12-02", kind: "leave" })).toBe(
			"done",
		);
		expect(port.data.leaves).toEqual([
			{ personId: "p1", from: "2026-12-01", to: "2026-12-02", kind: "leave" },
		]);
		expect(await run("markRequestHandled", { requestId: "w1" })).toBe("done");
		expect(port.requestOf("w1").handled).toBe(true);
	});

	it("sends reminders by e-mail and hands back a WhatsApp link only for wa.me", async () => {
		const { port, session } = await setup();
		const email = await confirmProposal(
			session,
			proposalIdOf(
				await call(session, "sendReminders", {
					date: "2026-11-14",
					appointmentIds: ["a3"],
					channel: "email",
				}),
			),
		);
		expect(email.status).toBe("done");
		expect(email.card.links).toEqual([]);
		const wa = await confirmProposal(
			session,
			proposalIdOf(
				await call(session, "sendReminders", {
					date: "2026-11-14",
					appointmentIds: ["a3"],
					channel: "whatsapp",
				}),
			),
		);
		expect(wa.card.links[0]?.href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
		expect(port.data.sent.map((s) => s.channel)).toEqual(["email", "whatsapp"]);
	});

	it("a double press runs once; the second is already_done", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		const both = await Promise.all([confirmProposal(session, id), confirmProposal(session, id)]);
		expect(both.map((o) => o.status).sort()).toEqual(["already_done", "done"]);
		expect(port.callsTo("cancelAppointment")).toHaveLength(1);
	});

	it("a later press after success is already_done too", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		await confirmProposal(session, id);
		expect((await confirmProposal(session, id)).status).toBe("already_done");
		expect(port.callsTo("cancelAppointment")).toHaveLength(1);
	});

	it("refuses a stale proposal: the appointment changed after it was prepared", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(
			await call(session, "moveAppointment", { date: "2026-11-16", time: "11:00" }),
		);
		port.data.appointments[0] = { ...port.appointmentOf("a1"), version: "someone-else" };
		const outcome = await confirmProposal(session, id);
		expect(outcome.status).toBe("stale");
		expect(outcome.card.ok).toBe(false);
		expect(port.writes()).toEqual([]);
		expect(port.audits.at(-1)).toMatchObject({ phase: "refused", reason: "stale" });
	});

	it("refuses when the chosen time got taken meanwhile (create and move)", async () => {
		const { port, session } = await setup();
		const create = proposalIdOf(
			await call(session, "createAppointment", {
				clientId: "c2",
				service: "s1",
				date: "2026-11-16",
				time: "10:00",
				resources: ["p1"],
			}),
		);
		const move = proposalIdOf(
			await call(session, "moveAppointment", { date: "2026-11-17", time: "10:00" }),
		);
		port.data.appointments.push(
			{ ...port.appointmentOf("a3"), id: "a9", date: "2026-11-16", resourceIds: ["p1"] },
			{ ...port.appointmentOf("a3"), id: "a8", date: "2026-11-17", resourceIds: ["p1", "r1"] },
		);
		expect((await confirmProposal(session, create)).status).toBe("stale");
		expect((await confirmProposal(session, move)).status).toBe("stale");
		expect(port.writes()).toEqual([]);
	});

	it("refuses a stale payment (the balance moved) and a request someone else handled", async () => {
		const { port, session } = await setup();
		const pay = proposalIdOf(
			await call(session, "recordPayment", { clientId: "c1", amount: 10, method: "cash" }),
		);
		const handle = proposalIdOf(await call(session, "markRequestHandled", { requestId: "w1" }));
		port.data.packages[0] = { ...port.packageOf("k1"), version: "kv-other" };
		port.data.requests[0] = { ...port.requestOf("w1"), handled: true, version: "wv-other" };
		expect((await confirmProposal(session, pay)).status).toBe("stale");
		expect((await confirmProposal(session, handle)).status).toBe("stale");
		expect(port.writes()).toEqual([]);
	});

	it("refuses an expired proposal at the boundary and accepts it just before", async () => {
		let now = FAKE_NOW;
		const { port, session } = await setup({ now: () => now });
		const early = proposalIdOf(await call(session, "cancelAppointment", { appointmentId: "a1" }));
		const late = proposalIdOf(await call(session, "cancelAppointment", { appointmentId: "a2" }));
		now = FAKE_NOW + PROPOSAL_TTL_MS - 1;
		expect((await confirmProposal(session, early)).status).toBe("done");
		now = FAKE_NOW + PROPOSAL_TTL_MS;
		expect((await confirmProposal(session, late)).status).toBe("expired");
		expect(port.callsTo("cancelAppointment")).toHaveLength(1);
	});

	it("refuses an unknown or malformed id", async () => {
		const { port, session } = await setup();
		for (const id of [`prop_${"0".repeat(32)}`, "", "../etc", "x".repeat(500)]) {
			expect((await confirmProposal(session, id)).status).toBe("unknown");
		}
		expect(port.writes()).toEqual([]);
	});

	it("another person cannot confirm it, even in the same app", async () => {
		const { port, proposals, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		const other = new FakeStaffPort();
		other.signIn({ sub: "sub-dan", name: "Dan" });
		const intruder = await sessionFor(other, { proposals });
		expect((await confirmProposal(intruder, id)).status).toBe("unknown");
		expect(other.writes()).toEqual([]);
		expect(port.writes()).toEqual([]);
		expect((await confirmProposal(session, id)).status).toBe("done");
	});

	it("the same person in another app cannot confirm it", async () => {
		const { proposals, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		const hemi = new FakeStaffPort();
		hemi.signIn({ appId: "hemisync", appName: "Hemi-Sync" });
		const other = await sessionFor(hemi, { proposals });
		expect((await confirmProposal(other, id)).status).toBe("unknown");
		expect(hemi.writes()).toEqual([]);
	});

	it("refuses when the person is no longer signed in, or is someone else now", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment", { appointmentId: "a1" }));
		const other = proposalIdOf(await call(session, "cancelAppointment", { appointmentId: "a2" }));
		port.principal = null;
		expect((await confirmProposal(session, id)).status).toBe("no_principal");
		port.signIn({ sub: "sub-someone-else" });
		expect((await confirmProposal(session, other)).status).toBe("no_principal");
		expect(port.writes()).toEqual([]);
	});

	it("does nothing when the audit entry cannot be recorded", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		port.failAudit = true;
		expect((await confirmProposal(session, id)).status).toBe("audit_failed");
		expect(port.writes()).toEqual([]);
		port.failAudit = false;
		expect((await confirmProposal(session, id)).status).toBe("already_done");
	});

	it("shows the service's own refusal and does not retry", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		port.denied.add("cancelAppointment");
		const outcome = await confirmProposal(session, id);
		expect(outcome.status).toBe("forbidden");
		expect(outcome.card.ok).toBe(false);
		expect(port.callsTo("cancelAppointment")).toHaveLength(1);
		expect(port.audits.at(-1)).toMatchObject({
			phase: "execute",
			outcome: "refused",
			reason: "forbidden",
		});
		expect((await confirmProposal(session, id)).status).toBe("already_done");
	});

	it("an unreachable service is reported, and nothing is claimed done", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		port.down.add("cancelAppointment");
		expect((await confirmProposal(session, id)).status).toBe("unavailable");
	});

	it("a dismissed proposal can never be confirmed; only its owner can dismiss it", async () => {
		const { port, proposals, session } = await setup();
		const id = proposalIdOf(await call(session, "cancelAppointment"));
		const other = new FakeStaffPort();
		other.signIn({ sub: "sub-dan" });
		const intruder = await sessionFor(other, { proposals });
		expect(await dismissProposal(intruder, id)).toBe(false);
		expect(await dismissProposal(session, id)).toBe(true);
		expect(await dismissProposal(session, id)).toBe(false);
		expect((await confirmProposal(session, id)).status).toBe("already_done");
		expect(port.writes()).toEqual([]);
	});

	it("each confirmed proposal is audited under its own id, and the audit holds no names or text", async () => {
		const { port, session } = await setup();
		await confirmProposal(session, proposalIdOf(await call(session, "cancelAppointment")));
		const json = JSON.stringify(port.audits);
		expect(json).not.toContain("Maria");
		expect(json).not.toContain("record-data");
	});
});

describe("undo", () => {
	it("a move comes back with an undo that restores where it was, once", async () => {
		const { port, session } = await setup();
		const id = proposalIdOf(
			await call(session, "moveAppointment", { date: "2026-11-16", time: "11:00" }),
		);
		const outcome = await confirmProposal(session, id);
		const undo = outcome.card.undo;
		expect(undo?.label).toBeTruthy();
		const back = await confirmProposal(session, undo?.proposalId ?? "");
		expect(back.status).toBe("done");
		expect(port.appointmentOf("a1")).toMatchObject({ date: "2026-11-13", startMin: 600 });
		expect((await confirmProposal(session, undo?.proposalId ?? "")).status).toBe("already_done");
	});

	it("a created appointment can be undone by cancelling it", async () => {
		const { port, session } = await setup();
		const outcome = await confirmProposal(
			session,
			proposalIdOf(
				await call(session, "createAppointment", {
					clientId: "c2",
					service: "s1",
					date: "2026-11-16",
					time: "10:00",
					resources: ["p1"],
				}),
			),
		);
		await confirmProposal(session, outcome.card.undo?.proposalId ?? "");
		expect(port.data.appointments.at(-1)?.status).toBe("cancelled");
	});

	it("an undo is stale when the thing changed since, and is the person's alone", async () => {
		const { port, proposals, session } = await setup();
		const outcome = await confirmProposal(
			session,
			proposalIdOf(await call(session, "moveAppointment", { date: "2026-11-16", time: "11:00" })),
		);
		const undoId = outcome.card.undo?.proposalId ?? "";
		const other = new FakeStaffPort();
		other.signIn({ sub: "sub-dan" });
		expect((await confirmProposal(await sessionFor(other, { proposals }), undoId)).status).toBe(
			"unknown",
		);
		port.data.appointments[0] = { ...port.appointmentOf("a1"), version: "changed" };
		expect((await confirmProposal(session, undoId)).status).toBe("stale");
	});

	it("what cannot be reversed offers no undo", async () => {
		const { session } = await setup();
		const cancel = await confirmProposal(
			session,
			proposalIdOf(await call(session, "cancelAppointment")),
		);
		const refused = await confirmProposal(session, `prop_${"1".repeat(32)}`);
		expect(cancel.card.undo).toBeUndefined();
		expect(refused.card.undo).toBeUndefined();
	});
});
