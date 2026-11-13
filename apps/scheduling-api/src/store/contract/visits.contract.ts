import { beforeAll, describe, expect, it } from "vitest";
import type { AppointmentRow, Query } from "../types";
import type { ContractSection } from "./env";
import { BASE, draft, HOUR, money, pay, pkg, useWorld, type World, written } from "./visits.world";

/**
 * Appointments as the handlers use them. Ids and stamps are the store's, so rows are compared on what the caller wrote;
 * a refusal is its own case and leaves every row as it was.
 */
export const visitsContract: ContractSection = (env) => {
	const h = useWorld(env);
	let w: World;
	beforeAll(() => {
		w = h.world();
	});
	const { c, next, refused, snapshot } = h;
	describe("appointments", () => {
		it("a session is stored under the store's own id and read back as written", async () => {
			const start = next();
			const saved = await c().appointments.insert(
				draft(w, { start, note: "first", roomId: w.room, deviceId: w.device, serviceId: "svc-1" }),
			);
			expect(saved.id.length).toBeGreaterThan(2);
			expect(written(saved)).toEqual({
				app: w.app,
				kind: "session",
				status: "scheduled",
				practitionerId: w.dora,
				clientId: w.c1,
				roomId: w.room,
				deviceId: w.device,
				serviceId: "svc-1",
				start,
				end: start + HOUR,
				note: "first",
			});
			expect(written(await c().appointments.get(w.app, saved.id))).toEqual(written(saved));
			expect(await c().appointments.get(w.app, "nosuchappointment0000000000")).toBeUndefined();
			expect(await c().appointments.get("some-other-app", saved.id)).toBeUndefined();
		});

		it("a price is the appointment's money, derived: nothing paid, unpaid", async () => {
			const saved = await c().appointments.insert(
				draft(w, { start: next(), money: money(15_000, 0) }),
			);
			expect(saved.money).toEqual({ priceCents: 15_000, paidCents: 0, paymentStatus: "unpaid" });
		});

		it("lists by window, person, client, room and group; a window is half-open", async () => {
			const start = next();
			const a = await c().appointments.insert(
				draft(w, { start, clientId: w.c2, practitionerId: w.elena, roomId: w.room2 }),
			);
			const ids = async (q: Query<AppointmentRow>) =>
				(await c().appointments.list(w.app, q)).map((r) => r.id);
			expect(await ids({ range: { field: "start", gte: start, lt: start + 1 } })).toEqual([a.id]);
			expect(await ids({ range: { field: "start", gte: start + 1, lt: start + HOUR } })).toEqual(
				[],
			);
			expect(await ids({ eq: { practitionerId: w.elena } })).toContain(a.id);
			expect(await ids({ eq: { roomId: w.room2 } })).toEqual([a.id]);
			expect(await ids({ eq: { clientId: w.c2, practitionerId: w.dora } })).toEqual([]);
			expect(await ids({ eq: { serviceId: "nope" } })).toEqual([]);
			expect(await ids({ eq: { clientId: w.c2 } })).toContain(a.id);
		});

		it("a group activity sits in its group's column and keeps its practitioner; its practitioner may be in another at once", async () => {
			const start = next();
			const g = await c().appointments.insert(
				draft(w, { start, kind: "group", groupId: w.group, clientId: undefined }),
			);
			expect(g).toMatchObject({ kind: "group", groupId: w.group, practitionerId: w.dora });
			const s = await c().appointments.insert(draft(w, { start }));
			expect(s.practitionerId).toBe(w.dora);
			expect(
				(await c().appointments.list(w.app, { eq: { groupId: w.group } })).map((r) => r.id),
			).toEqual([g.id]);
		});

		it("a block of time needs no client", async () => {
			const b = await c().appointments.insert(
				draft(w, { start: next(), kind: "block", clientId: undefined }),
			);
			expect(b).toMatchObject({ kind: "block" });
			expect(b.clientId).toBeUndefined();
		});

		it("moves in time, to another room, and changes the note and the package", async () => {
			const pack = await c().packages.insert(pkg(w, w.c1));
			const a = await c().appointments.insert(draft(w, { start: next() }));
			const start = next();
			await c().appointments.replace({
				...a,
				start,
				end: start + 2 * HOUR,
				roomId: w.room,
				note: "moved",
				packageId: pack.id,
			});
			expect(written(await c().appointments.get(w.app, a.id))).toMatchObject({
				start,
				end: start + 2 * HOUR,
				roomId: w.room,
				note: "moved",
				packageId: pack.id,
			});
		});

		it("moves to another practitioner, and changes the service and the cancel-less facts", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			await c().appointments.replace({ ...a, practitionerId: w.elena, serviceId: "svc-2" });
			expect(await c().appointments.get(w.app, a.id)).toMatchObject({
				practitionerId: w.elena,
				serviceId: "svc-2",
			});
		});

		it("marks attendance, no-show and back to scheduled", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			for (const status of ["attended", "no_show", "scheduled"] as const) {
				await c().appointments.replace({ ...a, status });
				expect((await c().appointments.get(w.app, a.id))?.status).toBe(status);
			}
		});

		it("cancels with the reason, and the time is free again", async () => {
			const start = next();
			const a = await c().appointments.insert(draft(w, { start }));
			await c().appointments.replace({ ...a, status: "cancelled", cancelReason: "client asked" });
			expect(await c().appointments.get(w.app, a.id)).toMatchObject({
				status: "cancelled",
				cancelReason: "client asked",
			});
			await expect(c().appointments.insert(draft(w, { start }))).resolves.toBeDefined();
		});

		it("a deleted appointment is marked with when it goes for good, listed so, and restored", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			const at = Date.now();
			await c().appointments.replace({
				...a,
				deletedAt: at,
				purgeAt: at + 30 * 24 * HOUR,
				updatedAt: at,
			});
			const gone = await c().appointments.get(w.app, a.id);
			expect(gone?.deletedAt).toBe(at);
			expect(gone?.purgeAt).toBe(at + 30 * 24 * HOUR);
			const { deletedAt: _d, purgeAt: _p, ...kept } = gone ?? a;
			await c().appointments.replace({ ...kept, updatedAt: Date.now() });
			const back = await c().appointments.get(w.app, a.id);
			expect(back?.deletedAt).toBeUndefined();
			expect(back?.purgeAt).toBeUndefined();
		});

		it("remove deletes softly: the row is gone or marked deleted, and a second remove of nothing is false", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			expect(await c().appointments.remove(w.app, a.id)).toBe(true);
			expect((await c().appointments.get(w.app, a.id))?.deletedAt ?? "gone").not.toBeUndefined();
			expect(await c().appointments.remove(w.app, "nosuchappointment0000000000")).toBe(false);
		});

		it("replace of nothing is false", async () => {
			const ghost = draft(w, { start: next() });
			expect(await c().appointments.replace({ ...ghost, id: "nosuchappointment0000000000" })).toBe(
				false,
			);
		});

		it("a payment moves the appointment's amount paid, and removing it moves it back; replace never writes money", async () => {
			const a = await c().appointments.insert(draft(w, { start: next(), money: money(10_000, 0) }));
			await c().appointments.replace({ ...a, money: money(99, 99) });
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(10_000, 0));
			const p1 = await c().payments.insert(pay(w, { appointmentId: a.id, amountCents: 4_000 }));
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(10_000, 4_000));
			const p2 = await c().payments.insert(pay(w, { appointmentId: a.id, amountCents: 6_000 }));
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(10_000, 10_000));
			expect((await c().appointments.get(w.app, a.id))?.money?.paymentStatus).toBe("paid");
			await c().payments.remove(w.app, p2.id);
			await c().payments.remove(w.app, p1.id);
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(10_000, 0));
		});

		it("a payment against an appointment with no price makes it partial", async () => {
			const a = await c().appointments.insert(draft(w, { start: next() }));
			await c().payments.insert(pay(w, { appointmentId: a.id, amountCents: 500 }));
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(0, 500));
		});

		describe("refusals write nothing", () => {
			it("a person, room or device already booked then: overlaps", async () => {
				const start = next();
				await c().appointments.insert(draft(w, { start, roomId: w.room, deviceId: w.device }));
				await refused("overlaps", () =>
					c().appointments.insert(draft(w, { start: start + HOUR / 2, clientId: w.c2 })),
				);
				await refused("overlaps", () =>
					c().appointments.insert(draft(w, { start, practitionerId: w.elena, roomId: w.room })),
				);
				await refused("overlaps", () =>
					c().appointments.insert(draft(w, { start, practitionerId: w.elena, deviceId: w.device })),
				);
			});
			it("a block over a booking: overlaps", async () => {
				const start = next();
				await c().appointments.insert(draft(w, { start }));
				await refused("overlaps", () =>
					c().appointments.insert(draft(w, { start, kind: "block", clientId: undefined })),
				);
			});
			it("back to back is fine", async () => {
				const start = next();
				await c().appointments.insert(draft(w, { start }));
				await expect(
					c().appointments.insert(draft(w, { start: start + HOUR })),
				).resolves.toBeDefined();
			});
			it("moving into a taken time: overlaps, and the appointment stays", async () => {
				const start = next();
				await c().appointments.insert(draft(w, { start }));
				const a = await c().appointments.insert(draft(w, { start: next() }));
				await refused("overlaps", () =>
					c().appointments.replace({ ...a, start, end: start + HOUR }),
				);
			});
			it("an unknown client", () =>
				refused("unknown_client", () =>
					c().appointments.insert(
						draft(w, { start: next(), clientId: "nosuchclient000000000000000" }),
					),
				));
			it("an unknown room", () =>
				refused("unknown_room", () =>
					c().appointments.insert(
						draft(w, { start: next(), roomId: "nosuchroom0000000000000000" }),
					),
				));
			it("an unknown device", () =>
				refused("unknown_device", () =>
					c().appointments.insert(
						draft(w, { start: next(), deviceId: "nosuchdevice00000000000000" }),
					),
				));
			it("an unknown package", () =>
				refused("unknown_package", () =>
					c().appointments.insert(
						draft(w, { start: next(), packageId: "nosuchpackage0000000000000" }),
					),
				));
			it("an end that is not after the start", () =>
				refused("end_not_after_start", () =>
					c().appointments.insert(draft(w, { start: next(), end: BASE })),
				));
			it("a group activity with no group", () =>
				refused("invalid", () =>
					c().appointments.insert(draft(w, { start: next(), kind: "group", clientId: undefined })),
				));
			it("a person who is not a practitioner has no column", () =>
				refused("unknown_practitioner", () =>
					c().appointments.insert(draft(w, { start: next(), practitionerId: w.mara })),
				));
			it("a practitioner that does not exist", async () => {
				const before = await snapshot();
				await expect(
					c().appointments.insert(
						draft(w, { start: next(), practitionerId: "pnosuchperson00000000000000" }),
					),
				).rejects.toMatchObject({ name: "StoreRefused" });
				expect(await snapshot()).toBe(before);
			});
			it("a cancelled appointment does not come back", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				await c().appointments.replace({ ...a, status: "cancelled" });
				await refused("not_allowed", () => c().appointments.replace({ ...a, status: "scheduled" }));
			});
			it("a cancelled appointment does not move", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				const cancelled = { ...a, status: "cancelled" as const };
				await c().appointments.replace(cancelled);
				await refused("not_allowed", () =>
					c().appointments.replace({ ...cancelled, start: next(), end: next() + HOUR }),
				);
			});
			it("the client of an appointment is not changed", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				await refused("invalid", () => c().appointments.replace({ ...a, clientId: w.c2 }));
			});
			it("a note, package, room or device is not cleared", async () => {
				const a = await c().appointments.insert(
					draft(w, { start: next(), note: "keep", roomId: w.room }),
				);
				const { note: _n, ...noNote } = a;
				await refused("invalid", () => c().appointments.replace(noNote));
				const { roomId: _r, ...noRoom } = a;
				await refused("invalid", () => c().appointments.replace(noRoom));
			});
			it("a deleted appointment changes only by being restored", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				const at = Date.now();
				const deleted = { ...a, deletedAt: at, purgeAt: at + 30 * 24 * HOUR, updatedAt: at };
				await c().appointments.replace(deleted);
				await refused("not_found", () => c().appointments.replace({ ...deleted, note: "late" }));
			});
		});
	});
};
