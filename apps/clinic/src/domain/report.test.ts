import { describe, expect, it } from "vitest";
import {
	type Appointment,
	appointmentDefaults,
	type Client,
	type Column,
	type Package,
	type RosterEntry,
	type Service,
	type WebRequest,
} from "../port/schema";
import { figuresFor, type ReportInput, snapshotFor } from "./report";

const col = (id: string, kind: Column["kind"]): Column => ({ id, kind, name: id, colour: 1 });
const svc: Service = { id: "s1", name: "Ședință", durationMin: 60, priceBani: 20000 };
const client = (id: string): Client => ({
	id,
	name: id,
	guardian: null,
	phone: null,
	email: null,
	status: "current",
	note: "",
	practitionerId: null,
});
let n = 0;
const appt = (p: Partial<Appointment> & Pick<Appointment, "date" | "startMin">): Appointment => ({
	...appointmentDefaults(),
	id: `a${++n}`,
	durationMin: 60,
	columnId: "p1",
	clientId: "c1",
	title: null,
	serviceId: "s1",
	status: "confirmed",
	note: "",
	...p,
});

const base = (appointments: Appointment[], extra: Partial<ReportInput> = {}): ReportInput => ({
	today: "2026-11-18",
	appointments,
	clients: [client("c1"), client("c2")],
	services: [svc],
	columns: [col("p1", "person"), col("p2", "person"), col("r1", "room")],
	packages: [],
	requests: [],
	roster: [],
	...extra,
});

describe("a period's figures", () => {
	it("counts visits that stand, separately from the cancelled, and ignores leave", () => {
		const f = figuresFor(
			base([
				appt({ date: "2026-11-16", startMin: 540, status: "attended" }),
				appt({ date: "2026-11-16", startMin: 600, status: "no-show" }),
				appt({ date: "2026-11-17", startMin: 540, status: "cancelled" }),
				appt({ date: "2026-11-17", startMin: 660, status: "leave", clientId: null }),
				appt({ date: "2026-11-30", startMin: 540 }),
			]),
			"2026-11-16",
			"2026-11-22",
		);
		expect(f).toMatchObject({
			appointments: 2,
			attended: 1,
			noShow: 1,
			cancelled: 1,
			bookedMin: 120,
		});
		expect(f.byDay.map((d) => d.appointments)).toEqual([2, 0, 0, 0, 0, 0, 0]);
		expect(f.byDay[1]?.cancelled).toBe(1);
	});
	it("tells new clients from returning ones by their first visit", () => {
		const f = figuresFor(
			base([
				appt({ date: "2026-10-01", startMin: 540, clientId: "c1" }),
				appt({ date: "2026-11-16", startMin: 540, clientId: "c1" }),
				appt({ date: "2026-11-16", startMin: 600, clientId: "c2" }),
			]),
			"2026-11-16",
			"2026-11-22",
		);
		expect(f.newClients).toBe(1);
		expect(f.returningClients).toBe(1);
	});
	it("puts a visit in its weekday and hour, and in its room, service and person", () => {
		const f = figuresFor(
			base([appt({ date: "2026-11-18", startMin: 9 * 60 + 30, resourceIds: ["r1"] })]),
			"2026-11-16",
			"2026-11-22",
		);
		expect(f.heat[2]?.[9]).toBe(1);
		expect(f.heat.flat().reduce((a, b) => a + b, 0)).toBe(1);
		expect(f.byRoom.find((r) => r.id === "r1")?.appointments).toBe(1);
		expect(f.byService[0]).toMatchObject({ id: "s1", appointments: 1 });
		expect(f.byPerson[0]).toMatchObject({ id: "p1", appointments: 1 });
	});
	it("narrows every figure to one person, and keeps the other person's out", () => {
		const input = base([
			appt({ date: "2026-11-16", startMin: 540, columnId: "p1" }),
			appt({ date: "2026-11-16", startMin: 600, columnId: "p2" }),
		]);
		expect(figuresFor(input, "2026-11-16", "2026-11-16", "p2").appointments).toBe(1);
		expect(figuresFor(input, "2026-11-16", "2026-11-16", "p2").capacityMin).toBe(480);
		expect(figuresFor(input, "2026-11-16", "2026-11-16").capacityMin).toBe(960);
	});
	it("capacity follows the roster day by day: leave is none, an unrostered weekday is a default day, a weekend is none", () => {
		const roster: RosterEntry[] = [
			{ personId: "p1", date: "2026-11-16", kind: "work", fromMin: 600, toMin: 840 },
			{ personId: "p1", date: "2026-11-17", kind: "leave", fromMin: null, toMin: null },
		];
		const f = figuresFor(
			base([], { roster, columns: [col("p1", "person")] }),
			"2026-11-16",
			"2026-11-22",
		);
		// Monday rostered 4 h, Tuesday leave, Wednesday to Friday default 8 h each, the weekend none.
		expect(f.capacityMin).toBe(240 + 3 * 480);
	});
	it("revenue is the ledger's payments in the period plus sessions paid outright, never a package's sessions twice", () => {
		const pkg: Package = {
			id: "k1",
			clientId: "c1",
			name: "Abonament",
			sessions: 5,
			bonus: 0,
			totalBani: 100000,
			note: "",
			payments: [
				{ id: "y1", date: "2026-11-17", amountBani: 50000, method: "card", recordedBy: "x" },
				{ id: "y2", date: "2026-10-01", amountBani: 10000, method: "cash", recordedBy: "x" },
			],
		};
		const f = figuresFor(
			base(
				[
					appt({ date: "2026-11-16", startMin: 540, paidMethod: "cash", priceBani: 20000 }),
					appt({
						date: "2026-11-16",
						startMin: 600,
						paidMethod: "cash",
						priceBani: 20000,
						packageId: "k1",
					}),
					appt({ date: "2026-11-16", startMin: 660, paidMethod: null, priceBani: 20000 }),
				],
				{ packages: [pkg] },
			),
			"2026-11-16",
			"2026-11-22",
		);
		expect(f.revenueBani).toBe(70000);
	});
	it("counts web requests of the period and those handled", () => {
		const r = (id: string, receivedAt: string, handled: boolean): WebRequest => ({
			id,
			receivedAt,
			name: id,
			phone: "",
			service: "",
			message: "",
			handled,
		});
		const f = figuresFor(
			base([], {
				requests: [
					r("w1", "2026-11-16T09:00:00", true),
					r("w2", "2026-11-17T09:00:00", false),
					r("w3", "2026-10-01T09:00:00", true),
				],
			}),
			"2026-11-16",
			"2026-11-22",
		);
		expect(f).toMatchObject({ requests: 2, requestsConverted: 1 });
	});
	it("an empty period is zeros, not a failure", () => {
		const f = figuresFor(base([]), "2026-11-16", "2026-11-16");
		expect(f).toMatchObject({ appointments: 0, cancelled: 0, newClients: 0, revenueBani: 0 });
		expect(f.byService).toEqual([]);
	});
});

describe("the snapshot", () => {
	it("is today, this week and this month, and the packages with sessions left", () => {
		const pkg = (id: string, sessions: number): Package => ({
			id,
			clientId: "c1",
			name: id,
			sessions,
			bonus: 0,
			totalBani: 0,
			note: "",
			payments: [],
		});
		const s = snapshotFor(
			base(
				[
					appt({ date: "2026-11-18", startMin: 540 }),
					appt({ date: "2026-11-20", startMin: 540 }),
					appt({ date: "2026-11-02", startMin: 540 }),
					appt({ date: "2026-11-18", startMin: 600, status: "cancelled" }),
					appt({ date: "2026-11-10", startMin: 540, status: "attended", packageId: "k2" }),
					appt({ date: "2026-11-11", startMin: 540, status: "attended", packageId: "k2" }),
				],
				{ packages: [pkg("k1", 10), pkg("k2", 2), pkg("k3", 3)] },
			),
		);
		expect(s).toMatchObject({ today: 1, week: 2, month: 5 });
		// k2 is used up; k1 and k3 are active; k3 has 3 left and k1 has 10 left: none "ending" except by <= 2.
		expect(s.packagesActive).toBe(2);
		expect(s.packagesEnding).toBe(0);
	});
});
