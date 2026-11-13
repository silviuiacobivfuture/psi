import { describe, expect, it } from "vitest";
import { normalizedIdentifiers, normalizeEmail, normalizePhone } from "../clinic/identifiers";

describe("normalizePhone: E.164, Romania first", () => {
	it.each([
		["0748 017 752", "+40748017752"],
		["0748-017-752", "+40748017752"],
		["0748.017.752", "+40748017752"],
		["+40 748 017 752", "+40748017752"],
		["+40748017752", "+40748017752"],
		["0040748017752", "+40748017752"],
		["0040 748 017 752", "+40748017752"],
		["40748017752", "+40748017752"],
		["748017752", "+40748017752"],
		["+40 (0)748 017 752", "+40748017752"],
		["  0748017752  ", "+40748017752"],
		["0236 123 456", "+40236123456"],
		["0800 123 456", "+40800123456"],
		["+49 30 1234567", "+49301234567"],
		["0049301234567", "+49301234567"],
		["+1 (415) 555-2671", "+14155552671"],
	])("%s -> %s", (raw, expected) => {
		expect(normalizePhone(raw)).toBe(expected);
	});

	it("is idempotent: a normalised number normalises to itself", () => {
		for (const raw of ["0748 017 752", "+49 30 1234567", "0040748017752"]) {
			const once = normalizePhone(raw);
			expect(once).toBeDefined();
			expect(normalizePhone(once ?? "")).toBe(once);
		}
	});

	it.each([
		"",
		"   ",
		"abc",
		"0748 abc 752",
		"07480177",
		"07480177521",
		"+40 148 017 752",
		"+40 74801775",
		"+407480177521",
		"+0 123 456 789",
		"+1234567",
		"+1234567890123456",
		"0748/017/752",
		"12345",
		"4074801775",
	])("refuses %j", (raw) => {
		expect(normalizePhone(raw)).toBeUndefined();
	});

	it("handles unicode digits and letters by refusing them", () => {
		expect(normalizePhone("０７４８０１７７５２")).toBeUndefined();
		expect(normalizePhone("07४8017752")).toBeUndefined();
	});
});

describe("normalizeEmail", () => {
	it("lower-cases and trims", () => {
		expect(normalizeEmail("  Ana.Pop@Example.RO ")).toBe("ana.pop@example.ro");
	});
	it.each([
		"",
		"ana",
		"ana@",
		"@x.ro",
		"ana@x",
		"a b@x.ro",
		`${"a".repeat(250)}@x.ro`,
	])("refuses %j", (raw) => expect(normalizeEmail(raw)).toBeUndefined());
});

describe("normalizedIdentifiers", () => {
	it("keeps only what normalises, once each, sorted", () => {
		expect(
			normalizedIdentifiers({
				phones: ["0748 017 752", "+40748017752", "junk", undefined, "0722 000 111"],
				emails: ["A@X.ro", "a@x.ro", "not-an-email", undefined],
			}),
		).toEqual({ phones: ["+40722000111", "+40748017752"], emails: ["a@x.ro"] });
	});
	it("is empty for nothing", () => {
		expect(normalizedIdentifiers({})).toEqual({ phones: [], emails: [] });
	});
});
