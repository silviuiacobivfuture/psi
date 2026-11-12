import { describe, expect, it } from "vitest";
import { allApproved, publishRefusals, staleApproval } from "./decide";
import { contentHash, stableStringify } from "./hash";
import { flattenLocale, type ReviewSpec, reviewedContent } from "./spec";

/** Ported from the stopped CMS slice's review.test.ts; both-locale and block cases are new. */
const spec: ReviewSpec = {
	slug: "articles",
	reviewed: ["title", "body", "kind", "cover"],
	shared: ["body", "kind", "cover"],
	titleField: "title",
	requiredLocales: [],
	signsReviewer: true,
	stampsPublishedAt: true,
	required: () => true,
	clinical: (d) => d.kind === "health",
	missing: () => [],
};
const both: ReviewSpec = { ...spec, requiredLocales: ["ro", "en"] };
const doc = (title: string, extra: Record<string, unknown> = {}) => ({
	title,
	body: [{ id: "b1", blockType: "p", blockName: null, text: "t" }],
	kind: "health",
	...extra,
});
const approved = (d: Record<string, unknown>, s: ReviewSpec = spec) => ({
	...d,
	review: { state: "approved", approvedHash: contentHash(reviewedContent(s, d)) },
});

describe("hash", () => {
	it("ignores key order", () => {
		expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
			stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
		);
	});
	it("ignores block ids and names, which differ between reads", () => {
		expect(contentHash({ body: [{ id: "x", blockName: "a", text: "t" }] })).toBe(
			contentHash({ body: [{ id: "y", text: "t" }] }),
		);
	});
	it("treats a populated cover and its id alike", () => {
		expect(reviewedContent(spec, doc("T", { cover: { id: 4, url: "/x" } })).cover).toBe(4);
	});
});

describe("publish refusals", () => {
	it("refuses a locale that is not approved", () => {
		expect(publishRefusals(spec, [{ locale: "ro", doc: doc("T") }])).toEqual([
			{ locale: "ro", reason: "not-approved" },
		]);
	});
	it("refuses a locale whose text changed after approval", () => {
		const a = approved(doc("T"));
		expect(
			publishRefusals(spec, [{ locale: "ro", doc: { ...a, body: [{ text: "changed" }] } }]),
		).toEqual([{ locale: "ro", reason: "changed-since-approval" }]);
	});
	it("refuses when no locale has a title", () => {
		expect(publishRefusals(spec, [{ locale: "ro", doc: doc(" ") }])).toEqual([
			{ locale: null, reason: "no-locale" },
		]);
	});
	it("ignores a locale that does not exist, and passes approved ones", () => {
		expect(
			publishRefusals(spec, [
				{ locale: "ro", doc: approved(doc("T")) },
				{ locale: "en", doc: {} },
			]),
		).toEqual([]);
	});
	it("names every refusing locale", () => {
		const r = publishRefusals(spec, [
			{ locale: "ro", doc: approved(doc("T")) },
			{ locale: "en", doc: doc("E") },
		]);
		expect(r).toEqual([{ locale: "en", reason: "not-approved" }]);
	});
	it("refuses a missing locale when the blog needs both", () => {
		expect(
			publishRefusals(both, [
				{ locale: "ro", doc: approved(doc("T"), both) },
				{ locale: "en", doc: {} },
			]),
		).toEqual([{ locale: "en", reason: "missing-locale" }]);
	});
	it("needs no approval where review is not required, but still both locales", () => {
		const free = { ...both, required: () => false };
		expect(
			publishRefusals(free, [
				{ locale: "ro", doc: doc("T") },
				{ locale: "en", doc: doc("E") },
			]),
		).toEqual([]);
	});
	it("an edit makes an approval stale; an unchanged save does not", () => {
		const a = approved(doc("T"));
		expect(staleApproval(spec, a)).toBe(false);
		expect(staleApproval(spec, { ...a, kind: "editorial" })).toBe(true);
	});
	it("is approved only when every required locale is approved and fresh", () => {
		const ro = approved(doc("T"), both);
		const en = approved(doc("E"), both);
		expect(
			allApproved(both, [
				{ locale: "ro", doc: ro },
				{ locale: "en", doc: en },
			]),
		).toBe(true);
		expect(
			allApproved(both, [
				{ locale: "ro", doc: ro },
				{ locale: "en", doc: { ...en, title: "E2" } },
			]),
		).toBe(false);
	});
});

describe("flattenLocale", () => {
	it("flattens a locale:'all' document at every depth, blocks included", () => {
		expect(
			flattenLocale(
				{
					title: { ro: "R", en: "E" },
					kind: "health",
					body: [{ blockType: "p", text: { ro: "r", en: "e" } }],
					review: { ro: { state: "approved" }, en: { state: "pending" } },
				},
				"en",
			),
		).toEqual({
			title: "E",
			kind: "health",
			body: [{ blockType: "p", text: "e" }],
			review: { state: "pending" },
		});
	});
	it("reads a locale with no value as null", () => {
		expect(flattenLocale({ title: { ro: "R" } }, "en")).toEqual({ title: null });
	});
});

describe("an optional reviewed field", () => {
	const opt: ReviewSpec = {
		...spec,
		reviewed: [...spec.reviewed, "seo", "faq"],
		optional: ["seo", "faq"],
	};
	const doc = { title: "t", body: [], kind: "health", cover: null };
	it("leaves an approval given before the field existed valid while it is empty", () => {
		const before = contentHash(reviewedContent(spec, doc));
		expect(contentHash(reviewedContent(opt, doc))).toBe(before);
		expect(
			contentHash(reviewedContent(opt, { ...doc, seo: { title: null, keywords: [] }, faq: [] })),
		).toBe(before);
	});
	it("counts once it holds something, so writing it invalidates the approval", () => {
		const before = contentHash(reviewedContent(opt, doc));
		expect(
			contentHash(reviewedContent(opt, { ...doc, faq: [{ id: "a", q: "?", a: "!" }] })),
		).not.toBe(before);
		expect(contentHash(reviewedContent(opt, { ...doc, seo: { title: "x" } }))).not.toBe(before);
	});
});
