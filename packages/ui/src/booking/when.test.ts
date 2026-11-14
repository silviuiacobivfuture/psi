import { describe, expect, it } from "vitest";
import { formFields } from "./routes";
import { BookingRequest, periodsOf, WhenSchema } from "./schemas";

describe("when a person can be called: the checkboxes' values, collapsed to the one period a request carries", () => {
	it.each([
		["nothing ticked", undefined, "any"],
		["an empty field", "", "any"],
		["Oricând", "any", "any"],
		["the morning alone", "morning", "morning"],
		["the afternoon alone", "afternoon", "afternoon"],
		["both parts of the day", "morning,afternoon", "any"],
		["both, in the other order", "afternoon,morning", "any"],
		["Oricând with a part of the day (no script to clear it)", "morning,any", "any"],
		["the same part twice", "morning,morning", "morning"],
		["blanks around the values", " afternoon , ", "afternoon"],
	])("%s → %s", (_, raw, want) => {
		expect(WhenSchema.parse(raw)).toBe(want);
	});

	it.each([
		["a value the form never offers", "evening"],
		["one good and one forged value", "morning,evening"],
		["markup", "<b>any</b>"],
		["more values than the form has", "any,any,any,any"],
	])("refuses %s", (_, raw) => {
		expect(WhenSchema.safeParse(raw).success).toBe(false);
	});

	it("a refused time is the request's 'when' error, and nothing else is blamed", () => {
		const parsed = BookingRequest.safeParse({
			name: "Ana Popescu",
			age: "34",
			details: "Copilul are probleme cu somnul.",
			phone: "0700 123 456",
			email: "ana@example.test",
			forWhom: "child",
			when: "morning,evening",
			consent: "yes",
		});
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues.map((i) => i.path[0])).toEqual(["when"]);
	});

	it("periodsOf reads the ticked boxes back in the form's order, once each, ignoring anything else", () => {
		expect(periodsOf(undefined)).toEqual([]);
		expect(periodsOf("")).toEqual([]);
		expect(periodsOf("afternoon,morning,afternoon")).toEqual(["morning", "afternoon"]);
		expect(periodsOf("evening,any")).toEqual(["any"]);
	});
});

describe("a form body as strings", () => {
	it("joins the repeated 'when' values, and blanks any other repeated field or file", () => {
		const file = new File(["x"], "x.txt");
		expect(
			formFields({
				name: "Ana",
				when: ["morning", "afternoon"],
				forWhom: ["child", "adult"],
				upload: file,
			}),
		).toEqual({ name: "Ana", when: "morning,afternoon", forWhom: "", upload: "" });
	});

	it("keeps a single 'when' as it is, and blanks a 'when' that is not all strings", () => {
		expect(formFields({ when: "any" })).toEqual({ when: "any" });
		expect(formFields({ when: ["morning", new File(["x"], "x")] })).toEqual({ when: "" });
	});
});
