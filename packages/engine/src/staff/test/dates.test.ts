import { describe, expect, it } from "vitest";
import { resolveDatePhrase } from "../dates";

// 2026-11-13 is a Friday.
const TODAY = "2026-11-13";
const day = (phrase: string): string | undefined => {
	const r = resolveDatePhrase(phrase, TODAY);
	return r.ok && r.kind === "day" ? r.date : undefined;
};

describe("relative dates in Romanian and English", () => {
	it.each([
		["azi", "2026-11-13"],
		["astăzi", "2026-11-13"],
		["today", "2026-11-13"],
		["mâine", "2026-11-14"],
		["maine", "2026-11-14"],
		["poimâine", "2026-11-15"],
		["poimaine", "2026-11-15"],
		["ieri", "2026-11-12"],
		["alaltăieri", "2026-11-11"],
		["tomorrow", "2026-11-14"],
	])("%s is %s", (phrase, date) => {
		expect(day(phrase)).toBe(date);
	});

	it.each([
		["joi", "2026-11-19"],
		["Joi", "2026-11-19"],
		["vineri", "2026-11-13"],
		["luni", "2026-11-16"],
		["duminică", "2026-11-15"],
		["la joi", "2026-11-19"],
		["joia viitoare", "2026-11-19"],
		["joia asta", "2026-11-19"],
		["vinerea viitoare", "2026-11-20"],
		["luni viitoare", "2026-11-16"],
		["next friday", "2026-11-20"],
		["next monday", "2026-11-16"],
		["joia trecută", "2026-11-12"],
		["vineri trecută", "2026-11-06"],
		["last friday", "2026-11-06"],
	])("%s is %s", (phrase, date) => {
		expect(day(phrase)).toBe(date);
	});

	it.each([
		["peste 2 zile", "2026-11-15"],
		["peste două zile", "2026-11-15"],
		["peste o săptămână", "2026-11-20"],
		["peste 2 săptămâni", "2026-11-27"],
		["peste 3 saptamani", "2026-12-04"],
		["peste o lună", "2026-12-13"],
		["in 2 weeks", "2026-11-27"],
		["peste 0 zile", "2026-11-13"],
	])("%s is %s", (phrase, date) => {
		expect(day(phrase)).toBe(date);
	});

	it("weeks resolve to Monday through Sunday", () => {
		expect(resolveDatePhrase("săptămâna viitoare", TODAY)).toEqual({
			ok: true,
			kind: "week",
			date: "2026-11-16",
			weekEnd: "2026-11-22",
		});
		expect(resolveDatePhrase("saptamana asta", TODAY)).toEqual({
			ok: true,
			kind: "week",
			date: "2026-11-09",
			weekEnd: "2026-11-15",
		});
		expect(resolveDatePhrase("next week", TODAY)).toMatchObject({ date: "2026-11-16" });
		expect(resolveDatePhrase("săptămâna trecută", TODAY)).toMatchObject({ date: "2026-11-02" });
	});

	it("forgives one typo in a long word", () => {
		expect(day("poimane")).toBe("2026-11-15");
		expect(day("miercuri")).toBe("2026-11-18");
		expect(day("miercurii")).toBe("2026-11-18");
		expect(day("vinery")).toBe("2026-11-13");
	});

	it.each([
		["1 decembrie", "2026-12-01"],
		["5 Decembrie 2026", "2026-12-05"],
		["15 noiembrie", "2026-11-15"],
		["3 ianuarie", "2027-01-03"],
		["1 december", "2026-12-01"],
		["dec 24", "2026-12-24"],
		["29 februarie 2028", "2028-02-29"],
	])("%s is %s", (phrase, date) => {
		expect(day(phrase)).toBe(date);
	});

	it("a day that does not exist is not a date", () => {
		expect(resolveDatePhrase("31 noiembrie", TODAY)).toEqual({ ok: false });
		expect(resolveDatePhrase("30 februarie 2027", TODAY)).toEqual({ ok: false });
	});

	it("passes an ISO date through, and refuses what it cannot read", () => {
		expect(day("2026-12-24")).toBe("2026-12-24");
		for (const phrase of ["", "   ", "banana", "peste mulți ani", "peste 400 zile", "săptămâna"]) {
			expect(resolveDatePhrase(phrase, TODAY)).toEqual({ ok: false });
		}
	});

	it("crosses a month and a year", () => {
		expect(resolveDatePhrase("peste 3 săptămâni", "2026-12-20")).toMatchObject({
			date: "2027-01-10",
		});
		expect(resolveDatePhrase("mâine", "2026-12-31")).toMatchObject({ date: "2027-01-01" });
	});
});
