import type { AskInput, Guide } from "@psi/guide";
import { answerGuidePost } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { currentArticles } from "./content/articles";
import { guideLabels } from "./guide";
import type { Locale } from "./i18n";
import { pageRegistry, pageResolver } from "./page-context";
import { GuidePanel } from "./sections/guide-panel";

const articles = currentArticles();
const editorial = articles.find((a) => a.status === "published" && a.kind === "editorial");
const draft = articles.find((a) => a.status === "draft");

/**
 * Posts one question to the blog's `/ghid` as server.tsx mounts it (its labels, its page resolver)
 * and returns what the guide was asked.
 */
async function ask(
	body: Record<string, unknown>,
	target: "guide-answer" | "compass-answer" = "guide-answer",
	locale: Locale = "ro",
): Promise<AskInput | undefined> {
	const asked: AskInput[] = [];
	const guide: Guide = {
		brand: "blog",
		model: "test",
		async *ask(input) {
			asked.push(input);
			yield { type: "text", delta: "R." };
			yield { type: "done" };
		},
	};
	const app = new Hono();
	app.post("/ghid", (c) =>
		answerGuidePost(c, {
			locale,
			labels: guideLabels(locale),
			guide: async () => guide,
			page: pageResolver,
		}),
	);
	const res = await app.request(`/ghid?target=${target}`, {
		method: "POST",
		headers: { "content-type": "application/json", "datastar-request": "true" },
		body: JSON.stringify(body),
	});
	await res.text();
	return asked[0];
}

describe("the page the blog's guide finds", () => {
	it("has an article of each state to test against", () => {
		expect(editorial).toBeDefined();
		expect(draft).toBeDefined();
	});

	it("a published article: its excerpt, title and address", () => {
		if (editorial === undefined) return;
		const page = pageResolver(
			{ path: "/x", target: { kind: "article", slug: editorial.slug } },
			"ro",
			"ce spune?",
		);
		expect(page?.status).toBe("published");
		expect(page?.title).toBe(editorial.title.ro);
		expect(page?.url).toMatch(new RegExp(`/articole/${editorial.slug}$`));
		expect(page?.excerpt?.length ?? 0).toBeGreaterThan(0);
	});

	it("a draft: title, standfirst and headings, never its body", () => {
		if (draft === undefined || draft.status !== "draft") return;
		const page = pageResolver({ path: `/articole/${draft.slug}` }, "ro", "ce spune?");
		expect(page?.status).toBe("draft");
		expect(page?.lead).toBe(draft.standfirst.ro);
		expect(page?.excerpt).toBeUndefined();
	});

	it("an unknown slug is no page", () => {
		expect(pageResolver({ path: "/articole/nu-exista-asa-ceva" }, "ro", "x")).toBeUndefined();
	});
});

describe("the blog's /ghid route", () => {
	it("resolves the article panel's reference and hands the guide the page it found", async () => {
		if (editorial === undefined) return;
		const input = await ask({
			question: "poți să-mi zici mai multe despre acest articol?",
			guidePage: { path: `/articole/${editorial.slug}`, kind: "article", slug: editorial.slug },
		});
		expect(input?.page?.title).toBe(editorial.title.ro);
		expect(input?.page?.status).toBe("published");
		expect(input?.question).toBe("poți să-mi zici mai multe despre acest articol?");
	});

	it("resolves the floating compass by its path alone, in English too", async () => {
		if (editorial === undefined) return;
		const input = await ask(
			{
				compassOp: "ask",
				compassQuery: "what does it say?",
				compassTurns: [],
				compassPage: { path: `/en/articles/${editorial.slug}` },
			},
			"compass-answer",
			"en",
		);
		expect(input?.page?.title).toBe(editorial.title.en);
		expect(input?.page?.url).toContain(`/en/articles/${editorial.slug}`);
	});

	it("tells the guide a draft is a draft, with no body", async () => {
		if (draft === undefined) return;
		const input = await ask({
			question: "ce spune articolul acesta?",
			guidePage: { path: `/articole/${draft.slug}`, kind: "article", slug: draft.slug },
		});
		expect(input?.page).toMatchObject({ status: "draft", title: draft.title.ro });
		expect(input?.page?.excerpt).toBeUndefined();
	});

	it("answers a forged or unknown reference as a question on no page", async () => {
		const input = await ask({
			question: "ce spune articolul acesta?",
			guidePage: { path: "/articole/nu-exista", kind: "article", slug: "nu-exista" },
		});
		expect(input?.question).toBe("ce spune articolul acesta?");
		expect(input?.page).toBeUndefined();
	});
});

describe("the article's panel", () => {
	it("sends the article it is under with every question", () => {
		const html = String(
			GuidePanel({
				locale: "ro",
				placeholder: "p",
				intro: "i",
				page: { kind: "article", slug: "neurofeedback-pentru-atentie" },
			}),
		).replaceAll("&quot;", '"');
		expect(html).toContain('kind: "article", slug: "neurofeedback-pentru-atentie"');
	});
});

describe("every other page, as the server renders it", () => {
	const page = (title: string) =>
		`<html><head><title>${title} — Site</title><meta name="description" content="Descriere ${title}"></head><body><main><h1>${title}</h1><p>Text ${title}.</p><h2>Secțiune ${title}</h2><p>Mai mult text.</p></main></body></html>`;
	pageRegistry.connect(
		async (path) =>
			new Response(page(path.replace(/\W+/g, " ").trim()), {
				headers: { "content-type": "text/html" },
			}),
	);

	it("gives a page no resolver knows its title, lead and headings, from the server alone", async () => {
		await pageRegistry.ensure("/topic/x");
		const found = pageResolver({ path: "/topic/x" }, "ro", "ce e pe pagina asta?");
		expect(found?.title).toBeTruthy();
		expect(found?.lead).toContain("Descriere");
		expect(found?.headings[0]).toContain("Secțiune");
		expect(found?.clinical).toBe(false);
	});
});
