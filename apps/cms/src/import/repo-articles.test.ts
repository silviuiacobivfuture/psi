import { articleFromPayload } from "@psi/cms-client";
import { ARTICLES, isReadable } from "@psi/content";
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
		createdAt: "2026-11-12T00:00:00.000Z",
		_status: "draft",
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
	return { body, sources };
}

describe("importing the repository's articles", () => {
	const all = toImport(ARTICLES);
	it("takes the editorial policy, the seven AI drafts and the ten backlog titles", () => {
		expect(all).toHaveLength(18);
		expect(all.filter((a) => a.status === "draft" && a.aiDrafted)).toHaveLength(7);
		expect(all.filter((a) => a.status === "in-review")).toHaveLength(10);
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
	});
});
