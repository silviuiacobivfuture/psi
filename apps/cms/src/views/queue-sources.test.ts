import { describe, expect, it } from "vitest";
import { AnalyticsDaily } from "../collections/analytics-daily";
import { Articles } from "../collections/articles";
import { KnowledgeEntries } from "../collections/knowledge-entries";
import { Media } from "../collections/media";
import { Offerings } from "../collections/offerings";
import { People } from "../collections/people";
import { ReviewEvents } from "../collections/review-events";
import { Users } from "../collections/users";
import { queueSources } from "./queue-sources";

/** Every collection payload.config.ts registers. */
const ALL = [
	Users,
	Articles,
	KnowledgeEntries,
	Offerings,
	People,
	Media,
	ReviewEvents,
	AnalyticsDaily,
];

describe("the review queue's sources", () => {
	it("are the reviewed collections, each queried by its real title field", () => {
		expect(queueSources(ALL)).toEqual([
			{ slug: "articles", titleField: "title" },
			{ slug: "knowledge-entries", titleField: "question" },
			{ slug: "offerings", titleField: "title" },
		]);
	});
	it("skip every collection without a top-level workflow.stage", () => {
		const slugs = queueSources(ALL).map((s) => s.slug);
		for (const c of ALL) {
			const top = c.fields.some((f) => "name" in f && f.name === "workflow");
			expect(slugs.includes(c.slug)).toBe(top);
		}
	});
});
