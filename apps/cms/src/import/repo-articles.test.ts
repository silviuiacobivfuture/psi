import { articleFromPayload } from "@psi/cms-client";
import { ARTICLES, type DraftArticle, isReadable } from "@psi/content";
import { describe, expect, it } from "vitest";
import { createData, englishData, toImport } from "./repo-articles";

/** What Payload would hold after the import: the ro create plus the en update, with row ids. */
function asStored(
	ro: Record<string, unknown>,
	en: Record<string, unknown>,
): Record<string, unknown> {
	const loc = (a: unknown, b: unknown) => ({ ro: a, en: b });
	const roBody = Array.isArray(ro.body) ? ro.body : [];
	const enBody = Array.isArray(en.body) ? en.body : [];
	return {
		...ro,
		id: 1,
		title: loc(ro.title, en.title),
		standfirst: loc(ro.standfirst, en.standfirst),
		authorTeam: ro.authorTeam === undefined ? null : loc(ro.authorTeam, en.authorTeam),
		body: roBody.map((b: Record<string, unknown>, i: number) => {
			const e: Record<string, unknown> = enBody[i] ?? {};
			return b.blockType === "list"
				? {
						blockType: "list",
						items: (Array.isArray(b.items) ? b.items : []).map(
							(it: { text: string }, k: number) => ({
								text: loc(it.text, Array.isArray(e.items) ? e.items[k]?.text : undefined),
							}),
						),
					}
				: { blockType: b.blockType, text: loc(b.text, e.text) };
		}),
		sources: (Array.isArray(ro.sources) ? ro.sources : []).map(
			(s: { label: string; href: string }, i: number) => ({
				href: s.href,
				label: loc(s.label, Array.isArray(en.sources) ? en.sources[i]?.label : undefined),
			}),
		),
		...optionalStored(ro, en),
		createdAt: "2026-11-12T00:00:00.000Z",
		_status: "draft",
	};
}

/** seo, faq and related as Payload answers them under `locale=all`. */
function optionalStored(
	ro: Record<string, unknown>,
	en: Record<string, unknown>,
): Record<string, unknown> {
	const seoRo = ro.seo as Record<string, unknown> | undefined;
	const seoEn = en.seo as Record<string, unknown> | undefined;
	const faqRo = Array.isArray(ro.faq) ? ro.faq : [];
	const faqEn = Array.isArray(en.faq) ? en.faq : [];
	return {
		seo:
			seoRo === undefined || seoEn === undefined
				? null
				: {
						title: { ro: seoRo.title, en: seoEn.title },
						description: { ro: seoRo.description, en: seoEn.description },
						keywords: { ro: seoRo.keywords, en: seoEn.keywords },
					},
		faq: faqRo.map((f: { q: string; a: string }, i: number) => ({
			q: { ro: f.q, en: faqEn[i]?.q },
			a: { ro: f.a, en: faqEn[i]?.a },
		})),
		related: ro.related ?? [],
	};
}

/** The rows Payload creates: one id per block, list item and source. */
function created(ro: Record<string, unknown>): Record<string, unknown> {
	const body = (Array.isArray(ro.body) ? ro.body : []).map(
		(b: Record<string, unknown>, i: number) => ({
			id: `b${i}`,
			items: Array.isArray(b.items)
				? b.items.map((_: unknown, k: number) => ({ id: `b${i}i${k}` }))
				: null,
		}),
	);
	const sources = (Array.isArray(ro.sources) ? ro.sources : []).map((_: unknown, i: number) => ({
		id: `s${i}`,
	}));
	const faq = (Array.isArray(ro.faq) ? ro.faq : []).map((_: unknown, i: number) => ({
		id: `f${i}`,
	}));
	return { body, sources, faq };
}

describe("importing the repository's articles", () => {
	const all = toImport(ARTICLES);
	it("takes the editorial policy and the AI drafts, and every repository article", () => {
		expect(all.filter((a) => a.status === "draft" && a.aiDrafted).length).toBeGreaterThanOrEqual(7);
		expect(all).toHaveLength(ARTICLES.length);
		expect(all.some((a) => a.slug === "cum-scriem-si-revizuim-articolele")).toBe(true);
	});
	it("imports a backlog title as a title-only draft from the content strategy", () => {
		const stub = all.find((a) => a.status === "in-review");
		if (stub === undefined) throw new Error("no backlog title");
		const ro = createData(stub);
		expect(ro).toMatchObject({
			brand: stub.brand,
			topic: stub.topic,
			backlogNo: stub.backlogNo,
			provenance: [{ entry: "backlog, content-strategy.md" }],
		});
		expect(ro.body).toBeUndefined();
		const m = articleFromPayload(asStored(ro, englishData(stub, {})), "http://cms.test");
		expect(m.ok && m.article.status).toBe("in-review");
		expect(m.ok && m.article.title).toEqual(stub.title);
	});
	it("keeps every article's provenance; the policy records the file it came from", () => {
		for (const a of all) {
			const p = createData(a).provenance;
			expect(Array.isArray(p) && p.length > 0).toBe(true);
		}
		const policy = all.find((a) => a.status === "published");
		expect(JSON.stringify(policy && createData(policy).provenance)).toContain("packages/content");
	});
	it.each(
		toImport(ARTICLES).flatMap((a) => (isReadable(a) ? [[a.slug, a] as const] : [])),
	)("%s reads back on the blog as the same text, now a draft", (_slug, a) => {
		const ro = createData(a);
		const stored = asStored(ro, englishData(a, created(ro)));
		const m = articleFromPayload(stored, "http://cms.test");
		expect(m.ok).toBe(true);
		if (!m.ok || m.article.status !== "draft") return;
		expect(m.article.title).toEqual(a.title);
		expect(m.article.standfirst).toEqual(a.standfirst);
		expect(m.article.body).toEqual(a.body);
		expect(m.article.sources).toEqual(a.sources);
		expect(m.article.seo).toEqual(a.seo);
		expect(m.article.faq).toEqual(a.faq);
		expect(m.article.related).toEqual(a.related);
	});
});

describe("seo, faq and related travel with the import", () => {
	const loc = (ro: string, en: string) => ({ ro, en });
	const base = ARTICLES.find((a): a is DraftArticle => a.status === "draft");
	if (base === undefined) throw new Error("no draft to build on");
	const rich: DraftArticle = {
		...base,
		seo: {
			title: loc("Somnul copilului", "Child sleep"),
			description: loc(
				"Cum se odihnește un copil și ce poți face seara, pas cu pas, fără presiune.",
				"How a child rests and what you can do in the evening, step by step, without pressure.",
			),
			keywords: { ro: ["somn copil", "adormire"], en: ["child sleep"] },
		},
		faq: [
			{ q: loc("De ce?", "Why?"), a: loc("Pentru că.", "Because.") },
			{ q: loc("Cât?", "How long?"), a: loc("Puțin.", "A little.") },
		],
		related: ["alt-articol", "inca-unul"],
	};

	it("writes them in Romanian, then in English onto the same faq rows", () => {
		const ro = createData(rich);
		expect(ro.seo).toEqual({
			title: "Somnul copilului",
			description: expect.stringContaining("Cum se odihnește"),
			keywords: [{ keyword: "somn copil" }, { keyword: "adormire" }],
		});
		expect(ro.faq).toEqual([
			{ q: "De ce?", a: "Pentru că." },
			{ q: "Cât?", a: "Puțin." },
		]);
		expect(ro.related).toEqual([{ slug: "alt-articol" }, { slug: "inca-unul" }]);
		const en = englishData(rich, created(ro));
		expect(en.faq).toEqual([
			{ id: "f0", q: "Why?", a: "Because." },
			{ id: "f1", q: "How long?", a: "A little." },
		]);
		expect(en.seo).toMatchObject({ title: "Child sleep", keywords: [{ keyword: "child sleep" }] });
	});

	it("reads back on the blog as the same seo, faq and related", () => {
		const ro = createData(rich);
		const m = articleFromPayload(asStored(ro, englishData(rich, created(ro))), "http://cms.test");
		expect(m.ok).toBe(true);
		if (!m.ok || m.article.status !== "draft") return;
		expect(m.article.seo).toEqual(rich.seo);
		expect(m.article.faq).toEqual(rich.faq);
		expect(m.article.related).toEqual(["alt-articol", "inca-unul"]);
	});

	it("writes nothing for an article without them, and clears them on a refresh", () => {
		const plain: DraftArticle = { ...base, seo: null, faq: [], related: [] };
		const ro = createData(plain);
		expect(ro).not.toHaveProperty("seo");
		expect(ro).not.toHaveProperty("faq");
		expect(ro).not.toHaveProperty("related");
		const again = createData(plain, true);
		expect(again.seo).toEqual({ title: null, description: null, keywords: [] });
		expect(again.faq).toEqual([]);
		expect(again.related).toEqual([]);
		expect(englishData(plain, created(ro), true).seo).toEqual({
			title: null,
			description: null,
			keywords: [],
		});
	});
});
