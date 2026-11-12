import { describe, expect, it } from "vitest";
import { readCmsArticles } from "./articles";
import { articleFromPayload } from "./articles-map";

const CMS = "http://cms.test";
const both = (ro: string, en: string) => ({ ro, en });

/** A Payload REST document (`locale=all`, `depth=1`) as the CMS answers it. */
function doc(patch: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 7,
		slug: "semne-autism",
		brand: "psizone",
		topic: "autism",
		kind: "health",
		backlogNo: 1,
		aiDrafted: false,
		provenance: [],
		title: both("Semne", "Signs"),
		standfirst: both("Pe scurt.", "In short."),
		body: [
			{ blockType: "p", text: both("Text.", "Text.") },
			{ blockType: "list", items: [{ text: both("a", "a") }, { text: both("b", "b") }] },
		],
		sources: [{ label: both("OMS", "WHO"), href: "https://who.int" }],
		cover: { url: "/api/media/file/c.png", alt: both("Copil", "Child"), width: 800, height: 600 },
		authorTeam: null,
		author: { name: "Ana P.", credentials: both("Psiholog", "Psychologist") },
		reviewer: { name: "Dr. R", credentials: both("Medic", "Doctor") },
		reviewedAt: "2026-11-10T09:00:00.000Z",
		publishedAt: "2026-11-11T08:00:00.000Z",
		createdAt: "2026-11-01T08:00:00.000Z",
		_status: "published",
		...patch,
	};
}

describe("articleFromPayload: the CMS → blog contract", () => {
	it("maps a published health article, dates as days, the cover absolute", () => {
		const m = articleFromPayload(doc(), CMS);
		expect(m.ok).toBe(true);
		if (!m.ok || m.article.status !== "published" || m.article.kind !== "health") return;
		expect(m.article.publishedAt).toBe("2026-11-11");
		expect(m.article.reviewer).toEqual({
			name: "Dr. R",
			credentials: both("Medic", "Doctor"),
			reviewedAt: "2026-11-10",
		});
		expect(m.article.cover?.src).toBe("http://cms.test/api/media/file/c.png");
		expect(m.article.body[1]).toEqual({ type: "list", items: [both("a", "a"), both("b", "b")] });
	});

	it("refuses a published health article without a clinical reviewer", () => {
		const m = articleFromPayload(doc({ reviewer: null, reviewedAt: null }), CMS);
		expect(m).toMatchObject({ ok: false, id: "7" });
	});

	it("refuses a published health article without sources", () => {
		expect(articleFromPayload(doc({ sources: [] }), CMS).ok).toBe(false);
	});

	it("refuses an article with one locale missing (no fallback across languages)", () => {
		expect(articleFromPayload(doc({ title: { ro: "Semne" } }), CMS).ok).toBe(false);
		expect(articleFromPayload(doc({ body: [{ blockType: "p", text: { ro: "x" } }] }), CMS).ok).toBe(
			false,
		);
	});

	it("refuses a standfirst over 60 words", () => {
		const long = Array.from({ length: 61 }, () => "cuvânt").join(" ");
		expect(articleFromPayload(doc({ standfirst: both(long, "Short.") }), CMS).ok).toBe(false);
	});

	it("maps a published editorial article to the team byline, no reviewer", () => {
		const m = articleFromPayload(
			doc({ kind: "editorial", authorTeam: both("Echipa", "The team"), reviewer: null }),
			CMS,
		);
		expect(m.ok && m.article.status === "published" && m.article.author).toEqual({
			team: both("Echipa", "The team"),
		});
	});

	it("maps any unpublished text to a draft, whatever its workflow stage", () => {
		const m = articleFromPayload(doc({ _status: "draft", reviewer: null }), CMS);
		expect(m.ok && m.article.status).toBe("draft");
		expect(m.ok && m.article.status === "draft" && m.article.draftedAt).toBe("2026-11-01");
	});

	it("maps an unpublished title without a body to an in-review stub", () => {
		const m = articleFromPayload(doc({ _status: "draft", body: [] }), CMS);
		expect(m.ok && m.article.status).toBe("in-review");
	});

	it("requires provenance on an AI-drafted draft", () => {
		expect(articleFromPayload(doc({ _status: "draft", aiDrafted: true }), CMS).ok).toBe(false);
		const ok = articleFromPayload(
			doc({ _status: "draft", aiDrafted: true, provenance: [{ entry: "docs/x.md" }] }),
			CMS,
		);
		expect(ok.ok && ok.article.status === "draft" && ok.article.provenance).toEqual(["docs/x.md"]);
	});

	it("names the missing fields of the branch the document is in", () => {
		const m = articleFromPayload(doc({ _status: "draft", title: { ro: "Doar română" } }), CMS);
		expect(m.ok).toBe(false);
		if (!m.ok) expect(m.reason).toBe("title");
	});

	it("names failing fields only, never the content", () => {
		const m = articleFromPayload(doc({ title: { ro: "Secret clinic" } }), CMS);
		expect(m.ok).toBe(false);
		if (!m.ok) expect(m.reason).not.toContain("Secret");
	});
});

describe("readCmsArticles", () => {
	it("asks anonymously for published versions only, pages, and keeps the rejects apart", async () => {
		const urls: string[] = [];
		const fake: typeof fetch = async (input, init) => {
			const url = String(input);
			urls.push(url);
			expect(new Headers(init?.headers).get("authorization")).toBeNull();
			const page = new URL(url).searchParams.get("page");
			const body =
				page === "1"
					? { docs: [doc()], hasNextPage: true, nextPage: 2 }
					: { docs: [doc({ id: 8, slug: "x", reviewer: null })], hasNextPage: false };
			return new Response(JSON.stringify(body), { status: 200 });
		};
		const r = await readCmsArticles({ cmsUrl: CMS, drafts: false, fetch: fake });
		expect(r.articles.map((a) => a.slug)).toEqual(["semne-autism"]);
		expect(r.rejected.map((x) => x.id)).toEqual(["8"]);
		expect(new URL(urls[0] ?? "").searchParams.get("where[_status][equals]")).toBe("published");
		expect(urls).toHaveLength(2);
	});

	it("sends the API key and asks for drafts on staging", async () => {
		const fake: typeof fetch = async (input, init) => {
			expect(new URL(String(input)).searchParams.get("draft")).toBe("true");
			expect(new Headers(init?.headers).get("authorization")).toBe("users API-Key k");
			return new Response(JSON.stringify({ docs: [], hasNextPage: false }), { status: 200 });
		};
		await readCmsArticles({ cmsUrl: CMS, drafts: true, apiKey: "k", fetch: fake });
	});

	it("throws on a CMS error, so the caller keeps its last good snapshot", async () => {
		const fake: typeof fetch = async () => new Response("no", { status: 503 });
		await expect(readCmsArticles({ cmsUrl: CMS, drafts: false, fetch: fake })).rejects.toThrow(
			"503",
		);
	});
});
