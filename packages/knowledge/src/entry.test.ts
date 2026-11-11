import { describe, expect, it } from "vitest";
import { isRetrievable, KnowledgeEntrySchema, retrievability } from "./entry";
import { entry } from "./testing/entries";

const reviewed = { reviewedBy: "Dr. Ana Pop", reviewedAt: "2026-10-01" };

describe("the retrievability rule", () => {
	it("refuses every draft, whatever its kind and review", () => {
		for (const kind of ["clinical", "programme", "operational", "editorial"] as const) {
			const e = KnowledgeEntrySchema.parse(entry({ id: "d", kind, status: "draft", ...reviewed }));
			expect(retrievability(e)).toEqual({ retrievable: false, reason: "draft" });
		}
	});

	it("accepts published non-clinical entries without a reviewer", () => {
		for (const kind of ["programme", "operational", "editorial"] as const) {
			const e = KnowledgeEntrySchema.parse(entry({ id: "p", kind }));
			expect(retrievability(e)).toEqual({ retrievable: true });
		}
	});

	it("accepts a published clinical entry only with both reviewer and review date", () => {
		const ok = KnowledgeEntrySchema.parse(entry({ id: "c", kind: "clinical", ...reviewed }));
		expect(isRetrievable(ok)).toBe(true);
		const datetime = KnowledgeEntrySchema.parse(
			entry({
				id: "c",
				kind: "clinical",
				reviewedBy: "Dr. Ana Pop",
				reviewedAt: "2026-10-01T09:00:00+03:00",
			}),
		);
		expect(isRetrievable(datetime)).toBe(true);
	});

	it("refuses a published clinical entry missing the reviewer, the date, or both", () => {
		const cases = [
			{ reviewedBy: null, reviewedAt: null },
			{ reviewedBy: "Dr. Ana Pop", reviewedAt: null },
			{ reviewedBy: null, reviewedAt: "2026-10-01" },
			{ reviewedBy: "   ", reviewedAt: "2026-10-01" },
		];
		for (const c of cases) {
			const e = KnowledgeEntrySchema.parse(entry({ id: "c", kind: "clinical", ...c }));
			expect(retrievability(e)).toEqual({ retrievable: false, reason: "clinical-unreviewed" });
		}
	});

	it("is re-checked on raw review state, not only on parsed entries", () => {
		expect(
			isRetrievable({
				kind: "clinical",
				status: "published",
				reviewedBy: " ",
				reviewedAt: "2026-10-01",
			}),
		).toBe(false);
	});
});

describe("KnowledgeEntrySchema", () => {
	it("normalises a blank reviewer to null", () => {
		expect(KnowledgeEntrySchema.parse(entry({ id: "x", reviewedBy: "  " })).reviewedBy).toBeNull();
	});

	it("accepts site-relative paths and http(s) URLs only", () => {
		expect(KnowledgeEntrySchema.safeParse(entry({ id: "x", url: "/contact" })).success).toBe(true);
		expect(
			KnowledgeEntrySchema.safeParse(entry({ id: "x", url: "https://psizone.ro/x" })).success,
		).toBe(true);
		for (const url of ["contact", "//evil.example", "javascript:alert(1)", ""]) {
			expect(KnowledgeEntrySchema.safeParse(entry({ id: "x", url })).success).toBe(false);
		}
	});

	it("refuses a blank body, a non-ISO review date, an unknown brand and an unsafe id", () => {
		expect(KnowledgeEntrySchema.safeParse(entry({ id: "x", body: " \n " })).success).toBe(false);
		expect(
			KnowledgeEntrySchema.safeParse(entry({ id: "x", reviewedAt: "1 Oct 2026" })).success,
		).toBe(false);
		expect(KnowledgeEntrySchema.safeParse({ ...entry({ id: "x" }), brand: "other" }).success).toBe(
			false,
		);
		expect(KnowledgeEntrySchema.safeParse(entry({ id: "x'; DROP TABLE" })).success).toBe(false);
	});
});
