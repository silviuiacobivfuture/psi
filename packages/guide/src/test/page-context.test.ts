import { type Article, parseCatalogue } from "@psi/content";
import { describe, expect, it } from "vitest";
import { type ConversationTurn, continueConversation, historyOf } from "../conversation";
import {
	articleSlugOf,
	createPageResolver,
	excerptOf,
	parsePageRef,
	type SitePage,
	type SitePages,
} from "../page-context";

const BLOG = "https://blog.example.test";
const both = (t: string): { ro: string; en: string } => ({ ro: t, en: `${t} (en)` });
const words = (n: number, w: string): string => Array.from({ length: n }, () => w).join(" ");

function published(brand: string, slug: string, over: Record<string, unknown> = {}): unknown {
	return {
		slug,
		brand,
		topic: "anxietate-depresie",
		title: both(`Titlu ${slug}`),
		backlogNo: null,
		status: "published",
		kind: "editorial",
		standfirst: both(`Rezumat ${slug}`),
		publishedAt: "2026-10-01",
		body: [
			{ type: "p", text: both(`Deschidere ${slug}. ${words(20, "intro")}`) },
			{ type: "h2", text: both("Cum decurg ședințele") },
			{ type: "p", text: both(`O ședință durează patruzeci de minute. ${words(30, "sedinta")}`) },
			{ type: "h2", text: both("Ce urmează") },
			{ type: "p", text: both(`Pasul următor este programarea. ${words(30, "pas")}`) },
		],
		faq: [{ q: both("Doare?"), a: both("Nu doare.") }],
		author: { team: both("Redacția") },
		reviewer: null,
		...over,
	};
}

const health = (brand: string, slug: string): unknown =>
	published(brand, slug, {
		kind: "health",
		author: { name: "Ana Pop", credentials: both("psiholog") },
		reviewer: { name: "Dr. Ion Ene", credentials: both("medic"), reviewedAt: "2026-10-05" },
		sources: [{ label: both("Studiu"), href: "https://example.org/studiu" }],
	});

const draft = (slug: string): unknown =>
	published("psizone", slug, {
		status: "draft",
		kind: "health",
		aiDrafted: false,
		draftedAt: "2026-11-12",
		publishedAt: undefined,
		faq: [],
		author: null,
		reviewer: null,
	});

const inReview = (slug: string): unknown => ({
	slug,
	brand: "psizone",
	topic: "adhd",
	title: both("Neurofeedback pentru atenție"),
	backlogNo: 5,
	status: "in-review",
	author: null,
	reviewer: null,
});

const CATALOGUE: ReadonlyArray<Article> = parseCatalogue([
	published("psizone", "editorial-psi"),
	health("psizone", "sanatate-psi"),
	draft("ciorna-psi"),
	inReview("in-revizuire-psi"),
	published("hemisync", "focus-hemi"),
	published("eqsync", "casti-eq"),
]);
const article = (slug: string): Article | undefined => CATALOGUE.find((a) => a.slug === slug);

const resolver = (brand: "psizone" | "eqsync" | "hemisync" | "blog", includeDrafts = true) =>
	createPageResolver({ brand, article, includeDrafts, blogOrigin: BLOG });
const ref = (slug: string) => ({
	path: `/articole/${slug}`,
	target: { kind: "article", slug } as const,
});

describe("an article page", () => {
	it("published: title, lead, headings, and an excerpt chosen for the question", () => {
		const page = resolver("blog")(ref("editorial-psi"), "ro", "ce spune despre ședințe?");
		expect(page).toMatchObject({
			kind: "article",
			status: "published",
			title: "Titlu editorial-psi",
			url: `${BLOG}/articole/editorial-psi`,
			lead: "Rezumat editorial-psi",
			headings: ["Cum decurg ședințele", "Ce urmează", "Doare?"],
		});
		expect(page?.excerpt).toContain("patruzeci de minute");
		expect((page?.excerpt ?? "").length).toBeLessThanOrEqual(2_000);
	});

	it("published, asked as 'tell me more about this': the opening comes first", () => {
		const page = resolver("blog")(
			ref("editorial-psi"),
			"ro",
			"poți să-mi zici mai multe despre acest articol?",
		);
		expect(page?.excerpt?.startsWith("Deschidere editorial-psi")).toBe(true);
	});

	it("published health with a reviewer: the excerpt is allowed", () => {
		const page = resolver("psizone")(ref("sanatate-psi"), "en", "sessions");
		expect(page?.status).toBe("published");
		expect(page?.url).toBe(`${BLOG}/en/articles/sanatate-psi`);
		expect(page?.excerpt).toContain("(en)");
	});

	it("a draft: title, standfirst and headings only, never the body", () => {
		const page = resolver("blog")(ref("ciorna-psi"), "ro", "ce spune despre ședințe?");
		expect(page?.status).toBe("draft");
		expect(page?.clinical).toBe(true);
		expect(page?.lead).toBe("Rezumat ciorna-psi");
		expect(page?.headings).toContain("Cum decurg ședințele");
		expect(page?.excerpt).toBeUndefined();
		expect(JSON.stringify(page)).not.toContain("patruzeci");
	});

	it("an editorial draft is marked as not clinical, so it is never said to be in clinical review", () => {
		const catalogue = parseCatalogue([
			published("psizone", "editorial-draft", {
				status: "draft",
				draftedAt: "2026-11-12",
				publishedAt: undefined,
				aiDrafted: false,
				faq: [],
				author: null,
			}),
		]);
		const page = createPageResolver({
			brand: "blog",
			article: (s) => catalogue.find((a) => a.slug === s),
			includeDrafts: true,
		})(ref("editorial-draft"), "ro", "x");
		expect(page).toMatchObject({ status: "draft", clinical: false });
	});

	it("a draft is no page where drafts are not shown", () => {
		expect(resolver("blog", false)(ref("ciorna-psi"), "ro", "x")).toBeUndefined();
	});

	it("an article in review: its title alone", () => {
		const page = resolver("psizone")(ref("in-revizuire-psi"), "ro", "x");
		expect(page).toEqual({
			kind: "article",
			status: "in-review",
			title: "Neurofeedback pentru atenție",
			url: `${BLOG}/articole/in-revizuire-psi`,
			headings: [],
		});
	});

	it("an unknown slug is no page", () => {
		expect(resolver("blog")(ref("nu-exista"), "ro", "x")).toBeUndefined();
	});

	it("a forged slug for a brand the guide may not read is no page, per the article policy", () => {
		expect(resolver("psizone")(ref("focus-hemi"), "ro", "x")).toBeUndefined();
		expect(resolver("hemisync")(ref("editorial-psi"), "ro", "x")).toBeUndefined();
		expect(resolver("eqsync")(ref("editorial-psi"), "ro", "x")?.status).toBe("published");
		expect(resolver("blog")(ref("focus-hemi"), "ro", "x")?.status).toBe("published");
	});

	it("a path alone is mapped to its article by the server", () => {
		expect(resolver("blog")({ path: "/articole/editorial-psi" }, "ro", "x")?.title).toBe(
			"Titlu editorial-psi",
		);
		expect(resolver("blog")({ path: "/en/articles/editorial-psi" }, "en", "x")?.title).toBe(
			"Titlu editorial-psi (en)",
		);
		expect(articleSlugOf("/articole/")).toBeUndefined();
		expect(articleSlugOf("/despre")).toBeUndefined();
	});
});

describe("a site's own page", () => {
	const page = (over: Partial<SitePage>): SitePage => ({
		kind: "hub",
		title: "ADHD",
		path: "/copii/adhd",
		lead: "Atenție, energie, școală.",
		headings: ["Ce este", "Pentru cine"],
		sections: [{ heading: "Ce este", text: "Un text clinic nerevizuit." }],
		review: { kind: "clinical", status: "draft", reviewedBy: null, reviewedAt: null },
		...over,
	});
	const site = (p: SitePage): SitePages => ({
		targetOf: (path) => (path === p.path ? { kind: p.kind, id: "x" } : undefined),
		page: () => p,
	});
	const ask = (p: SitePage, path = p.path) =>
		createPageResolver({ brand: "psizone", site: site(p) })({ path }, "ro", "ce faceți aici?");

	it("an unreviewed clinical draft: headings and lead, no text", () => {
		const out = ask(page({}));
		expect(out).toMatchObject({
			status: "draft",
			title: "ADHD",
			headings: ["Ce este", "Pentru cine"],
		});
		expect(out?.excerpt).toBeUndefined();
	});

	it("a clinical page published without a reviewer is still 'in review'", () => {
		const out = ask(
			page({
				review: { kind: "clinical", status: "published", reviewedBy: null, reviewedAt: null },
			}),
		);
		expect(out?.status).toBe("in-review");
		expect(out?.excerpt).toBeUndefined();
	});

	it("a published operational page gets its excerpt", () => {
		const out = ask(
			page({
				kind: "page",
				sections: [{ text: "Programul este de luni până vineri." }],
				review: { kind: "operational", status: "published", reviewedBy: null, reviewedAt: null },
			}),
		);
		expect(out).toMatchObject({
			status: "published",
			excerpt: "Programul este de luni până vineri.",
		});
	});

	it("an unknown path is no page", () => {
		expect(ask(page({}), "/altceva")).toBeUndefined();
	});
});

describe("the reference a page posts", () => {
	it("keeps a path and a typed target", () => {
		expect(parsePageRef({ path: "/articole/x", kind: "article", slug: "x" })).toEqual({
			path: "/articole/x",
			target: { kind: "article", slug: "x" },
		});
		expect(parsePageRef({ path: "/copii/adhd", kind: "hub", id: "adhd" })?.target).toEqual({
			kind: "hub",
			id: "adhd",
		});
	});

	it("treats anything malformed as no reference, and empty strings as absent", () => {
		expect(parsePageRef("x")).toBeUndefined();
		expect(parsePageRef({ path: "https://evil.example/x" })).toBeUndefined();
		expect(parsePageRef({ path: "//evil.example" })).toBeUndefined();
		expect(parsePageRef({ path: "/a b" })).toBeUndefined();
		expect(parsePageRef({ path: "", kind: "", slug: "", id: "" })).toBeUndefined();
		expect(parsePageRef({ path: "/ok", kind: "article", slug: "Bad Slug" })).toEqual({
			path: "/ok",
		});
	});
});

describe("excerpts", () => {
	it("stay within the budget, favour the sections the question names, keep reading order", () => {
		const names = [
			"mango",
			"mango",
			"mango",
			"zebra",
			"mango",
			"mango",
			"mango",
			"mango",
			"mango",
			"koala",
			"mango",
			"mango",
		];
		const sections = names.map((name, i) => ({
			heading: `Secțiunea ${i}`,
			text: `${words(30, name)}.`,
		}));
		const out = excerptOf(sections, "zebra și koala", 600);
		expect(out.length).toBeLessThanOrEqual(700);
		expect(out.indexOf("Secțiunea 3")).toBeGreaterThanOrEqual(0);
		expect(out.indexOf("Secțiunea 9")).toBeGreaterThan(out.indexOf("Secțiunea 3"));
		expect(out).not.toContain("Secțiunea 11");
	});
});

describe("the page each turn was asked on", () => {
	it("is kept as a path on both turns and handed back as the page's title", () => {
		const turns = continueConversation([], "salut", { answer: "bună" }, "/articole/x");
		expect(turns.map((t) => t.page)).toEqual(["/articole/x", "/articole/x"]);
		const history = historyOf(turns, 10, (p) => (p === "/articole/x" ? "Titlu X" : undefined));
		expect(history).toEqual([
			{ role: "user", text: "salut", page: "Titlu X" },
			{ role: "guide", text: "bună", page: "Titlu X" },
		]);
	});

	it("drops a page that is not a plain path, and a turn with no page stays as before", () => {
		const raw: ReadonlyArray<ConversationTurn> = [
			{ role: "user", text: "a", page: "javascript:x" },
		];
		expect(continueConversation(raw, "b", { answer: "c" }).every((t) => t.page === undefined)).toBe(
			true,
		);
		expect(historyOf([{ role: "user", text: "a" }])).toEqual([{ role: "user", text: "a" }]);
	});
});
