import { KnowledgeEntrySchema } from "@psi/knowledge";
import { describe, expect, it } from "vitest";
import { allKnowledgeIds, planKnowledge } from "./map";

const answer = Array.from({ length: 90 }, () => "cuvânt").join(" ");
const approved = {
	state: "approved",
	reviewerName: "Dr. R",
	approvedAt: "2026-11-11T10:00:00.000Z",
};

describe("planKnowledge", () => {
	it("ingests approved locales of a published entry and removes the rest", () => {
		const plan = planKnowledge({
			id: 12,
			brand: "psizone",
			kind: "clinical",
			_status: "published",
			hub: "/copii/autism",
			question: { ro: "Ce este ABA?", en: "What is ABA?" },
			answer: { ro: answer, en: answer },
			citePath: { ro: "/copii/autism", en: "/en/children/autism" },
			review: { ro: approved, en: { state: "pending" } },
		});
		expect(plan.remove).toEqual(["cms.ke.12.en"]);
		expect(plan.ingest).toHaveLength(1);
		const entry = KnowledgeEntrySchema.parse(plan.ingest[0]);
		expect(entry).toMatchObject({
			id: "cms.ke.12.ro",
			locale: "ro",
			url: "/copii/autism",
			reviewedBy: "Dr. R",
			status: "published",
		});
	});
	it("removes every locale of an unpublished entry", () => {
		const plan = planKnowledge({
			id: 3,
			brand: "eqsync",
			kind: "editorial",
			_status: "draft",
			question: { ro: "Q" },
			answer: { ro: answer },
			citePath: { ro: "/x" },
			review: { ro: approved },
		});
		expect(plan.ingest).toEqual([]);
		expect(plan.remove).toEqual(allKnowledgeIds(3));
	});
});

describe("planKnowledge and the gate's rule", () => {
	it("ingests a published editorial entry that needs no review, without a reviewer", () => {
		const plan = planKnowledge({
			id: 5,
			brand: "eqsync",
			kind: "editorial",
			_status: "published",
			question: { ro: "Ce este EQ-SYNC?" },
			answer: { ro: answer },
			citePath: { ro: "/despre" },
			review: { ro: { state: "pending" } },
		});
		expect(plan.ingest.map((e) => [e.id, e.reviewedBy])).toEqual([["cms.ke.5.ro", null]]);
	});
	it("still refuses an unapproved clinical entry", () => {
		const plan = planKnowledge({
			id: 6,
			brand: "eqsync",
			kind: "clinical",
			_status: "published",
			question: { ro: "Q" },
			answer: { ro: answer },
			citePath: { ro: "/x" },
			review: { ro: { state: "pending" } },
		});
		expect(plan.ingest).toEqual([]);
	});
});
