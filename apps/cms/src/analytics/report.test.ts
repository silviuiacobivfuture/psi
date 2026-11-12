import { describe, expect, it } from "vitest";
import { buildReport, type Row } from "./report";

const row = (p: Partial<Row>): Row => ({
	day: "2026-11-12",
	brand: "psizone",
	slug: "a",
	locale: "ro",
	topic: "autism",
	metric: "view",
	count: 1,
	...p,
});

describe("buildReport", () => {
	const r = buildReport(
		[
			row({ count: 10 }),
			row({ locale: "en", count: 10 }),
			row({ metric: "depth_100", count: 5 }),
			row({ metric: "depth_50", count: 12 }),
			row({ slug: "b", brand: "eqsync", topic: "programul-eqsync", count: 4, day: "2026-11-11" }),
			row({ brand: "blog", slug: "", topic: "", metric: "guide_asked", count: 9 }),
			row({ brand: "blog", slug: "", topic: "", metric: "guide_unanswered", count: 2 }),
			row({ brand: "blog", slug: "", topic: "", metric: "guide_opened", count: 5 }),
			row({ brand: "blog", slug: "", topic: "", metric: "guide_nudge_shown", count: 4 }),
			row({ brand: "blog", slug: "", topic: "", metric: "guide_nudge_clicked", count: 1 }),
		],
		"2026-10-13",
	);
	it("sums views per article across locales, most read first", () => {
		expect(r.articles.map((a) => [a.slug, a.views])).toEqual([
			["a", 20],
			["b", 4],
		]);
		expect(r.totalViews).toBe(24);
	});
	it("computes read-through as depth_100 over views", () => {
		expect(r.articles[0]?.readThrough).toBe(0.25);
		expect(r.articles[1]?.readThrough).toBe(0);
	});
	it("ranks brands and topics by views", () => {
		expect(r.brands.map((b) => b.brand)).toEqual(["psizone", "eqsync"]);
		expect(r.topics[0]).toEqual({ topic: "autism", views: 20 });
	});
	it("keeps the guide's questions apart from the articles", () => {
		expect(r.guide).toEqual({
			asked: 9,
			unanswered: 2,
			opened: 5,
			nudgeShown: 4,
			nudgeClicked: 1,
		});
		expect(r.articles.some((a) => a.slug === "")).toBe(false);
	});
	it("orders the days", () => {
		expect(r.days.map((d) => d.day)).toEqual(["2026-11-11", "2026-11-12"]);
	});
});
