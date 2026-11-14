import { describe, expect, it } from "vitest";
import { GUIDE_FIELD_LIMITS, guideFieldProblems } from "./guide-fields";

const OK = {
	contact: { name: "Ana Pop", phone: "+40 733 000 111", email: "ana@example.ro" },
	age: 9,
	details: "Nu doarme bine.",
};
const reasons = (input: Parameters<typeof guideFieldProblems>[0]) =>
	guideFieldProblems(input).map((p) => p.reason);

describe("the visitor assistant's five fields", () => {
	it("a complete booking has no problem, unicode and the bounds included", () => {
		expect(guideFieldProblems(OK)).toEqual([]);
		expect(reasons({ ...OK, contact: { ...OK.contact, name: "Ștefan Țăran" } })).toEqual([]);
		expect(reasons({ ...OK, age: GUIDE_FIELD_LIMITS.ageMin })).toEqual([]);
		expect(reasons({ ...OK, age: GUIDE_FIELD_LIMITS.ageMax })).toEqual([]);
		expect(reasons({ ...OK, details: "a".repeat(GUIDE_FIELD_LIMITS.detailsMin) })).toEqual([]);
		expect(reasons({ ...OK, details: "a".repeat(GUIDE_FIELD_LIMITS.detailsMax) })).toEqual([]);
		expect(reasons({ ...OK, contact: { ...OK.contact, name: "a".repeat(80) } })).toEqual([]);
	});

	it("one past each bound is that field's invalid reason", () => {
		expect(reasons({ ...OK, age: GUIDE_FIELD_LIMITS.ageMax + 1 })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, age: -1 })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, age: Number.NaN })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, details: "a".repeat(GUIDE_FIELD_LIMITS.detailsMax + 1) })).toEqual([
			"details_invalid",
		]);
		expect(reasons({ ...OK, contact: { ...OK.contact, name: "a".repeat(81) } })).toEqual([
			"name_invalid",
		]);
		expect(
			reasons({ ...OK, contact: { ...OK.contact, email: `${"a".repeat(116)}@x.ro` } }),
		).toEqual(["email_invalid"]);
	});

	it("blank is missing, never invalid; every problem is named, in the order the assistant asks", () => {
		expect(
			guideFieldProblems({ contact: { name: " ", phone: " ", email: "" }, details: "  " }),
		).toEqual([
			{ field: "name", reason: "name_missing" },
			{ field: "age", reason: "age_missing" },
			{ field: "details", reason: "details_missing" },
			{ field: "phone", reason: "phone_missing" },
			{ field: "email", reason: "email_missing" },
		]);
	});
});
