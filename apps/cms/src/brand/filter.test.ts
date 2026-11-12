import { describe, expect, it } from "vitest";
import { BRANDS } from "../authz/types";
import { brandWhere } from "./filter";

describe("the admin's brand filter", () => {
	it("does not narrow without a choice", () => {
		expect(brandWhere(BRANDS, null)).toBeNull();
	});
	it("narrows to the chosen brand", () => {
		expect(brandWhere(BRANDS, "a=1; psi-cms-brand=eqsync")).toEqual({
			brand: { equals: "eqsync" },
		});
	});
	it("shows nothing for a brand the collection does not have (articles: no blog)", () => {
		expect(brandWhere(["psizone", "eqsync", "hemisync"], "psi-cms-brand=blog")).toEqual({
			id: { exists: false },
		});
	});
	it("ignores an unknown cookie value", () => {
		expect(brandWhere(BRANDS, "psi-cms-brand=acme")).toBeNull();
	});
});
