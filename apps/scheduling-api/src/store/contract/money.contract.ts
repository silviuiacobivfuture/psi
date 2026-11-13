import { beforeAll, describe, expect, it } from "vitest";
import type { ReminderRow } from "../types";
import type { ContractSection } from "./env";
import { BASE, draft, HOUR, pay, pkg, useWorld, type World } from "./visits.world";

/** Reminders, packages and payments as the handlers use them (a payment against an appointment moves its money). */
export const moneyContract: ContractSection = (env) => {
	const h = useWorld(env);
	let w: World;
	beforeAll(() => {
		w = h.world();
	});
	const { c, next, refused } = h;
	describe("reminders", () => {
		const reminder = (id: string, state: ReminderRow["state"]): ReminderRow => ({
			id,
			app: w.app,
			state,
			updatedAt: Date.now(),
		});
		it("an appointment nobody marked has no reminder row", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			expect(await c().reminders.get(w.app, a.id)).toBeUndefined();
			expect((await c().reminders.list(w.app)).map((r) => r.id)).not.toContain(a.id);
		});
		it("marked sent, then confirmed, then taken back", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			await c().reminders.insert(reminder(a.id, "sent"));
			expect((await c().reminders.get(w.app, a.id))?.state).toBe("sent");
			expect((await c().reminders.list(w.app)).filter((r) => r.id === a.id)).toHaveLength(1);
			expect(await c().reminders.replace(reminder(a.id, "confirmed"))).toBe(true);
			expect((await c().reminders.get(w.app, a.id))?.state).toBe("confirmed");
			expect(
				(await c().reminders.list(w.app, { eq: { state: "sent" } })).map((r) => r.id),
			).not.toContain(a.id);
			expect(await c().reminders.remove(w.app, a.id)).toBe(true);
			expect(await c().reminders.get(w.app, a.id)).toBeUndefined();
			expect(await c().reminders.remove(w.app, a.id)).toBe(false);
		});
		it("a reminder for an appointment that is not there is refused", async () => {
			await refused("not_found", () =>
				c().reminders.insert(reminder("nosuchappointment0000000000", "sent")),
			);
		});
	});

	describe("packages", () => {
		it("a package is stored with its offer and read back", async () => {
			const saved = await c().packages.insert(pkg(w, w.c1, { discountCents: 10_000 }));
			expect(saved).toMatchObject({
				clientId: w.c1,
				name: "10 sessions",
				sessions: 10,
				bonus: 1,
				priceCents: 120_000,
				discountCents: 10_000,
			});
			expect(await c().packages.get(w.app, saved.id)).toMatchObject({ discountCents: 10_000 });
			expect(await c().packages.get(w.app, "nosuchpackage0000000000000")).toBeUndefined();
			expect(await c().packages.get("some-other-app", saved.id)).toBeUndefined();
		});
		it("lists a client's packages, and the app's", async () => {
			const own = await c().packages.insert(pkg(w, w.c2));
			expect((await c().packages.list(w.app, { eq: { clientId: w.c2 } })).map((p) => p.id)).toEqual(
				[own.id],
			);
			expect((await c().packages.list(w.app)).map((p) => p.id)).toContain(own.id);
		});
		it("changes sessions, bonus, price and the offer in either order", async () => {
			const p = await c().packages.insert(pkg(w, w.c1, { discountCents: 100_000 }));
			await c().packages.replace({
				...p,
				name: "renamed",
				sessions: 12,
				bonus: 2,
				priceCents: 110_000,
				discountCents: 5_000,
			});
			expect(await c().packages.get(w.app, p.id)).toMatchObject({
				name: "renamed",
				sessions: 12,
				bonus: 2,
				priceCents: 110_000,
				discountCents: 5_000,
			});
			await c().packages.replace({
				...p,
				name: "renamed",
				sessions: 12,
				bonus: 2,
				priceCents: 200_000,
				discountCents: 150_000,
			});
			expect(await c().packages.get(w.app, p.id)).toMatchObject({
				priceCents: 200_000,
				discountCents: 150_000,
			});
		});
		it("an unused package is removed, and removing nothing is false", async () => {
			const p = await c().packages.insert(pkg(w, w.c1));
			expect(await c().packages.remove(w.app, p.id)).toBe(true);
			expect(await c().packages.get(w.app, p.id)).toBeUndefined();
			expect(await c().packages.remove(w.app, p.id)).toBe(false);
		});
		it("replace of nothing is false", async () => {
			expect(
				await c().packages.replace({ ...pkg(w, w.c1), id: "nosuchpackage0000000000000" }),
			).toBe(false);
		});
		it("a package for a client that is not there: unknown_client", () =>
			refused("unknown_client", () => c().packages.insert(pkg(w, "nosuchclient000000000000000"))));
		it("an offer larger than the price: invalid", () =>
			refused("invalid", () => c().packages.insert(pkg(w, w.c1, { discountCents: 130_000 }))));
		it("a package does not change hands", async () => {
			const p = await c().packages.insert(pkg(w, w.c1));
			await refused("invalid", () => c().packages.replace({ ...p, clientId: w.c2 }));
		});
		it("a package with an appointment is kept: in_use", async () => {
			const p = await c().packages.insert(pkg(w, w.c1));
			await c().appointments.insert(draft(w, { start: next(), packageId: p.id }));
			await refused("in_use", () => c().packages.remove(w.app, p.id));
		});
		it("a package with a payment is kept: in_use", async () => {
			const p = await c().packages.insert(pkg(w, w.c1));
			await c().payments.insert(pay(w, { packageId: p.id }));
			await refused("in_use", () => c().packages.remove(w.app, p.id));
		});
	});

	describe("payments", () => {
		it("a payment for a package is stored with its method, time and note", async () => {
			const p = await c().packages.insert(pkg(w, w.c1));
			const paidAt = BASE + 5 * HOUR;
			const saved = await c().payments.insert(
				pay(w, { packageId: p.id, amountCents: 50_000, method: "card", paidAt, note: "first" }),
			);
			expect(saved).toMatchObject({
				clientId: w.c1,
				packageId: p.id,
				amountCents: 50_000,
				method: "card",
				paidAt,
				note: "first",
			});
			expect(await c().payments.get(w.app, saved.id)).toMatchObject({
				amountCents: 50_000,
				note: "first",
			});
			expect(
				(await c().payments.list(w.app, { eq: { packageId: p.id } })).map((r) => r.id),
			).toEqual([saved.id]);
			expect(
				(await c().payments.list(w.app, { eq: { clientId: w.c1, packageId: p.id } })).length,
			).toBe(1);
			expect(
				await c().payments.list(w.app, { eq: { packageId: "nosuchpackage0000000000000" } }),
			).toEqual([]);
			expect(await c().payments.get(w.app, "nosuchpayment00000000000000")).toBeUndefined();
		});
		it("a payment is deleted, and deleting nothing is false", async () => {
			const saved = await c().payments.insert(pay(w, {}));
			expect(await c().payments.remove(w.app, saved.id)).toBe(true);
			expect(await c().payments.get(w.app, saved.id)).toBeUndefined();
			expect(await c().payments.remove(w.app, saved.id)).toBe(false);
		});
		it("a payment is never edited: the same row is accepted, another is not_allowed", async () => {
			const saved = await c().payments.insert(pay(w, {}));
			expect(await c().payments.replace(saved)).toBe(true);
			await refused("not_allowed", () =>
				c().payments.replace({ ...saved, amountCents: saved.amountCents + 1 }),
			);
			expect(await c().payments.replace({ ...saved, id: "nosuchpayment00000000000000" })).toBe(
				false,
			);
		});
		it("a client that is not there: unknown_client", () =>
			refused("unknown_client", () =>
				c().payments.insert(pay(w, { clientId: "nosuchclient000000000000000" })),
			));
		it("a package of another client: unknown_package", async () => {
			const p = await c().packages.insert(pkg(w, w.c2));
			await refused("unknown_package", () => c().payments.insert(pay(w, { packageId: p.id })));
		});
		it("an appointment that is not there, or another client's: unknown_visit", async () => {
			await refused("unknown_visit", () =>
				c().payments.insert(pay(w, { appointmentId: "nosuchappointment0000000000" })),
			);
			const a = await c().appointments.insert(draft(w, { start: next(), clientId: w.c2 }));
			await refused("unknown_visit", () => c().payments.insert(pay(w, { appointmentId: a.id })));
		});
		it("a zero amount: invalid", () =>
			refused("invalid", () => c().payments.insert(pay(w, { amountCents: 0 }))));
	});
};
