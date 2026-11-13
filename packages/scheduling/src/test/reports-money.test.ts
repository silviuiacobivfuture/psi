import { describe, expect, it } from "vitest";
import { blacklistHitsReport } from "../clinic/reports/blacklist-hits";
import { funnelReport } from "../clinic/reports/funnel";
import { packagesReport } from "../clinic/reports/packages";
import { permissionOf, REPORTS } from "../clinic/reports/permissions";
import { ratingsReport } from "../clinic/reports/ratings";
import { revenueReport } from "../clinic/reports/revenue";
import type { ReportPackage, ReportPayment, ReportVisitMoney } from "../clinic/reports/types";
import { isPermissionKey, permissionKey } from "../permissions";
import { at, days, entry } from "./reports-fixtures";

const range = days("2026-11-02", "2026-11-15");
const NOW = at("2026-11-16", "09:00");
const inRange = at("2026-11-04", "10:00");

const pay = (amountMinor: number, over: Partial<ReportPayment> = {}): ReportPayment => ({
	id: `pay${amountMinor}${Math.random()}`,
	client: "c1",
	amountMinor,
	at: inRange,
	method: "cash",
	...over,
});
const pkg = (id: string, over: Partial<ReportPackage> = {}): ReportPackage => ({
	id,
	client: "c1",
	sessionType: "ABA",
	totalSessions: 10,
	bonusSessions: 2,
	priceMinor: 100_000,
	createdAt: inRange,
	...over,
});
const vm = (over: Partial<ReportVisitMoney> = {}): ReportVisitMoney => ({
	id: "v",
	start: inRange,
	status: "confirmed",
	...over,
});

describe("revenueReport", () => {
	it("is zero for nothing, in every method and bucket", () => {
		const out = revenueReport([], [], [], range, "week", NOW);
		expect(out.total).toEqual({ paidMinor: 0, refundedMinor: 0, netMinor: 0 });
		expect(out.byMethod.cash).toEqual({ paidMinor: 0, refundedMinor: 0, netMinor: 0 });
		expect(out.outstanding).toEqual({
			packages: { count: 0, minor: 0 },
			visits: { count: 0, minor: 0 },
			minor: 0,
		});
		expect(out.buckets.map((b) => b.bucket)).toEqual(["2026-11-02", "2026-11-09"]);
	});

	it("one payment is paid, by its method, in its bucket", () => {
		const out = revenueReport([pay(50_000, { method: "card" })], [], [], range, "day", NOW);
		expect(out.total).toEqual({ paidMinor: 50_000, refundedMinor: 0, netMinor: 50_000 });
		expect(out.byMethod.card.netMinor).toBe(50_000);
		expect(out.buckets.find((b) => b.bucket === "2026-11-04")?.paidMinor).toBe(50_000);
	});

	it("many payments by cash, card, transfer and no method; a refund is kept apart and nets off", () => {
		const out = revenueReport(
			[
				pay(10_000),
				pay(20_000, { method: "card" }),
				pay(30_000, { method: "transfer" }),
				pay(5_000, { method: undefined }),
				pay(-4_000, { method: "cash" }),
			],
			[],
			[],
			range,
			"month",
			NOW,
		);
		expect(out.total).toEqual({ paidMinor: 65_000, refundedMinor: 4_000, netMinor: 61_000 });
		expect(out.byMethod.cash).toEqual({ paidMinor: 10_000, refundedMinor: 4_000, netMinor: 6_000 });
		expect(out.byMethod.unknown.paidMinor).toBe(5_000);
		expect(out.sources.ledger.netMinor).toBe(61_000);
	});

	it("range edges: money at the first instant is in, at `to` is out", () => {
		const out = revenueReport(
			[pay(1, { at: range.from }), pay(2, { at: range.to }), pay(4, { at: range.from - 1 })],
			[],
			[],
			range,
			"day",
			NOW,
		);
		expect(out.total.netMinor).toBe(1);
	});

	it("a single session paid on the visit counts, once; a package's visit does not (its ledger does)", () => {
		const out = revenueReport(
			[],
			[],
			[
				vm({ amountPaidMinor: 8_000, paymentMethod: "cash" }),
				vm({ amountPaidMinor: 8_000, package: "pk1" }),
				vm({ amountPaidMinor: 8_000, status: "cancelled" }),
				vm({ amountPaidMinor: 0 }),
			],
			range,
			"day",
			NOW,
		);
		expect(out.total.netMinor).toBe(8_000);
		expect(out.sources).toEqual({
			ledger: { paidMinor: 0, refundedMinor: 0, netMinor: 0 },
			visits: { paidMinor: 8_000, refundedMinor: 0, netMinor: 8_000 },
		});
	});

	it("outstanding: a package owes its price less its ledger, however it was paid; a paid or overpaid package owes nothing", () => {
		const packages = [
			pkg("a", { priceMinor: 100_000 }),
			pkg("b", { priceMinor: 50_000 }),
			pkg("c", { priceMinor: 20_000 }),
			pkg("old", { createdAt: range.from - 1 }),
		];
		const payments = [
			pay(30_000, { package: "a" }),
			pay(20_000, { package: "a", at: range.to + 5 }),
			pay(50_000, { package: "b" }),
			pay(25_000, { package: "c" }),
		];
		const out = revenueReport(payments, packages, [], range, "day", NOW);
		expect(out.outstanding.packages).toEqual({ count: 1, minor: 50_000 });
	});

	it("outstanding: a priced, confirmed, started visit outside a package owes its price less what was paid", () => {
		const out = revenueReport(
			[],
			[],
			[
				vm({ priceMinor: 10_000, amountPaidMinor: 4_000 }),
				vm({ priceMinor: 10_000, amountPaidMinor: 10_000 }),
				vm({ priceMinor: 10_000, package: "pk" }),
				vm({ priceMinor: 10_000, status: "cancelled" }),
				vm({ priceMinor: 10_000, start: NOW + 1 }),
				vm({ priceMinor: 10_000 }),
			],
			days("2026-11-02", "2026-11-30"),
			"day",
			NOW,
		);
		expect(out.outstanding.visits).toEqual({ count: 2, minor: 16_000 });
		expect(out.outstanding.minor).toBe(16_000);
	});

	it("is only money: it is the one report that needs the money key", () => {
		expect(permissionOf("revenue")).toEqual({
			resource: "reports",
			action: "view",
			scope: "all",
			fieldGroup: "money",
		});
		const money = (Object.keys(REPORTS) as Array<keyof typeof REPORTS>).filter(
			(r) => REPORTS[r] === "money",
		);
		expect(money).toEqual(["revenue"]);
		for (const report of Object.keys(REPORTS) as Array<keyof typeof REPORTS>) {
			expect(isPermissionKey(permissionKey(permissionOf(report)))).toBe(true);
		}
	});
});

describe("packagesReport", () => {
	const used = (date: string, id: string, over = {}) =>
		entry(date, "09:00", "10:00", {
			id,
			package: id.split("-")[0],
			attendance: "attended",
			creditType: "base",
			...over,
		});

	it("is zero for nothing", () => {
		expect(packagesReport([], [], range, "week", NOW)).toEqual({
			sold: { packages: 0, baseSessions: 0, bonusSessions: 0, byType: {} },
			used: {
				base: 0,
				bonus: 0,
				buckets: [
					{ bucket: "2026-11-02", base: 0, bonus: 0 },
					{ bucket: "2026-11-09", base: 0, bonus: 0 },
				],
			},
			remaining: { packages: 0, sessions: 0, overdrawnPackages: 0, overdrawnSessions: 0 },
		});
	});

	it("counts packages sold in the range by type, with their sessions, and carries no price", () => {
		const out = packagesReport(
			[
				pkg("a"),
				pkg("b", { sessionType: "NFB", totalSessions: 5, bonusSessions: 0 }),
				pkg("old", { createdAt: range.from - 1 }),
			],
			[],
			range,
			"day",
			NOW,
		);
		expect(out.sold).toEqual({
			packages: 2,
			baseSessions: 15,
			bonusSessions: 2,
			byType: { ABA: 1, NFB: 1 },
		});
		expect(JSON.stringify(out)).not.toContain("price");
	});

	it("counts sessions used in the range by credit type: past and not absent; not future, not cancelled", () => {
		const visits = [
			used("2026-11-03", "a-1"),
			used("2026-11-04", "a-2", { creditType: "bonus" }),
			used("2026-11-05", "a-3", { attendance: "absent" }),
			used("2026-11-06", "a-4", { status: "cancelled" }),
			used("2026-11-20", "a-5", { attendance: "pending" }),
			used("2026-10-20", "a-6"),
			used("2026-11-10", "a-7", { source: "web", attendance: undefined }),
		];
		const out = packagesReport([pkg("a")], visits, range, "week", NOW);
		expect(out.used.base).toBe(1);
		expect(out.used.bonus).toBe(1);
		expect(out.used.buckets).toEqual([
			{ bucket: "2026-11-02", base: 1, bonus: 1 },
			{ bucket: "2026-11-09", base: 0, bonus: 0 },
		]);
	});

	it("remaining is over every package, as of now; an overdrawn package is counted, never clamped away", () => {
		const packages = [
			pkg("a", { totalSessions: 3, bonusSessions: 1 }),
			pkg("b", { totalSessions: 1, bonusSessions: 0 }),
			pkg("c", { totalSessions: 2, bonusSessions: 0, createdAt: range.from - 1 }),
		];
		const visits = [
			used("2026-11-03", "a-1"),
			used("2026-11-04", "b-1"),
			used("2026-11-05", "b-2"),
			used("2026-11-06", "b-3"),
			used("2026-09-01", "c-1"),
			used("2026-09-02", "c-2"),
		];
		const out = packagesReport(packages, visits, range, "day", NOW);
		expect(out.remaining).toEqual({
			packages: 1,
			sessions: 3,
			overdrawnPackages: 1,
			overdrawnSessions: 2,
		});
	});
});

describe("funnelReport", () => {
	const row = (over = {}) => ({
		created: inRange,
		channel: "form" as const,
		status: "held" as const,
		...over,
	});

	it("is zero with null rates for nothing", () => {
		const out = funnelReport([], range, "day");
		expect(out.total).toEqual({
			started: 0,
			submitted: 0,
			booked: 0,
			declined: 0,
			cancelled: 0,
			pending: 0,
			lapsed: 0,
			submitRate: null,
			requestToBooked: null,
		});
		expect(out.byChannel).toEqual({});
	});

	it("one visitor who held, requested and was booked", () => {
		const out = funnelReport([row({ status: "confirmed", submittedAt: inRange })], range, "day");
		expect(out.total).toMatchObject({
			started: 1,
			submitted: 1,
			booked: 1,
			submitRate: 1,
			requestToBooked: 1,
		});
	});

	it("many, by channel: request to booked is booked over submitted", () => {
		const rows = [
			row({ status: "confirmed", submittedAt: inRange }),
			row({ status: "confirmed", submittedAt: inRange, channel: "guide" }),
			row({ status: "declined", submittedAt: inRange }),
			row({ status: "cancelled", submittedAt: inRange }),
			row({ status: "requested", submittedAt: inRange, channel: "guide" }),
			row({ status: "cancelled" }),
			row({ status: "expired" }),
			row({ status: "held" }),
		];
		const out = funnelReport(rows, range, "week");
		expect(out.total).toEqual({
			started: 8,
			submitted: 5,
			booked: 2,
			declined: 1,
			cancelled: 1,
			pending: 1,
			lapsed: 2,
			submitRate: 5 / 8,
			requestToBooked: 2 / 5,
		});
		expect(out.byChannel.form).toMatchObject({ started: 6, submitted: 3, booked: 1 });
		expect(out.byChannel.guide).toMatchObject({
			started: 2,
			submitted: 2,
			booked: 1,
			requestToBooked: 0.5,
		});
		expect(out.buckets).toEqual([
			{ bucket: "2026-11-02", started: 8, submitted: 5, booked: 2 },
			{ bucket: "2026-11-09", started: 0, submitted: 0, booked: 0 },
		]);
	});

	it("staff-made entries are not a funnel, and the range is by the time of the hold, edges included", () => {
		const rows = [
			row({ channel: "staff" }),
			row({ created: range.from }),
			row({ created: range.to }),
			row({ created: range.from - 1 }),
		];
		expect(funnelReport(rows, range, "day").total.started).toBe(1);
	});
});

describe("ratingsReport", () => {
	const fb = (over = {}) => ({
		kind: "appointment_rating",
		rating: 5,
		createdAt: inRange,
		status: "new",
		...over,
	});

	it("is zero, average null, for nothing", () => {
		const out = ratingsReport([], range, "week");
		expect(out.total).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
		expect(out.withoutRating).toBe(0);
	});

	it("one rating is its own average", () => {
		expect(ratingsReport([fb({ rating: 3 })], range, "day").total).toEqual({
			count: 1,
			average: 3,
			distribution: [0, 0, 1, 0, 0],
		});
	});

	it("many: average, distribution, per kind, per practitioner, per bucket; items without a rating counted apart", () => {
		const items = [
			fb({ rating: 5, practitioner: "p1" }),
			fb({ rating: 4, practitioner: "p1" }),
			fb({ rating: 1, practitioner: "p2", createdAt: at("2026-11-10", "10:00") }),
			fb({ kind: "general", rating: 2 }),
			fb({ kind: "complaint", rating: undefined, status: "closed" }),
			fb({ rating: 3, createdAt: range.to }),
		];
		const out = ratingsReport(items, range, "week");
		expect(out.total).toEqual({ count: 4, average: 3, distribution: [1, 1, 0, 1, 1] });
		expect(out.withoutRating).toBe(1);
		expect(out.byStatus).toEqual({ closed: 1, new: 4 });
		expect(out.byKind.general).toMatchObject({ count: 1, average: 2 });
		expect(out.byPractitioner.p1).toMatchObject({ count: 2, average: 4.5 });
		expect(out.byPractitioner.p2).toMatchObject({ count: 1, average: 1 });
		expect(out.buckets.map((b) => [b.bucket, b.count])).toEqual([
			["2026-11-02", 3],
			["2026-11-09", 1],
		]);
	});

	it("ignores a rating outside 1 to 5 rather than counting it", () => {
		expect(ratingsReport([fb({ rating: 9 }), fb({ rating: 0 })], range, "day").total).toEqual({
			count: 0,
			average: null,
			distribution: [0, 0, 0, 0, 0],
		});
	});
});

describe("blacklistHitsReport", () => {
	const ev = (over = {}) => ({
		at: inRange,
		kind: "online_refused" as const,
		entry: "e1",
		severity: "block_online",
		category: "unpaid",
		matchedBy: "phone",
		channel: "form",
		...over,
	});

	it("is zero for nothing", () => {
		const out = blacklistHitsReport([], range, "day");
		expect(out).toMatchObject({
			total: 0,
			refused: 0,
			overridden: 0,
			topEntries: [],
			bySeverity: {},
		});
	});

	it("counts refusals and overrides, by every dimension, and the entries hit most", () => {
		const events = [
			ev(),
			ev(),
			ev({ entry: "e2", channel: "callback", matchedBy: "email", severity: "block_all" }),
			ev({
				kind: "overridden",
				entry: "e2",
				channel: "staff",
				authority: "staff",
				at: at("2026-11-10", "10:00"),
			}),
			ev({ at: range.to }),
			ev({ at: range.from - 1 }),
		];
		const out = blacklistHitsReport(events, range, "week");
		expect(out).toMatchObject({ total: 4, refused: 3, overridden: 1 });
		expect(out.bySeverity).toEqual({ block_all: 1, block_online: 3 });
		expect(out.byChannel).toEqual({ callback: 1, form: 2, staff: 1 });
		expect(out.byMatch).toEqual({ email: 1, phone: 3 });
		expect(out.byAuthority).toEqual({ staff: 1 });
		expect(out.topEntries).toEqual([
			{ entry: "e1", hits: 2 },
			{ entry: "e2", hits: 2 },
		]);
		expect(out.buckets).toEqual([
			{ bucket: "2026-11-02", refused: 3, overridden: 0 },
			{ bucket: "2026-11-09", refused: 0, overridden: 1 },
		]);
	});

	it("keeps the ten most-hit entries, ties by id", () => {
		const events = Array.from({ length: 12 }, (_, i) =>
			ev({ entry: `e${String(i).padStart(2, "0")}` }),
		);
		const out = blacklistHitsReport(events, range, "day");
		expect(out.topEntries).toHaveLength(10);
		expect(out.topEntries[0]).toEqual({ entry: "e00", hits: 1 });
	});

	it("carries only counts, ids and categories: no reason, contact or name", () => {
		const out = blacklistHitsReport([ev()], range, "day");
		expect(Object.keys(out).sort()).toEqual(
			[
				"bySeverity",
				"byCategory",
				"byChannel",
				"byMatch",
				"byAuthority",
				"buckets",
				"overridden",
				"refused",
				"topEntries",
				"total",
			].sort(),
		);
		expect(Object.keys(out.topEntries[0] ?? {}).sort()).toEqual(["entry", "hits"]);
	});
});
