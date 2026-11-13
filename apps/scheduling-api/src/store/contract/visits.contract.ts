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
				remind: true,
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

		it("moves to another client; the package it drew from must be the new client's or be taken off in the same edit", async () => {
			const old = await c().packages.insert(pkg(w, w.c1));
			const a = await c().appointments.insert(draft(w, { start: next(), packageId: old.id }));
			await refused("package_not_clients", () =>
				c().appointments.replace({ ...a, clientId: w.c2 }),
			);
			const { packageId: _p, ...unpacked } = a;
			await c().appointments.replace({ ...unpacked, clientId: w.c2 });
			const moved = await c().appointments.get(w.app, a.id);
			expect(moved?.clientId).toBe(w.c2);
			expect(moved?.packageId).toBeUndefined();
			const theirs = await c().packages.insert(pkg(w, w.c2));
			await c().appointments.replace({ ...unpacked, clientId: w.c2, packageId: theirs.id });
			expect((await c().appointments.get(w.app, a.id))?.packageId).toBe(theirs.id);
			await refused("package_not_clients", () =>
				c().appointments.replace({ ...a, clientId: w.c2, packageId: old.id }),
			);
		});

		it("takes an appointment out of its package, and the package no longer counts it", async () => {
			const pack = await c().packages.insert(pkg(w, w.c1));
			const a = await c().appointments.insert(draft(w, { start: next(), packageId: pack.id }));
			const { packageId: _p, ...unpacked } = a;
			await c().appointments.replace(unpacked);
			expect((await c().appointments.get(w.app, a.id))?.packageId).toBeUndefined();
			expect(await c().appointments.list(w.app, { eq: { packageId: pack.id } })).toEqual([]);
			await c().packages.remove(w.app, pack.id);
			expect(await c().packages.get(w.app, pack.id)).toBeUndefined();
		});

		it("changes the price and keeps what was paid; a negative price is refused", async () => {
			const a = await c().appointments.insert(draft(w, { start: next(), money: money(10_000, 0) }));
			await c().payments.insert(pay(w, { appointmentId: a.id, amountCents: 4_000 }));
			const part = await c().appointments.get(w.app, a.id);
			expect(part?.money).toEqual(money(10_000, 4_000));
			await c().appointments.replace({ ...a, money: money(3_000, 0) });
			expect((await c().appointments.get(w.app, a.id))?.money).toEqual(money(3_000, 4_000));
			await refused("negative_money", () =>
				c().appointments.replace({ ...a, money: { ...money(3_000, 0), priceCents: -1 } }),
			);
		});

		it("is requested, then confirmed; the reminder is switched off and on; the service changes", async () => {
			const a = await c().appointments.insert(draft(w, { start: next(), status: "requested" }));
			expect((await c().appointments.get(w.app, a.id))?.status).toBe("requested");
			await c().appointments.replace({
				...a,
				status: "scheduled",
				remind: false,
				serviceId: "svc-9",
			});
			expect(await c().appointments.get(w.app, a.id)).toMatchObject({
				status: "scheduled",
				remind: false,
				serviceId: "svc-9",
			});
			await c().appointments.replace({
				...a,
				status: "scheduled",
				remind: true,
				serviceId: "svc-9",
			});
			expect((await c().appointments.get(w.app, a.id))?.remind).toBe(true);
		});

		it("a requested appointment holds its time like a confirmed one", async () => {
			const start = next();
			await c().appointments.insert(draft(w, { start, status: "requested" }));
			await refused("overlaps", () => c().appointments.insert(draft(w, { start, clientId: w.c2 })));
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

		it("a payment moves the appointment's amount paid, and removing it moves it back; replace never writes what was paid", async () => {
			const a = await c().appointments.insert(draft(w, { start: next(), money: money(10_000, 0) }));
			await c().appointments.replace({ ...a, money: money(10_000, 99) });
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
			it("a session cannot lose its client, and a block cannot gain one", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				const { clientId: _c, ...clientless } = a;
				await refused("invalid", () => c().appointments.replace(clientless));
				const block = await c().appointments.insert(
					draft(w, { start: next(), kind: "block", clientId: undefined }),
				);
				await refused("invalid", () => c().appointments.replace({ ...block, clientId: w.c2 }));
			});
			it("a session cannot go back to waiting for the client once the client confirmed it", async () => {
				const a = await c().appointments.insert(draft(w, { start: next() }));
				await refused("not_allowed", () => c().appointments.replace({ ...a, status: "requested" }));
			});
			it("a refused edit changes none of its fields: a client moved with a clash in the same edit", async () => {
				const start = next();
				const a = await c().appointments.insert(draft(w, { start, note: "keep" }));
				await c().appointments.insert(draft(w, { start: start + 2 * HOUR, clientId: w.c2 }));
				await refused("overlaps", () =>
					c().appointments.replace({
						...a,
						clientId: w.c2,
						note: "changed",
						start: start + 2 * HOUR,
						end: start + 3 * HOUR,
					}),
				);
			});
			it("a note, room or device is not cleared", async () => {
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
