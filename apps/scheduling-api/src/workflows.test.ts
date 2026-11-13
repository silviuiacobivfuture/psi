import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const owner = (method: string, path: string, body?: unknown) =>
	w.call("olga", method, `${A}${path}`, body);
const err = (r: {
	json: Record<string, unknown>;
}): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe("appointments", () => {
	const book = (extra: Record<string, unknown> = {}) =>
		owner("POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 5 * HOUR,
			end: NOW + 6 * HOUR,
			...extra,
		});

	it("refuses an end before the start, a session without a client, a group activity without a group", async () => {
		expect((await book({ end: NOW + 4 * HOUR })).status).toBe(400);
		expect((await book({ clientId: undefined })).status).toBe(400);
		expect((await book({ kind: "group", clientId: undefined })).status).toBe(400);
	});

	it("refuses an unknown person, client, room, device or service, naming the field", async () => {
		for (const [field, value] of [
			["practitionerId", "ghost0000001"],
			["clientId", "ghost0000001"],
			["roomId", "ghost0000001"],
			["deviceId", "ghost0000001"],
			["serviceId", "ghost0000001"],
		] as const) {
			const r = await book({ [field]: value });
			expect(r.status, field).toBe(field === "practitionerId" ? 404 : 400);
		}
	});

	it("refuses a double booking of the person, the room or the device, and a cancelled one frees the slot", async () => {
		const first = await book({ roomId: w.ids.room });
		expect((await book({ clientId: w.ids.c2 })).status).toBe(409);
		expect(
			(await book({ practitionerId: w.ids.elena, clientId: w.ids.c2, roomId: w.ids.room })).status,
		).toBe(409);
		await owner("POST", `/appointments/${first.json.id}/cancel`, { reason: "moved" });
		expect((await book({ clientId: w.ids.c2 })).status).toBe(200);
	});

	it("a block of time needs no client, and takes the person's time like any booking: it clashes with a session", async () => {
		expect(
			(
				await book({
					kind: "block",
					clientId: undefined,
					start: NOW + 30 * HOUR,
					end: NOW + 31 * HOUR,
				})
			).status,
		).toBe(200);
		// Dora has a session tomorrow at this hour (the populated a1).
		expect(
			(
				await book({
					kind: "block",
					clientId: undefined,
					start: NOW + 24 * HOUR,
					end: NOW + 25 * HOUR,
				})
			).status,
		).toBe(409);
	});

	it("moving to another practitioner needs the assign permission and moves the scope with it", async () => {
		const a = (await book()).json.id as string;
		await w.call("olga", "PUT", `${A}/members/dora/overrides`, {
			grant: ["appointments_edit_own"],
			deny: [],
		});
		const denied = await w.call("dora", "PATCH", `${A}/appointments/${a}`, {
			practitionerId: w.ids.elena,
		});
		expect(denied.status).toBe(403);
		expect(err(denied).detail).toMatchObject({ permission: "appointments_assign" });
		await owner("PATCH", `/appointments/${a}`, { practitionerId: w.ids.elena });
		expect((await w.call("dora", "GET", `${A}/appointments/${a}`)).status).toBe(404);
		expect((await w.call("elena", "GET", `${A}/appointments/${a}`)).status).toBe(200);
	});

	it("a cancelled appointment cannot be cancelled again, moved, or marked", async () => {
		const a = (await book()).json.id as string;
		await owner("POST", `/appointments/${a}/cancel`, { reason: "client asked" });
		expect((await owner("POST", `/appointments/${a}/cancel`, { reason: "again" })).status).toBe(
			409,
		);
		expect((await owner("PATCH", `/appointments/${a}`, { note: "x" })).status).toBe(409);
		expect(
			(await owner("POST", `/appointments/${a}/attendance`, { status: "attended" })).status,
		).toBe(409);
	});

	it("payments accumulate on the appointment and set its payment status", async () => {
		const a = (await book({ priceCents: 10_000 })).json.id as string;
		expect(
			(
				(await owner("POST", `/appointments/${a}/payment`, { amountCents: 4000, method: "cash" }))
					.json.money as { paymentStatus: string }
			).paymentStatus,
		).toBe("partial");
		expect(
			(await owner("POST", `/appointments/${a}/payment`, { amountCents: 6000, method: "card" }))
				.json.money,
		).toMatchObject({ paidCents: 10_000, paymentStatus: "paid" });
	});

	it("an appointment price needs the money permission", async () => {
		const r = await w.call("rita", "POST", `${A}/appointments`, {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 7 * HOUR,
			end: NOW + 8 * HOUR,
			priceCents: 5,
		});
		expect(r.status).toBe(200);
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: [],
			deny: ["appointments_create_all_money"],
		});
		expect(
			(
				await w.call("rita", "POST", `${A}/appointments`, {
					practitionerId: w.ids.dora,
					clientId: w.ids.c1,
					start: NOW + 9 * HOUR,
					end: NOW + 10 * HOUR,
					priceCents: 5,
				})
			).status,
		).toBe(403);
	});

	it("the calendar groups by person, room or device and leaves cancelled visits out", async () => {
		const gone = (await book({ start: NOW + 30 * HOUR, end: NOW + 31 * HOUR, roomId: w.ids.room }))
			.json.id as string;
		await owner("POST", `/appointments/${gone}/cancel`, { reason: "xx" });
		const range = `from=${NOW}&to=${NOW + 3 * 24 * HOUR}`;
		const rooms = (await owner("GET", `/calendar?${range}&columns=room`)).json.columns as {
			id: string;
			appointments: { id: string }[];
		}[];
		expect(rooms.find((c) => c.id === w.ids.room)?.appointments.map((a) => a.id)).not.toContain(
			gone,
		);
		expect(
			((await owner("GET", `/calendar?${range}&columns=device`)).json.columns as unknown[]).length,
		).toBe(1);
	});
});

describe("clients: current, archive, delete, restore", () => {
	const make = async (): Promise<string> =>
		(await owner("POST", "/clients", { name: "Temp Client" })).json.id as string;

	it("archive hides from the current list and shows in the archive; restore brings it back", async () => {
		const id = await make();
		await owner("POST", `/clients/${id}/archive`);
		expect(
			((await owner("GET", "/clients")).json.items as { id: string }[]).some((c) => c.id === id),
		).toBe(false);
		expect(
			((await owner("GET", "/clients?status=archived")).json.items as { id: string }[]).some(
				(c) => c.id === id,
			),
		).toBe(true);
		expect((await owner("POST", `/clients/${id}/restore`)).json.status).toBe("active");
	});

	it("delete is soft for 30 days: recoverable, with the purge date; deleting twice is a conflict", async () => {
		const id = await make();
		const r = await owner("DELETE", `/clients/${id}`);
		expect(r.json).toMatchObject({ status: "deleted", purgeAt: NOW + 30 * 24 * HOUR });
		expect((await owner("DELETE", `/clients/${id}`)).status).toBe(409);
		expect(
			((await owner("GET", "/clients?status=deleted")).json.items as { id: string }[]).map(
				(c) => c.id,
			),
		).toContain(id);
		expect((await owner("POST", `/clients/${id}/restore`)).status).toBe(200);
	});

	it("an archived client cannot be archived again; an active one cannot be restored", async () => {
		const id = await make();
		expect((await owner("POST", `/clients/${id}/restore`)).status).toBe(409);
		await owner("POST", `/clients/${id}/archive`);
		expect((await owner("POST", `/clients/${id}/archive`)).status).toBe(409);
	});

	it("searches by name and pages with a cursor", async () => {
		expect(((await owner("GET", "/clients?q=two")).json.items as unknown[]).length).toBe(1);
		const page = (await owner("GET", "/clients?limit=1")).json as {
			items: unknown[];
			nextCursor?: string;
		};
		expect(page.items).toHaveLength(1);
		const next = (await owner("GET", `/clients?limit=1&cursor=${page.nextCursor}`)).json as {
			items: { name: string }[];
			nextCursor?: string;
		};
		expect(next.items).toHaveLength(1);
		expect(next.nextCursor).toBeUndefined();
		expect((await owner("GET", "/clients?cursor=!!")).status).toBe(400);
	});

	it("merges a group patch instead of replacing it, and keeps the clinical content sealed", async () => {
		await owner("PATCH", `/clients/${w.ids.c1}`, {
			clinical: { notes: "new notes" },
			contact: { phone: "0799 111 222" },
		});
		const c = (await owner("GET", `/clients/${w.ids.c1}`)).json;
		expect(c.clinical).toEqual({ diagnosis: "synthetic-diagnosis-one", notes: "new notes" });
		expect(c.contact).toMatchObject({ phone: "0799 111 222", email: "one@example.test" });
	});
});

describe("packages and payments: totals are computed", () => {
	it("total, paid, remaining and sessions left follow the ledger and the visits", async () => {
		const p = (await owner("GET", `/packages/${w.ids.pkg}`)).json.package as Record<string, number>;
		expect(p).toMatchObject({
			priceCents: 120_000,
			discountCents: 10_000,
			totalCents: 110_000,
			paidCents: 50_000,
			remainingCents: 60_000,
			sessionsRemaining: 11,
			used: 0,
		});
		await owner("PATCH", `/appointments/${w.ids.a1}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		expect(
			(
				(await owner("GET", `/clients/${w.ids.c1}/packages`)).json.items as Record<string, number>[]
			)[0],
		).toMatchObject({ used: 1, sessionsRemaining: 10 });
	});

	it("an offer larger than the price, an overpayment and fewer sessions than used are refused", async () => {
		expect(
			(await owner("PATCH", `/packages/${w.ids.pkg}`, { discountCents: 999_999 })).status,
		).toBe(400);
		const over = await owner("POST", `/packages/${w.ids.pkg}/payments`, {
			amountCents: 60_001,
			method: "cash",
		});
		expect(over.status).toBe(409);
		expect(err(over).detail).toMatchObject({ remainingCents: 60_000 });
		await owner("PATCH", `/appointments/${w.ids.a1}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		// A package is drawn from by its own client's appointments only: a second one of client one's.
		const second = String(
			(
				await owner("POST", "/appointments", {
					practitionerId: w.ids.dora,
					clientId: w.ids.c1,
					start: NOW + 96 * HOUR,
					end: NOW + 97 * HOUR,
					packageId: w.ids.pkg,
				})
			).json.id,
		);
		await owner("POST", `/appointments/${second}/attendance`, { status: "attended" });
		expect((await owner("PATCH", `/packages/${w.ids.pkg}`, { sessions: 1, bonus: 0 })).status).toBe(
			409,
		);
	});

	it("a package with payments is kept; deleting a payment is audited and the balance follows", async () => {
		expect((await owner("DELETE", `/packages/${w.ids.pkg}`)).status).toBe(409);
		await owner("DELETE", `/payments/${w.ids.payment}`);
		expect(
			((await owner("GET", `/packages/${w.ids.pkg}`)).json.package as { paidCents: number })
				.paidCents,
		).toBe(0);
		expect(
			((await owner("GET", "/audit?action=payment.delete")).json.items as unknown[]).length,
		).toBe(1);
	});

	it("a patch leaves the fields it does not mention alone", async () => {
		await owner("PATCH", `/packages/${w.ids.pkg}`, { name: "Renamed" });
		expect((await owner("GET", `/packages/${w.ids.pkg}`)).json.package).toMatchObject({
			name: "Renamed",
			bonus: 1,
			discountCents: 10_000,
		});
	});

	it("only an active client takes a package", async () => {
		await owner("POST", `/clients/${w.ids.c2}/archive`);
		expect(
			(
				await owner("POST", `/clients/${w.ids.c2}/packages`, {
					name: "x",
					sessions: 1,
					priceCents: 1,
				})
			).status,
		).toBe(409);
	});
});

describe("roster and leave", () => {
	it("a work day needs hours; leave approved lands on the roster as leave, day by day", async () => {
		expect((await owner("PUT", `/roster/${w.ids.dora}/2026-11-16`, { kind: "work" })).status).toBe(
			400,
		);
		await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" });
		const days = (await owner("GET", "/roster?from=2026-12-01&to=2026-12-03")).json.items as {
			date: string;
			kind: string;
		}[];
		expect(days.map((d) => `${d.date}:${d.kind}`)).toEqual([
			"2026-12-01:leave_co",
			"2026-12-02:leave_co",
			"2026-12-03:leave_co",
		]);
	});

	it("a leave request is decided once; rejected leaves the roster alone", async () => {
		await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "rejected" });
		expect(
			(await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" })).status,
		).toBe(409);
		expect(
			((await owner("GET", "/roster?from=2026-12-01&to=2026-12-03")).json.items as unknown[])
				.length,
		).toBe(0);
	});

	it("refuses leave that ends before it starts or lasts over 62 days; a roster day is replaced, not duplicated", async () => {
		expect(
			(
				await owner("POST", "/leave", {
					personId: w.ids.dora,
					from: "2026-12-05",
					to: "2026-12-01",
					kind: "co",
				})
			).status,
		).toBe(400);
		expect(
			(
				await owner("POST", "/leave", {
					personId: w.ids.dora,
					from: "2026-12-01",
					to: "2027-03-01",
					kind: "co",
				})
			).status,
		).toBe(400);
		await owner("PUT", `/roster/${w.ids.dora}/2026-11-17`, { kind: "free" });
		await owner("PUT", `/roster/${w.ids.dora}/2026-11-17`, { kind: "work", start: 600, end: 900 });
		expect(
			(
				(await owner("GET", "/roster?from=2026-11-17&to=2026-11-17")).json.items as {
					kind: string;
				}[]
			).map((d) => d.kind),
		).toEqual(["work"]);
	});

	it("a volunteer sees the roster and cannot edit it", async () => {
		expect((await w.call("vera", "GET", `${A}/roster?from=2026-11-01&to=2026-11-30`)).status).toBe(
			200,
		);
		expect(
			(await w.call("vera", "PUT", `${A}/roster/${w.ids.dora}/2026-11-18`, { kind: "free" }))
				.status,
		).toBe(404);
	});
});
