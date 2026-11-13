import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchedulingClient } from "../client";
import { addDays, toLocal } from "../domain/time";
import { backendReady } from "./admin";
import { enc, HOUR, id } from "./api-harness";
import { CONVEX_URL } from "./backend";
import { clinicWorld } from "./clinic-world";
import { at, ZONE } from "./reports-fixtures";
import { serverKey } from "./server";

/**
 * The reports against the local backend, in throwaway `test-rp-…` apps (synthetic data): known
 * rows in, known numbers out, for every report; the refusals (range, app, key); that a report
 * writes nothing; and that another app's data never shows. The arithmetic itself is in the pure
 * `reports-*.test.ts`.
 */
if (!backendReady) console.warn("reports-backend.test: no local backend; see README");

const w = clinicWorld("rp");
const { a, b, ids, ref, state } = w;
const today = toLocal(Date.now(), ZONE).date;
const D = (n: number): string => addDays(today, -n);
const FROM = at(D(14), "00:00");
const TO = at(addDays(today, 1), "00:00");
const RANGE = { from: FROM, to: TO, granularity: "week" } as const;

describe.skipIf(!backendReady)("reports", () => {
	const report = async (name: string, args: Record<string, unknown> = {}, tenant: typeof a = a) =>
		(await tenant.qry(name, { ...RANGE, ...args }, { same: true })).report as Record<
			string,
			unknown
		>;

	beforeAll(async () => {
		if (!backendReady) return;
		await w.setup();
		ids.room = id(
			await a.mut("staffRooms:createRoom", {
				slug: "r1",
				name: "R1",
				kind: "therapy",
				capacity: 1,
				suits: ["adult"],
				equipment: [],
			}),
		);
		ids.device = id(
			await a.mut("apiResources:createDevice", { slug: "d1", name: "D1", kind: "neurofeedback" }),
		);
		const p = state.practitioner;
		for (const n of [10, 9, 8]) {
			await a.mut("apiRoster:setDay", {
				person: { kind: "practitioner", id: p },
				date: D(n),
				status: "works",
				startMinutes: 480,
				endMinutes: 960,
			});
		}
		await a.mut("apiRoster:setDay", {
			person: { kind: "practitioner", id: p },
			date: D(7),
			status: "annual_leave",
		});
		const visit = async (
			key: string,
			n: number,
			from: string,
			to: string,
			over: Record<string, unknown>,
		) => {
			ids[key] = id(
				await a.mut("apiVisits:create", {
					column: { kind: "practitioner", id: p },
					start: at(D(n), from),
					end: at(D(n), to),
					sessionType: "ABA",
					...over,
				}),
			);
		};
		await visit("v1", 10, "09:00", "10:00", {
			client: ref("ana"),
			room: ref("room"),
			priceMinor: 10_000,
			amountPaidMinor: 10_000,
			paymentMethod: "cash",
		});
		await visit("v2", 9, "09:00", "10:30", {
			client: ref("ana"),
			device: ref("device"),
			priceMinor: 10_000,
			amountPaidMinor: 0,
		});
		await visit("v3", 8, "09:00", "10:00", {
			client: ref("ion"),
			priceMinor: 8_000,
			amountPaidMinor: 3_000,
			paymentMethod: "card",
		});
		await visit("v4", 8, "10:00", "11:00", { client: ref("ion") });
		await visit("v5", 7, "09:00", "10:00", { client: ref("ion") });
		await visit("v6", 3, "09:00", "10:00", { client: ref("ana") });
		ids.pk = id(
			await a.mut("apiMoney:createPackage", {
				client: ref("ana"),
				sessionType: "ABA",
				totalSessions: 3,
				bonusSessions: 1,
				priceMinor: 30_000,
			}),
		);
		await visit("v7", 10, "11:00", "12:00", {
			client: ref("ana"),
			package: ref("pk"),
			creditType: "base",
		});
		for (const v of ["v1", "v3", "v5", "v7"])
			await a.mut("apiVisits:setAttendance", { visit: ref(v), attendance: "attended" });
		await a.mut("apiVisits:setAttendance", { visit: ref("v2"), attendance: "absent" });
		await a.mut("apiVisits:cancel", { visit: ref("v4") });
		await a.mut("apiMoney:addPayment", {
			client: ref("ana"),
			package: ref("pk"),
			amountMinor: 20_000,
			method: "card",
			at: at(D(5), "10:00"),
		});
		await a.mut("apiMoney:addPayment", {
			client: ref("ana"),
			amountMinor: -2_000,
			method: "cash",
			at: at(D(4), "10:00"),
		});
		// Feedback: two ratings of finished visits and a note.
		const hash = "b".repeat(64);
		for (const [visitKey, rating] of [
			["v1", 5],
			["v3", 3],
		] as const) {
			await a.mut("apiFeedback:submit", {
				channel: "account",
				accountHash: hash,
				kind: "appointment_rating",
				rating,
				visit: ref(visitKey),
				consentContact: false,
			});
		}
		await a.mut("apiFeedback:submit", {
			channel: "chat",
			kind: "general",
			textEnc: enc,
			consentContact: false,
		});
		// The web flow: one request, one hold left, one visitor the blacklist turned away.
		await a.mut("apiBlacklist:create", {
			entry: {
				phone: "0700 111 222",
				reason: "synthetic",
				category: "other",
				severity: "block_online",
			},
		});
		const client = createSchedulingClient({ url: CONVEX_URL, serverKey, timeoutMs: 10_000 });
		const found = await client.findSlots({
			tenant: a.TENANT,
			service: "race",
			from: Date.now() + 2 * 24 * HOUR,
			to: Date.now() + 3 * 24 * HOUR,
			mode: "onsite",
		});
		if (!found.ok) throw new Error(found.reason);
		const holdAt = async (k: number) => {
			const slot = found.slots[k];
			if (slot === undefined) throw new Error("no slot");
			const held = await client.hold({
				tenant: a.TENANT,
				service: "race",
				practitioner: slot.practitioner,
				start: slot.start,
				mode: "onsite",
				locale: "ro",
				channel: "form",
			});
			if (!held.ok) throw new Error(held.reason);
			return held;
		};
		const one = await holdAt(5);
		await client.submit({
			reference: one.reference,
			holdToken: one.holdToken,
			contact: { name: "Test Visitor", phone: "0700 999 999" },
		});
		await holdAt(12);
		const three = await holdAt(20);
		await client.submit({
			reference: three.reference,
			holdToken: three.holdToken,
			contact: { name: "Test Visitor", phone: "0700 111 222" },
		});
		await a.sys(
			"apiBlacklist:screen",
			{ channel: "callback", contact: { phone: "0700 111 222" } },
			{ audit: 1, ok: false },
		);
	}, 60_000);
	afterAll(async () => {
		if (backendReady) await w.teardown();
	});

	it("appointments: per status, service, room and device, and weekly buckets", async () => {
		const byStatus = await report("apiReports:appointments", { group: "status" });
		expect(byStatus).toMatchObject({ total: 7, by: { cancelled: 1, confirmed: 6 } });
		expect(await report("apiReports:appointments", { group: "service" })).toMatchObject({
			by: { ABA: 7 },
		});
		expect(await report("apiReports:appointments", { group: "practitioner" })).toMatchObject({
			by: { [state.practitioner]: 7 },
		});
		expect(await report("apiReports:appointments", { group: "room" })).toMatchObject({
			by: { [ref("room")]: 1, none: 6 },
		});
		expect(await report("apiReports:appointments", { group: "device" })).toMatchObject({
			by: { [ref("device")]: 1, none: 6 },
		});
		const weeks = (byStatus.buckets as Array<{ total: number }>).reduce((n, x) => n + x.total, 0);
		expect(weeks).toBe(7);
		expect(
			await report("apiReports:appointments", { group: "status", client: ref("ion") }),
		).toMatchObject({ total: 3 });
		expect(
			await report("apiReports:appointments", { group: "status", statuses: ["cancelled"] }),
		).toMatchObject({ total: 1 });
	});

	it("appointments: an unknown status is refused, nothing written", async () => {
		const out = await a.qry(
			"apiReports:appointments",
			{ ...RANGE, group: "status", statuses: ["gone"] },
			{ ok: false, same: true },
		);
		expect(out.reason).toBe("invalid");
	});

	it("utilisation: booked and available minutes from the roster, the leave day and the unplanned day outside", async () => {
		const out = await report("apiReports:utilisation");
		const p = (out.practitioners as Array<Record<string, unknown>>).find(
			(x) => x.id === state.practitioner,
		);
		expect(p).toMatchObject({ availableMinutes: 1_440, bookedMinutes: 270, outsideMinutes: 120 });
		expect(p?.rate).toBeCloseTo(270 / 1_440);
		expect(out.rooms).toEqual([
			expect.objectContaining({ id: ref("room"), availableMinutes: 1_440, bookedMinutes: 60 }),
		]);
		expect(out.devices).toEqual([
			expect.objectContaining({ id: ref("device"), bookedMinutes: 90 }),
		]);
	});

	it("rates: cancellations, attended, absent and unmarked; and the clients, worst first", async () => {
		const out = await a.qry("apiReports:rates", { ...RANGE, byClient: true }, { same: true });
		expect(out.report).toMatchObject({
			bookings: 7,
			cancelled: 1,
			attended: 4,
			absent: 1,
			unmarked: 1,
		});
		expect((out.report as { noShowRate: number }).noShowRate).toBeCloseTo(1 / 5);
		const list = out.clients as Array<{ client: string; bookings: number; absent: number }>;
		expect(list.map((c) => [c.client, c.bookings, c.absent])).toEqual([
			[ref("ana"), 4, 1],
			[ref("ion"), 3, 0],
		]);
		const few = await a.qry(
			"apiReports:rates",
			{ ...RANGE, byClient: true, minBookings: 4 },
			{ same: true },
		);
		expect((few.clients as unknown[]).length).toBe(1);
	});

	it("clients: both are new in a range with nothing before it, and returning once they had a visit before", async () => {
		expect(await report("apiReports:clients")).toMatchObject({ active: 2, new: 2, returning: 0 });
		const later = await a.qry(
			"apiReports:clients",
			{ from: at(D(6), "00:00"), to: TO, granularity: "week" },
			{ same: true },
		);
		expect(later.report).toMatchObject({ active: 1, new: 0, returning: 1 });
	});

	it("packages: sold, used and remaining, in sessions, with no price", async () => {
		const out = await report("apiReports:packages");
		expect(out).toMatchObject({
			sold: { packages: 1, baseSessions: 3, bonusSessions: 1, byType: { ABA: 1 } },
			used: { base: 1, bonus: 0 },
			remaining: { packages: 1, sessions: 3, overdrawnPackages: 0 },
		});
		expect(JSON.stringify(out)).not.toMatch(/price|minor/i);
	});

	it("funnel: three holds, one request, one turned away and recorded as lapsed", async () => {
		const out = await report("apiReports:funnel");
		expect(out.total).toMatchObject({ started: 3, submitted: 1, booked: 0, pending: 1, lapsed: 1 });
		expect((out.byChannel as Record<string, unknown>).form).toBeDefined();
	});

	it("ratings: the average and distribution, per practitioner; the note without a rating counted apart", async () => {
		const out = await report("apiReports:ratings");
		expect(out.total).toEqual({ count: 2, average: 4, distribution: [0, 0, 1, 0, 1] });
		expect(out.withoutRating).toBe(1);
		expect((out.byPractitioner as Record<string, unknown>)[state.practitioner]).toMatchObject({
			count: 2,
			average: 4,
		});
	});

	it("blacklist hits: the refusal at submit and the callback gate", async () => {
		const out = await report("apiReports:blacklistHits");
		expect(out).toMatchObject({
			total: 2,
			refused: 2,
			overridden: 0,
			byChannel: { callback: 1, form: 1 },
			byMatch: { phone: 2 },
		});
		expect(JSON.stringify(out)).not.toContain("0700");
	});

	it("revenue (money): the ledger, the single sessions paid on the day, the methods, what is still owed", async () => {
		const out = await report("apiReportsMoney:revenue");
		expect(out).toMatchObject({
			total: { paidMinor: 33_000, refundedMinor: 2_000, netMinor: 31_000 },
			sources: { ledger: { netMinor: 18_000 }, visits: { netMinor: 13_000 } },
			byMethod: {
				cash: { paidMinor: 10_000, refundedMinor: 2_000, netMinor: 8_000 },
				card: { netMinor: 23_000 },
			},
			outstanding: {
				packages: { count: 1, minor: 10_000 },
				visits: { count: 2, minor: 15_000 },
				minor: 25_000,
			},
		});
	});

	describe("refusals", () => {
		const names = [
			["apiReports:appointments", { group: "status" }],
			["apiReports:utilisation", {}],
			["apiReports:rates", {}],
			["apiReports:clients", {}],
			["apiReports:packages", {}],
			["apiReports:funnel", {}],
			["apiReports:ratings", {}],
			["apiReports:blacklistHits", {}],
			["apiReportsMoney:revenue", {}],
		] as const;

		it.each(
			names,
		)("%s refuses an empty or reversed range, writing nothing", async (name, extra) => {
			for (const to of [FROM, FROM - 1]) {
				const out = await a.qry(name, { ...RANGE, ...extra, to }, { ok: false, same: true });
				expect(out.reason).toBe("invalid_range");
			}
		});

		it.each(
			names,
		)("%s refuses a range longer than a year and a day, and takes exactly that", async (name, extra) => {
			const long = await a.qry(
				name,
				{ ...RANGE, ...extra, from: at("2026-01-01", "00:00"), to: at("2027-01-03", "00:00") },
				{ ok: false, same: true },
			);
			expect(long.reason).toBe("range_too_long");
			const edge = await a.qry(
				name,
				{ ...RANGE, ...extra, from: at("2026-01-01", "00:00"), to: at("2027-01-02", "00:00") },
				{ same: true },
			);
			expect(edge.ok).toBe(true);
		});

		it.each(names)("%s refuses an app that does not exist", async (name, extra) => {
			const out = await a.qry(name, { ...RANGE, ...extra, tenant: "test-rp-none" }, { ok: false });
			expect(out.reason).toBe("unknown_tenant");
		});

		it.each(names)("%s shows another app none of this app's data", async (name, extra) => {
			const out = await b.qry(name, { ...RANGE, ...extra }, { same: true });
			const text = JSON.stringify(out);
			expect(text).not.toContain(state.practitioner);
			expect(text).not.toContain(ref("ana"));
		});
	});

	it("an empty app reports zeros, not errors", async () => {
		expect(await report("apiReports:appointments", { group: "status" }, b)).toMatchObject({
			total: 0,
			by: {},
		});
		expect(await report("apiReports:rates", {}, b)).toMatchObject({
			bookings: 0,
			cancellationRate: null,
			noShowRate: null,
		});
		expect(await report("apiReportsMoney:revenue", {}, b)).toMatchObject({
			total: { netMinor: 0 },
		});
		expect(await report("apiReports:ratings", {}, b)).toMatchObject({
			total: { count: 0, average: null },
		});
	});
});
