import { accountHashOf } from "@psi/scheduling";
import { OwnAppointment, ROUTES } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asSite, bookAs, freeSlots, mineOf } from "./testing/booking";
import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(factories)("a visitor's own appointments, on the $name store", (factory) => {
	let w: Populated;
	let n = 0;
	/** A fresh visitor, so no case sees another's requests. */
	const visitor = (): string => `own-visitor-${++n}`;
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const move = (subject: string | undefined, id: string, body: unknown) =>
		asSite(w, "POST", `/me/appointments/${id}/reschedule`, body, subject);
	/** A free onsite time later than `after` that is not `not`. */
	/** A free onsite time of the same person, later on, that is not `not`: what the site offers for a move. */
	const laterSlot = async (not: number, practitioner?: string) =>
		(await freeSlots(w, NOW + 3 * 24 * HOUR, 60)).find(
			(s) => s.start !== not && s.modes.includes("onsite") && s.practitioner === practitioner,
		);

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	it("lists the visitor's own with the practitioner, until when it may change online, and whether it still may", async () => {
		const who = visitor();
		await bookAs(w, who, 8);
		const items = (await asSite(w, "GET", "/me/appointments", undefined, who)).json
			.items as unknown[];
		expect(items).toHaveLength(1);
		const row = OwnAppointment.parse(items[0]);
		expect(row.practitionerName).toMatch(/Test$/);
		expect(row.changeUntil).toBeLessThan(row.start);
		expect(row.canChange).toBe(true);
		expect(row.status).toBe("requested");
	});

	it("a booking at the edge of the notice can no longer change online: cancel and move are refused, nothing written", async () => {
		const who = visitor();
		await bookAs(w, who, 0);
		const [row] = await mineOf(w, who);
		expect(row?.canChange).toBe(false);
		const r = await refused(
			() => asSite(w, "POST", `/me/appointments/${row?.id}/cancel`, undefined, who),
			403,
			"not_allowed",
		);
		expect(err(r).detail).toEqual({ reason: "too_late" });
		const target = await laterSlot(row?.start ?? 0, row?.practitioner);
		await refused(
			() => move(who, row?.id ?? "", { start: target?.start, mode: "onsite" }),
			403,
			"not_allowed",
		);
	});

	it("moves to another free time: a new reference, the old one cancelled, journalled and told to the team and the account", async () => {
		const who = visitor();
		await bookAs(w, who, 9);
		const [before] = await mineOf(w, who);
		const target = await laterSlot(before?.start ?? 0, before?.practitioner);
		if (before === undefined || target === undefined) throw new Error("fixture");
		const sentBefore = w.notifier.sent.length;
		const reply = await move(who, before.id, { start: target.start, mode: "onsite" });
		expect(reply.status, JSON.stringify(reply.json)).toBe(200);
		expect(reply.json.start).toBe(target.start);
		expect(reply.json.reference).not.toBe(before.reference);
		const after = await mineOf(w, who);
		expect(after.find((r) => r.reference === before.reference)?.status).toBe("cancelled");
		expect(after.find((r) => r.reference === reply.json.reference)).toMatchObject({
			start: target.start,
			status: before.status,
		});
		const told = w.notifier.sent.slice(sentBefore);
		expect(told).toHaveLength(1);
		expect(told[0]).toMatchObject({
			event: "appointment.moved",
			payload: {
				reference: reply.json.reference,
				previousStart: before.start,
				account: accountHashOf(who),
			},
		});
		const trail = (await w.call("olga", "GET", `${A}/audit?action=visitor.reschedule`)).json
			.items as { target: { id: string }; detail?: Record<string, unknown> }[];
		expect(trail.find((e) => e.target.id === reply.json.reference)?.detail).toEqual({
			from: before.reference,
		});
	});

	it("a time that is taken, or not offered at all, is refused and the booking stays where it was", async () => {
		const who = visitor();
		await bookAs(w, who, 10);
		const [row] = await mineOf(w, who);
		if (row === undefined) throw new Error("fixture");
		const other = visitor();
		const taken = await laterSlot(row.start, row.practitioner);
		if (taken === undefined) throw new Error("fixture");
		const theirs = await bookAs(w, other, taken);
		expect(theirs.reference).toBeTruthy();
		await refused(
			() => move(who, row.id, { start: taken.start, mode: "onsite" }),
			409,
			"slot_taken",
		);
		await refused(() => move(who, row.id, { start: row.start + 7 * 60_000, mode: "onsite" }), 409);
		expect((await mineOf(w, who)).find((r) => r.id === row.id)?.start).toBe(row.start);
	});

	it("someone else's booking is not found, a cancelled one cannot move, and a malformed time is invalid", async () => {
		const who = visitor();
		await bookAs(w, who, 11);
		const [row] = await mineOf(w, who);
		if (row === undefined) throw new Error("fixture");
		const target = await laterSlot(row.start, row.practitioner);
		await refused(
			() => move(visitor(), row.id, { start: target?.start, mode: "onsite" }),
			404,
			"not_found",
		);
		await refused(() => move(who, row.id, { start: "soon", mode: "onsite" }), 400, "invalid");
		await refused(
			() => move(who, row.id, { start: target?.start, mode: "teleport" }),
			400,
			"invalid",
		);
		await refused(() => move(who, row.id, {}), 400, "invalid");
		await refused(
			() => move(undefined, row.id, { start: target?.start, mode: "onsite" }),
			400,
			"invalid",
		);
		expect(
			(await asSite(w, "POST", `/me/appointments/${row.id}/cancel`, undefined, who)).status,
		).toBe(200);
		await refused(
			() => move(who, row.id, { start: target?.start, mode: "onsite" }),
			403,
			"not_allowed",
		);
	});

	it("is a visitor route of the contract, audited as visitor.reschedule", () => {
		expect(ROUTES.find((r) => r.id === "visitor.mineReschedule")).toMatchObject({
			method: "POST",
			path: "/v1/apps/:app/me/appointments/:id/reschedule",
			side: "visitor",
			audit: "visitor.reschedule",
		});
	});
});
