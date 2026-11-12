import { ARTICLES, latestFor } from "@psi/content";
import { describe, expect, it } from "vitest";
import { createArticleIndex } from "./articles-index";

const both = (ro: string, en: string) => ({ ro, en });
/** One published Psizone article as the CMS answers it (newer than anything in the repository). */
const cmsDoc = {
	id: 1,
	slug: "din-cms",
	brand: "psizone",
	topic: "autism",
	kind: "editorial",
	title: both("Din CMS", "From the CMS"),
	standfirst: both("Pe scurt.", "In short."),
	body: [{ blockType: "p", text: both("Text.", "Text.") }],
	sources: [],
	authorTeam: both("Echipa", "The team"),
	publishedAt: "2099-01-01T00:00:00.000Z",
	createdAt: "2099-01-01T00:00:00.000Z",
	_status: "published",
};

function index(fallback: boolean, answer: () => Response) {
	let calls = 0;
	const fake: typeof fetch = async (url) => {
		calls++;
		expect(new URL(String(url)).searchParams.get("where[_status][equals]")).toBe("published");
		return answer();
	};
	const i = createArticleIndex({
		cmsUrl: "http://cms.test",
		blogOrigin: "http://blog.test",
		repo: ARTICLES,
		fallback,
		includeDrafts: false,
		fetch: fake,
	});
	return { i, calls: () => calls };
}

describe("a brand site's article index", () => {
	it("starts as the repository's index (a page never waits for the CMS)", () => {
		const s = index(true, () => Response.json({ docs: [], hasNextPage: false }));
		expect(latestFor("psizone", "ro", 3, s.i.index()).length).toBeGreaterThan(0);
	});
	it("puts the CMS's published article first, with the repository's kept", async () => {
		const s = index(true, () => Response.json({ docs: [cmsDoc], hasNextPage: false }));
		await s.i.refresh();
		const latest = latestFor("psizone", "ro", 3, s.i.index());
		expect(latest[0]?.slug).toBe("din-cms");
		expect(latest.length).toBeGreaterThan(1);
	});
	it("serves the CMS alone once the repository's catalogue is retired", async () => {
		const s = index(false, () => Response.json({ docs: [cmsDoc], hasNextPage: false }));
		await s.i.refresh();
		expect(latestFor("psizone", "ro", 3, s.i.index()).map((a) => a.slug)).toEqual(["din-cms"]);
	});
	it("keeps the last good index when the CMS fails", async () => {
		let ok = true;
		const s = index(true, () =>
			ok ? Response.json({ docs: [cmsDoc], hasNextPage: false }) : new Response("x", { status: 503 }),
		);
		await s.i.refresh();
		ok = false;
		await s.i.refresh();
		expect(latestFor("psizone", "ro", 1, s.i.index())[0]?.slug).toBe("din-cms");
	});
});
