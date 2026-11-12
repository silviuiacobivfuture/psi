import { describe, expect, it } from "vitest";
import { articleEntries, articleIds, offeringEntries } from "./ingest-content";

describe("the CMS's own content as knowledge", () => {
	const article = {
		id: 3,
		slug: "somn",
		brand: "psizone",
		topic: "adhd",
		kind: "health",
		title: { ro: "Somnul", en: "Sleep" },
		standfirst: { ro: "Despre somn.", en: "About sleep." },
		body: [
			{ blockType: "h2", text: { ro: "Rutina", en: "Routine" } },
			{ blockType: "list", items: [{ text: { ro: "ora fixă", en: "a set time" } }] },
		],
		reviewer: { name: "Dr. Ana" },
		reviewedAt: "2026-11-01",
		_status: "published",
	};

	it("indexes a published article per locale, in its brand and the blog, with the review stamp", () => {
		const e = articleEntries(article);
		expect(e.map((x) => [x.id, x.brand, x.locale])).toEqual([
			["cms.ar.3.ro", "psizone", "ro"],
			["cms.ar.3.ro.blog", "blog", "ro"],
			["cms.ar.3.en", "psizone", "en"],
			["cms.ar.3.en.blog", "blog", "en"],
		]);
		expect(e[0]).toMatchObject({
			kind: "clinical",
			url: "https://blog.psizone.ro/articole/somn",
			body: "Despre somn.\n\n## Rutina\n\n- ora fixă",
			reviewedBy: "Dr. Ana",
			hub: "adhd",
		});
		expect(articleIds("3")).toHaveLength(4);
		expect(articleEntries({ ...article, _status: "draft" })).toEqual([]);
	});

	it("an offering is one short factual entry per locale; demo offerings never", () => {
		const o = {
			id: 9,
			brand: "eqsync",
			kind: "programme",
			title: { ro: "Program 21 de zile", en: "21-day programme" },
			summary: { ro: "Gratuit, online.", en: "Free, online." },
			price: { mode: "from", from: 100, currency: "RON" },
			_status: "published",
		};
		expect(offeringEntries(o).map((e) => e.body)).toEqual([
			"Program 21 de zile. Gratuit, online. Preț: de la 100 RON.",
			"21-day programme. Free, online. Price: from 100 RON.",
		]);
		expect(offeringEntries({ ...o, demo: true })).toEqual([]);
	});
});
