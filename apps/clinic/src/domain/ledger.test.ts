import { describe, expect, it } from "vitest";
import { ledger, sessionsLeft } from "./ledger";

describe("ledger: total, paid, remaining", () => {
	it("nothing paid: the whole price is owed", () => {
		expect(ledger(135000, 0)).toEqual({
			totalBani: 135000,
			paidBani: 0,
			remainingBani: 135000,
			state: "unpaid",
		});
	});
	it("a free package with nothing paid is settled, not unpaid", () => {
		expect(ledger(0, 0).state).toBe("paid");
	});
	it("part paid: the rest is owed", () => {
		expect(ledger(135000, 35000)).toMatchObject({ remainingBani: 100000, state: "partial" });
	});
	it("one ban short is still partial; exact is paid", () => {
		expect(ledger(100, 99)).toMatchObject({ remainingBani: 1, state: "partial" });
		expect(ledger(100, 100)).toMatchObject({ remainingBani: 0, state: "paid" });
	});
	it("overpaid: a credit, shown as negative remaining and never as debt", () => {
		expect(ledger(100, 101)).toMatchObject({ remainingBani: -1, state: "overpaid" });
	});
	it("holds at the largest amounts without floating-point drift", () => {
		expect(ledger(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1).remainingBani).toBe(1);
	});
});

describe("sessionsLeft", () => {
	it("counts bonus sessions", () => expect(sessionsLeft(10, 1, 3)).toBe(8));
	it("never goes below zero", () => expect(sessionsLeft(5, 0, 9)).toBe(0));
	it("is zero when nothing was bought", () => expect(sessionsLeft(0, 0, 0)).toBe(0));
});
