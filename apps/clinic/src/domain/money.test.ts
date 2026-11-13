import { describe, expect, it } from "vitest";
import { formatMoney, moneyInput, parseMoney } from "./money";

describe("parseMoney", () => {
	it.each([
		["0", 0],
		["0,00", 0],
		["1", 100],
		["1350", 135000],
		["1350,50", 135050],
		["1350.5", 135050],
		["1.350,50", 135050],
		["1,350.50", 135050],
		["1 350,5 lei", 135050],
		["1 350 RON", 135000],
		["0,05", 5],
		["12.000", 1200000],
	])("reads %j as %i bani", (text, bani) => {
		expect(parseMoney(text)).toBe(bani);
	});

	it.each([
		"",
		" ",
		"abc",
		"-5",
		"1e3",
		"12,3,4x",
		",5",
		"٣٠٠",
		"💸",
		"9".repeat(30),
	])("refuses %j", (text) => {
		expect(parseMoney(text)).toBeNull();
	});

	it("round-trips what a stored amount shows in each language", () => {
		for (const bani of [0, 5, 100, 135050, 99999999]) {
			expect(parseMoney(moneyInput(bani, "ro"))).toBe(bani);
			expect(parseMoney(moneyInput(bani, "en"))).toBe(bani);
		}
	});

	it("formats lei for the viewer's language", () => {
		expect(formatMoney(135050, "en")).toMatch(/1,350\.50/);
		expect(formatMoney(135050, "ro")).toMatch(/1\.350,50/);
	});
});
