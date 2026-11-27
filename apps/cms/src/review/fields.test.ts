import { describe, expect, it } from "vitest";
import { brandField } from "./fields";

describe("brandField", () => {
	it("starts a new document on the first live brand, so an autosaved draft always has one", () => {
		expect(brandField(["psizone", "eqsync", "hemisync"])).toMatchObject({
			name: "brand",
			required: true,
			defaultValue: "psizone",
		});
	});

	it("never starts on a retired brand, even when it is listed first", () => {
		expect(brandField(["eqsync", "hemisync", "psizone"])).toMatchObject({
			defaultValue: "hemisync",
		});
	});

	it("still offers every brand it was given, retired included (their rows exist)", () => {
		const field = brandField(["eqsync", "psizone"]);
		expect(field.type === "select" ? field.options : []).toEqual([
			{ label: "eqsync", value: "eqsync" },
			{ label: "psizone", value: "psizone" },
		]);
	});

	it("has no default when no brand is live, rather than inventing one", () => {
		expect(brandField(["eqsync"])).toMatchObject({ defaultValue: undefined });
	});
});
