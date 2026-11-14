import { describe, expect, it } from "vitest";
import type { BookingDetailsReport, DetailField } from "../booking-state";
import { asking, chosen, say, sayKind, store } from "./booking-fixture";

/**
 * Every mandatory field, answered the way the guide asks for it: the value taken is the one the
 * booking form's own rules accept, and anything else is named as the problem and kept out.
 */

async function answer(field: DetailField, typed: string): Promise<BookingDetailsReport> {
	const port = store();
	const picked = await chosen(port);
	const next = await say(port, typed.slice(0, 1000), asking(picked, field), { typed });
	if (next?.details === undefined) throw new Error(`"${typed.slice(0, 20)}" left the details step`);
	return next.details;
}

const long = (length: number): string =>
	"Abcdefghij "
		.repeat(Math.ceil(length / 11))
		.slice(0, length)
		.trim();
const word = (n: number): string => "a".repeat(n);

describe("name", () => {
	it.each([
		["Ana Pop", "Ana Pop"],
		["ion popescu", "ion popescu"],
		["Al", "Al"],
		["Ștefan Țurcanu-Ionescu", "Ștefan Țurcanu-Ionescu"],
		["李雷", "李雷"],
		["O'Neil Mac Dónaill", "O'Neil Mac Dónaill"],
		["  Ana   Pop  ", "Ana Pop"],
		["Mă numesc Ana Pop", "Ana Pop"],
		["My name is Ana Pop", "Ana Pop"],
		["Da, Ana Pop", "Ana Pop"],
		[`${word(33)} ${word(33)} ${word(32)}`, `${word(33)} ${word(33)} ${word(32)}`],
	])("takes %j", async (typed, name) => {
		const report = await answer("name", typed);
		expect(report.values.name).toBe(name);
		expect(report.problem).toBeUndefined();
		expect(report.heard).toContain("name");
	});

	it.each([
		["one letter", "A"],
		["empty", ""],
		["only blanks", "   "],
		["digits", "R2D2 Pop"],
		["101 characters", `${word(34)} ${word(33)} ${word(32)}x`],
		["a very long word", word(60)],
		["many words", "Ana Maria Ioana Elena Sofia Irina Pop"],
		["symbols", "###"],
	])("names the problem for %s", async (_label, typed) => {
		const report = await answer("name", typed);
		expect(report.problem).toEqual({ field: "name", code: "invalid" });
		expect(report.values.name).toBeUndefined();
		expect(report.ask).toBe("name");
	});
});

describe("age", () => {
	it.each([
		["34", 34],
		["0", 0],
		["120", 120],
		["007", 7],
		["34 de ani", 34],
		["am 34 de ani", 34],
		["7 ani", 7],
		["e pentru fiica mea de 7 ani", 7],
		["are 9 ani", 9],
		["I am 34 years old", 34],
		["she is 12", 12],
		["vârsta 41", 41],
	])("takes %j", async (typed, age) => {
		const report = await answer("age", typed);
		expect(report.values.age).toBe(age);
		expect(report.problem).toBeUndefined();
	});

	it.each([
		["121", "max + 1"],
		["-1", "below the minimum"],
		["7.5", "a fraction"],
		["1000", "four digits"],
		["", "empty"],
		["treizeci", "a word"],
		["34 si 35", "two numbers"],
		["999 ani", "a year count out of range"],
	])("names the problem for %j (%s)", async (typed) => {
		const report = await answer("age", typed);
		expect(report.problem).toEqual({ field: "age", code: "invalid" });
		expect(report.values.age).toBeUndefined();
	});

	it("an age is never read as the ten o'clock time", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "10", asking(picked, "age"), "confirm");
		expect(next.details?.values.age).toBe(10);
		expect(next.chosen).toMatchObject({ time: "10:00" });
	});

	it("an age outside a bare answer is read only with 'ani'", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", picked.state, "confirm", { typed: "Ana Pop, 34" });
		expect(next.details?.values.age).toBeUndefined();
	});
});

describe("details", () => {
	it.each([
		["ten characters", "a".repeat(10)],
		["a sentence", "Mă simt anxioasă de câteva luni."],
		["unicode and emoji", "Mă simt copleșită 😔 și obosită"],
		["the maximum", "a".repeat(2000)],
		["a question mark", "de ce mi se întâmplă asta mereu?"],
		["words that look like a cancellation", "am anulat două programări pentru că nu pot dormi"],
		["words that look like a time", "de luni dimineața nu dorm deloc"],
		["several lines", "primul rând\r\nal doilea rând"],
	])("takes %s", async (_label, typed) => {
		const report = await answer("details", typed);
		expect(report.values.details).toBe(typed.replace(/\r\n?/g, "\n").trim());
		expect(report.problem).toBeUndefined();
	});

	it.each([
		["empty", ""],
		["nine characters", "a".repeat(9)],
		["blanks around nine", `   ${"a".repeat(9)}   `],
		["max + 1", "a".repeat(2001)],
	])("names the problem for %s", async (_label, typed) => {
		const report = await answer("details", typed);
		expect(report.problem).toEqual({ field: "details", code: "invalid" });
		expect(report.values.details).toBeUndefined();
		expect(report.ask).toBe("details");
	});

	it("the description is not mistaken for another field", async () => {
		const report = await answer("details", "Mă cheamă Ana, am 34 de ani și nu dorm de o lună");
		expect(report.values).toEqual({
			details: "Mă cheamă Ana, am 34 de ani și nu dorm de o lună",
		});
	});
});

describe("phone", () => {
	it.each([
		["0722123456", "+40722123456"],
		["0722 123 456", "+40722123456"],
		["0722.123.456", "+40722123456"],
		["(0722) 123-456", "+40722123456"],
		["+40 722 123 456", "+40722123456"],
		["0040722123456", "+40722123456"],
		["0212345678", "+40212345678"],
		["+1 415 555 2671", "+14155552671"],
		["+44 20 7946 0958", "+442079460958"],
		["telefonul meu este 0722 123 456", "+40722123456"],
	])("takes %j", async (typed, phone) => {
		const report = await answer("phone", typed);
		expect(report.values.phone).toBe(phone);
		expect(report.problem).toBeUndefined();
	});

	it.each([
		["a number that is one digit short", "072212345"],
		["a number that is one digit long", "07221234567"],
		["a landline-looking prefix that is not one", "0122123456"],
		["a Romanian international number that is short", "+4072212345"],
		["too few digits", "0722"],
		["words", "nu am telefon"],
		["empty", ""],
		["too many digits", "+1234567890123456"],
	])("names the problem for %s", async (_label, typed) => {
		const report = await answer("phone", typed);
		expect(report.problem).toEqual({ field: "phone", code: "invalid" });
		expect(report.values.phone).toBeUndefined();
		expect(report.ask).toBe("phone");
	});
});

describe("e-mail", () => {
	it.each([
		["ana@example.ro", "ana@example.ro"],
		["Ana.Pop@Example.RO", "ana.pop@example.ro"],
		["emailul meu este ana+programare@exemplu.ro.", "ana+programare@exemplu.ro"],
		["ionuț@exemplu.ro", "ionuț@exemplu.ro"],
		["<ana@example.ro>", "ana@example.ro"],
	])("takes %j", async (typed, email) => {
		const report = await answer("email", typed);
		expect(report.values.email).toBe(email);
		expect(report.problem).toBeUndefined();
	});

	it.each([
		["no @", "ana.example.ro"],
		["no domain", "ana@"],
		["no dot", "ana@example"],
		["a one-letter ending", "ana@example.r"],
		["empty", ""],
		["more than 120 characters", `${"a".repeat(110)}@example.ro`],
	])("names the problem for %s", async (_label, typed) => {
		const report = await answer("email", typed);
		expect(report.problem).toEqual({ field: "email", code: "invalid" });
		expect(report.values.email).toBeUndefined();
	});

	it.each([
		["ana@gmial.com", "gmail.com"],
		["ana@yahoo.con", "yahoo.com"],
		["ana@hotmial.com", "hotmail.com"],
	])("a probable typo in %j suggests %s and keeps the address out", async (typed, suggestion) => {
		const report = await answer("email", typed);
		expect(report.problem).toEqual({ field: "email", code: "typo", suggestion });
		expect(report.values.email).toBeUndefined();
	});

	it("the 120-character address is the longest taken", async () => {
		const local = "a".repeat(120 - "@example.ro".length);
		const report = await answer("email", `${local}@example.ro`);
		expect(report.values.email).toHaveLength(120);
	});
});

describe("one problem at a time", () => {
	it("an invalid phone typed with a valid e-mail takes the e-mail and re-asks the phone", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", asking(picked, "phone"), "confirm", {
			typed: "072212 și ana@example.ro",
		});
		expect(next.details?.values.email).toBe("ana@example.ro");
		expect(next.details?.problem).toEqual({ field: "phone", code: "invalid" });
		expect(next.details?.ask).toBe("phone");
		expect(next.state?.asked).toBe("phone");
	});

	it("the answer to another field than the one asked is taken and the asked one is asked again, unblamed", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", asking(picked, "age"), "confirm", {
			typed: "0722 123 456",
		});
		expect(next.details?.values.phone).toBe("+40722123456");
		expect(next.details?.problem).toBeUndefined();
		expect(next.details?.ask).toBe("name");
	});

	it("a long text is never made of a name", async () => {
		expect(long(250).length).toBe(250);
		const report = await answer("name", long(250));
		expect(report.problem).toEqual({ field: "name", code: "invalid" });
	});
});
