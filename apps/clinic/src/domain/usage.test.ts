import { describe, expect, it } from "vitest";
import { type Appointment, appointmentDefaults } from "../port/schema";
import { consumesSession, packageUsage, paidBani } from "./usage";

const appt = (id: string, date: string, status: Appointment["status"], pk = "k1"): Appointment => ({
	id,
	date,
	startMin: 600,
	durationMin: 50,
	columnId: "p1",
	clientId: "c1",
	title: null,
	serviceId: "s1",
	status,
	note: "",
	...appointmentDefaults(),
	packageId: pk,
});
const pkg = { id: "k1", sessions: 3, bonus: 1 };

describe("paidBani", () => {
	it("is the sum of the ledger, zero when empty", () => {
		expect(paidBani({ payments: [] })).toBe(0);
		const pay = (id: string, amountBani: number) => ({
			id,
			date: "2026-11-01",
			amountBani,
			method: "cash" as const,
			recordedBy: "x",
		});
		expect(paidBani({ payments: [pay("a", 10050), pay("b", 1)] })).toBe(10051);
	});
});

describe("consumesSession", () => {
	it.each([
		["attended", true],
		["no-show", true],
		["confirmed", false],
		["requested", false],
		["cancelled", false],
		["leave", false],
		["medical-leave", false],
	] as const)("%s -> %s", (status, yes) => expect(consumesSession(status)).toBe(yes));
});

describe("packageUsage", () => {
	it("derives used from attended and no-show appointments linked to the package", () => {
		const u = packageUsage(
			pkg,
			[
				appt("a", "2026-11-01", "attended"),
				appt("b", "2026-11-02", "no-show"),
				appt("c", "2026-11-03", "cancelled"),
				appt("d", "2026-11-04", "attended", "other"),
			],
			"2026-11-10",
		);
		expect(u).toMatchObject({
			used: 2,
			usedRegular: 2,
			usedBonus: 0,
			left: 2,
			next: null,
		});
		expect(u.timeline.map((a) => a.id)).toEqual(["a", "b"]);
	});
	it("spends regular sessions first and the bonus after; never below zero left", () => {
		const many = ["a", "b", "c", "d", "e"].map((id, i) =>
			appt(id, `2026-11-0${i + 1}`, "attended"),
		);
		const u = packageUsage(pkg, many, "2026-12-01");
		expect(u).toMatchObject({ used: 5, usedRegular: 3, usedBonus: 1, left: 0 });
	});
	it("used beyond the package: nothing left and the excess is named", () => {
		const five = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
			appt(id, `2026-11-0${i + 1}`, "attended"),
		);
		expect(packageUsage(pkg, five, "2026-12-01")).toMatchObject({
			left: 0,
			overBy: 2,
		});
	});
	it("a bonus-only package works", () => {
		expect(packageUsage({ id: "k1", sessions: 0, bonus: 2 }, [], "2026-11-10")).toMatchObject({
			left: 2,
			overBy: 0,
		});
	});
	it("nothing linked: nothing used, everything left", () => {
		expect(packageUsage(pkg, [], "2026-11-10")).toMatchObject({
			used: 0,
			left: 4,
			next: null,
		});
	});
	it("the next session is the first open one from today on, today included", () => {
		const u = packageUsage(
			pkg,
			[
				appt("z", "2026-11-20", "confirmed"),
				appt("y", "2026-11-10", "requested"),
				appt("x", "2026-11-09", "confirmed"),
			],
			"2026-11-10",
		);
		expect(u.next?.id).toBe("y");
	});
	it("a zero package has nothing left", () => {
		expect(packageUsage({ id: "k1", sessions: 0, bonus: 0 }, [], "2026-11-10").left).toBe(0);
	});
});
