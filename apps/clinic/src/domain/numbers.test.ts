import { describe, expect, it } from "vitest";
import { parseAmountOrZero, parseCount, safeCount } from "./numbers";

describe("parseCount", () => {
	it.each([
		["", 0],
		["  ", 0],
		["0", 0],
		["7", 7],
		["999", 999],
		[" 12 ", 12],
	])("%j -> %j", (i, n) => expect(parseCount(i)).toBe(n));
	it.each(["abc", "-1", "1.5", "1,5", "1000", "NaN", "Infinity", "💸", "1e3"])("refuses %j", (i) =>
		expect(parseCount(i)).toBeNull());
});

describe("parseAmountOrZero (live typing)", () => {
	it.each([
		["", 0],
		["1", 100],
		["1,", 100],
		["1,5", 150],
		["1.350,50", 135050],
	])("%j -> %j", (i, n) => expect(parseAmountOrZero(i)).toBe(n));
	it.each(["abc", "-3", ",", "NaN", "Infinity"])("refuses %j", (i) =>
		expect(parseAmountOrZero(i)).toBeNull());
});

describe("safeCount", () => {
	it.each([
		[Number.NaN, 0],
		[Number.POSITIVE_INFINITY, 0],
		[-3, 0],
		[2.9, 2],
		[5, 5],
	])("%j -> %j", (n, out) => expect(safeCount(n)).toBe(out));
});
