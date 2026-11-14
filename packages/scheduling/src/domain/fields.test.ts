import { describe, expect, it } from "vitest";
import {
	AgeSchema,
	DetailsSchema,
	EmailSchema,
	NameSchema,
	normalisePhone,
	PhoneSchema,
} from "./fields";

const message = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
	result.error?.issues[0]?.message;

describe("name", () => {
	it("accepts letters of any script, diacritics, hyphens, apostrophes and single spaces", () => {
		for (const ok of [
			"Ana",
			"Ștefan Țurcanu",
			"Maria-Elena O'Brien",
			"Zoë Müller",
			"李 雷",
			"Ana  Pop",
		]) {
			expect(NameSchema.safeParse(ok).success, ok).toBe(true);
		}
		expect(NameSchema.parse("  Ana   Pop ")).toBe("Ana Pop");
	});
	it("refuses empty, one letter, digits, symbols and a leading hyphen", () => {
		for (const bad of ["", " ", "A", "Ana 2", "Ana@", "-Ana", "<b>x</b>"]) {
			expect(message(NameSchema.safeParse(bad)), bad).toBe("name");
		}
	});
	it("has its edges at 2 and 100 characters", () => {
		expect(NameSchema.safeParse("Al").success).toBe(true);
		expect(NameSchema.safeParse("a".repeat(100)).success).toBe(true);
		expect(NameSchema.safeParse("a".repeat(101)).success).toBe(false);
	});
});

describe("age", () => {
	it("accepts whole years 0 to 120 and returns a number", () => {
		expect(AgeSchema.parse("0")).toBe(0);
		expect(AgeSchema.parse(" 7 ")).toBe(7);
		expect(AgeSchema.parse("120")).toBe(120);
	});
	it("refuses empty, negative, fractional, 121, letters and long digits", () => {
		for (const bad of ["", "-1", "1.5", "121", "abc", "1000", "0x10", "٣"]) {
			expect(message(AgeSchema.safeParse(bad)), bad).toBe("age");
		}
	});
});

describe("details", () => {
	it("has its edges at 10 and 2000 characters, trimmed", () => {
		expect(DetailsSchema.safeParse("x".repeat(9)).success).toBe(false);
		expect(DetailsSchema.safeParse("x".repeat(10)).success).toBe(true);
		expect(DetailsSchema.safeParse("x".repeat(2000)).success).toBe(true);
		expect(DetailsSchema.safeParse("x".repeat(2001)).success).toBe(false);
		expect(DetailsSchema.safeParse(`  ${"x".repeat(9)}  `).success).toBe(false);
		expect(message(DetailsSchema.safeParse(""))).toBe("details");
	});
	it("keeps unicode and line breaks (normalised to \\n)", () => {
		expect(DetailsSchema.parse("Copilul meu e agitat\r\nși nu doarme bine")).toBe(
			"Copilul meu e agitat\nși nu doarme bine",
		);
	});
});

describe("phone", () => {
	it("normalises Romanian national, 0040, +40 and spaced forms to E.164", () => {
		for (const [input, e164] of [
			["0722 123 456", "+40722123456"],
			["0722-123-456", "+40722123456"],
			["(0722) 123 456", "+40722123456"],
			["0040722123456", "+40722123456"],
			["+40 722 123 456", "+40722123456"],
			["0213121212", "+40213121212"],
			["+44 20 7946 0958", "+442079460958"],
			["+1 (415) 555-2671", "+14155552671"],
		] as const) {
			expect(normalisePhone(input), input).toBe(e164);
		}
	});
	it("refuses empty, short, letters, a wrong Romanian length and a bad national prefix", () => {
		for (const bad of [
			"",
			"072212345",
			"07221234567",
			"+4072212345",
			"+40722123456789",
			"0122123456",
			"abc",
			"+0123456789",
			"+12345",
			"0722 123 45a",
		]) {
			expect(normalisePhone(bad), bad).toBeUndefined();
			expect(message(PhoneSchema.safeParse(bad)), bad).toBe("phone");
		}
	});
});

describe("e-mail", () => {
	it("lower-cases and trims", () => {
		expect(EmailSchema.parse("  Ana.Pop@Example.RO ")).toBe("ana.pop@example.ro");
	});
	it("refuses empty, no @, no domain dot, spaces and 121 characters", () => {
		for (const bad of [
			"",
			"ana",
			"ana@",
			"ana@example",
			"a na@example.ro",
			`${"a".repeat(110)}@example.ro`,
		]) {
			expect(EmailSchema.safeParse(bad).success, bad).toBe(false);
		}
		expect(EmailSchema.safeParse(`${"a".repeat(100)}@example.ro`).success).toBe(true);
	});
	it("names the domain a common typo probably meant", () => {
		for (const [typo, meant] of [
			["ana@gmial.com", "gmail.com"],
			["ana@GMAIL.CON", "gmail.com"],
			["ana@yahooo.com", "yahoo.com"],
			["ana@hotmial.com", "hotmail.com"],
			["ana@outlok.com", "outlook.com"],
		] as const) {
			const result = EmailSchema.safeParse(typo);
			expect(result.success, typo).toBe(false);
			expect(message(result), typo).toBe(`typo:${meant}`);
		}
		expect(EmailSchema.safeParse("ana@gmail.com").success).toBe(true);
	});
});
