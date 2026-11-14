import { describe, expect, it } from "vitest";
import { bookingFieldProblems, BOOKING_FIELD_LIMITS as L } from "./booking-fields";

const OK = {
	name: "Ana Pop",
	phone: "+40 733 000 111",
	email: "ana@example.ro",
	age: 9,
	details: "Nu doarme bine noaptea.",
};
const reasons = (contact: Partial<typeof OK> & { name: string }) =>
	bookingFieldProblems({ contact }).map((p) => p.reason);

describe("the five booking fields", () => {
	it("a complete booking has no problem, unicode and the bounds included", () => {
		expect(reasons(OK)).toEqual([]);
		expect(reasons({ ...OK, name: "Ștefan Țăran" })).toEqual([]);
		expect(reasons({ ...OK, age: L.ageMin })).toEqual([]);
		expect(reasons({ ...OK, age: L.ageMax })).toEqual([]);
		expect(reasons({ ...OK, details: "a".repeat(L.detailsMin) })).toEqual([]);
		expect(reasons({ ...OK, details: "a".repeat(L.detailsMax) })).toEqual([]);
		expect(reasons({ ...OK, name: "a".repeat(L.nameMax) })).toEqual([]);
		expect(reasons({ ...OK, email: `${"a".repeat(L.emailMax - 5)}@x.ro` })).toEqual([]);
	});

	it("one past each bound is that field's invalid reason", () => {
		expect(reasons({ ...OK, age: L.ageMax + 1 })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, age: -1 })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, age: 9.5 })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, age: Number.NaN })).toEqual(["age_invalid"]);
		expect(reasons({ ...OK, details: "a".repeat(L.detailsMin - 1) })).toEqual(["details_invalid"]);
		expect(reasons({ ...OK, details: "a".repeat(L.detailsMax + 1) })).toEqual(["details_invalid"]);
		expect(reasons({ ...OK, name: "A" })).toEqual(["name_invalid"]);
		expect(reasons({ ...OK, name: "a".repeat(L.nameMax + 1) })).toEqual(["name_invalid"]);
		expect(reasons({ ...OK, email: `${"a".repeat(L.emailMax - 4)}@x.ro` })).toEqual([
			"email_invalid",
		]);
		expect(reasons({ ...OK, phone: "12" })).toEqual(["phone_invalid"]);
	});

	it("blank is missing, never invalid; every problem is named, in the order the sites ask", () => {
		expect(
			bookingFieldProblems({ contact: { name: " ", phone: " ", email: "", details: "  " } }),
		).toEqual([
			{ field: "name", reason: "name_missing" },
			{ field: "age", reason: "age_missing" },
			{ field: "details", reason: "details_missing" },
			{ field: "phone", reason: "phone_missing" },
			{ field: "email", reason: "email_missing" },
		]);
	});
});
