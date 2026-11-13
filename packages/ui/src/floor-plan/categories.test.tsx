/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { CategoryLegend } from "./controls";
import { FloorPlanDocSchema } from "./schema";

const doc = (extra: object, shape: object) => ({
	version: 1,
	revision: 1,
	width: 100,
	height: 100,
	northDeg: 0,
	...extra,
	floors: [{ id: "f", name: "F", shapes: [shape] }],
});
const room = {
	id: "r",
	kind: "room",
	label: "",
	geometry: { type: "rect", x: 0, y: 0, w: 20, h: 20 },
};

describe("room categories", () => {
	it("a plan may name categories and tag a room with one", () => {
		const ok = FloorPlanDocSchema.safeParse(
			doc(
				{ categories: [{ id: "neuro", label: { ro: "Neuro", en: "Neuro" } }] },
				{ ...room, category: "neuro" },
			),
		);
		expect(ok.success).toBe(true);
	});
	it("refuses an empty category, an over-long one and a stray field on a category", () => {
		expect(FloorPlanDocSchema.safeParse(doc({}, { ...room, category: "" })).success).toBe(false);
		expect(
			FloorPlanDocSchema.safeParse(doc({}, { ...room, category: "x".repeat(41) })).success,
		).toBe(false);
		expect(
			FloorPlanDocSchema.safeParse(
				doc({ categories: [{ id: "a", label: { ro: "a", en: "a" }, colour: "red" }] }, room),
			).success,
		).toBe(false);
	});
	it("the legend names each category in the person's language", () => {
		const cats = [{ id: "neuro", label: { ro: "Neuro RO", en: "Neuro EN" } }];
		expect(String(<CategoryLegend categories={cats} locale="en" />)).toContain("Neuro EN");
		const ro = String(<CategoryLegend categories={cats} locale="ro" />);
		expect(ro).toContain("Neuro RO");
		expect(ro).toContain('data-category="neuro"');
	});
});
