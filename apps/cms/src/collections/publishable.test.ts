import { describe, expect, it } from "vitest";
import { missingForPublish } from "./publishable";

const health = {
	kind: "health" as const,
	standfirst: "s",
	body: [{}],
	sources: [{}],
	author: 1,
	reviewer: 2,
	reviewedAt: "2026-11-10",
};

describe("missingForPublish", () => {
	it("accepts a complete health article", () => {
		expect(missingForPublish(health)).toEqual([]);
	});
	it("names every missing part of a bare article", () => {
		expect(missingForPublish({})).toEqual(["kind", "standfirst", "body"]);
	});
	it.each([
		["author", { author: null }],
		["reviewer", { reviewer: undefined }],
		["reviewedAt", { reviewedAt: "" }],
		["sources", { sources: [] }],
		["body", { body: [] }],
		["standfirst", { standfirst: "   " }],
	])("refuses a health article without %s", (field, patch) => {
		expect(missingForPublish({ ...health, ...patch })).toEqual([field]);
	});
	it("asks an editorial article for its team, not a reviewer", () => {
		const editorial = { ...health, kind: "editorial" as const, reviewer: null, sources: [] };
		expect(missingForPublish(editorial)).toEqual(["authorTeam"]);
		expect(missingForPublish({ ...editorial, authorTeam: "Echipa" })).toEqual([]);
	});
	it("asks an AI-drafted article where its facts come from", () => {
		expect(missingForPublish({ ...health, aiDrafted: true })).toEqual(["provenance"]);
		expect(missingForPublish({ ...health, aiDrafted: true, provenance: [{ entry: "x" }] })).toEqual(
			[],
		);
	});
});
