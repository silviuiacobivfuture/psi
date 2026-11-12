import type { AskInput, Guide } from "@psi/guide";
import { answerGuidePost } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { guideLabels } from "./guide";
import type { Locale } from "./i18n";
import { pageResolver } from "./page-context";

/** Posts one question to this site's `/ghid` as server.tsx mounts it, and returns what the guide was asked. */
async function ask(
	body: Record<string, unknown>,
	target: "guide-answer" | "compass-answer" = "guide-answer",
	locale: Locale = "ro",
): Promise<AskInput | undefined> {
	const asked: AskInput[] = [];
	const guide: Guide = {
		brand: "eqsync",
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

describe("the page the visitor is on", () => {
	it("is found by the compass from its path alone: title, headings and an excerpt", async () => {
		const input = await ask(
			{
				compassOp: "ask",
				compassQuery: "ce spune pagina asta?",
				compassTurns: [],
				compassPage: { path: "/metoda" },
			},
			"compass-answer",
		);
		expect(input?.page?.kind).toBe("page");
		expect(input?.page?.status).toBe("published");
		expect(input?.page?.url).toBe("/metoda");
		expect(input?.page?.headings.length).toBeGreaterThan(0);
		expect(input?.page?.excerpt?.length ?? 0).toBeGreaterThan(0);
	});

	it("is found under the English route, by the English path", async () => {
		const input = await ask(
			{
				compassOp: "ask",
				compassQuery: "what does this page say?",
				compassTurns: [],
				compassPage: { path: "/en/method" },
			},
			"compass-answer",
			"en",
		);
		expect(input?.page?.url).toBe("/en/method");
		expect(input?.page?.title).toBeTruthy();
	});

	it("is resolved the same for the ask bar's typed reference", async () => {
		const input = await ask({
			question: "ce spune?",
			guidePage: { path: "/metoda" },
		});
		expect(input?.page?.url).toBe("/metoda");
	});

	it("is no page for a path off the site, a forged id or another brand's article", async () => {
		for (const guidePage of [
			{ path: "/nu-exista-pagina" },
			{ path: "/x", kind: "page", id: "nu-exista" },
			{ path: "/articole/editorial", kind: "article", slug: "nu-exista" },
		]) {
			const input = await ask({ question: "ce spune?", guidePage });
			expect(input?.question).toBe("ce spune?");
			expect(input?.page, JSON.stringify(guidePage)).toBeUndefined();
		}
	});
});

describe("the science page", () => {
	it("carries research claims no clinician has approved: headings only, said to be in review", async () => {
		const input = await ask({ question: "ce spune?", guidePage: { path: "/stiinta" } });
		expect(input?.page?.status).toBe("in-review");
		expect(input?.page?.headings.length).toBeGreaterThan(0);
		expect(input?.page?.excerpt).toBeUndefined();
	});
});
