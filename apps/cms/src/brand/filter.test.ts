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
	it("the Blog shows every app's articles on a collection without a blog value", () => {
		expect(brandWhere(["psizone", "eqsync", "hemisync"], "psi-cms-brand=blog")).toBeNull();
	});
	it("shows nothing for another app the collection does not have", () => {
		expect(brandWhere(["psizone", "blog"], "psi-cms-brand=hemisync")).toEqual({
			id: { exists: false },
		});
	});
	it("ignores an unknown cookie value", () => {
		expect(brandWhere(BRANDS, "psi-cms-brand=acme")).toBeNull();
	});
});
