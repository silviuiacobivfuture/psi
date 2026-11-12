import type { AskInput, Guide } from "@psi/guide";
import { answerGuidePost } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { HUBS } from "./content/hubs";
import { METHODS } from "./content/methods";
import { RICH_HUBS } from "./content/rich";
import { guideLabels } from "./guide";
import type { Locale } from "./i18n";
import { pageResolver } from "./page-context";

/** Posts one question to Psizone's `/ghid` as server.tsx mounts it, and returns what the guide was asked. */
async function ask(
	body: Record<string, unknown>,
	target: "guide-answer" | "compass-answer" = "guide-answer",
	locale: Locale = "ro",
): Promise<AskInput | undefined> {
	const asked: AskInput[] = [];
	const guide: Guide = {
		brand: "psizone",
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

describe("a hub", () => {
	const hub = HUBS.find((h) => h.id === "adhd");
	const rich = RICH_HUBS.adhd;

	it("is found by the ask bar's typed reference: title, lead and headings, no text", async () => {
		if (hub === undefined || rich === undefined) throw new Error("no ADHD hub");
		const input = await ask({
			question: "ce faceți pe pagina asta?",
			guidePage: { path: hub.path, kind: "hub", id: "adhd" },
		});
		expect(input?.page).toMatchObject({
			kind: "hub",
			status: "draft",
			title: "ADHD",
			url: hub.path,
			lead: rich.lead.ro,
			headings: rich.sections.map((s) => s.h2.ro),
		});
		expect(input?.page?.excerpt).toBeUndefined();
	});

	it("is found by the compass from its path alone, in English under /en", async () => {
		if (hub === undefined) throw new Error("no ADHD hub");
		const input = await ask(
			{
				compassOp: "ask",
				compassQuery: "what do you do here?",
				compassTurns: [],
				compassPage: { path: `/en${hub.path}` },
			},
			"compass-answer",
			"en",
		);
		expect(input?.page).toMatchObject({ kind: "hub", url: `/en${hub.path}`, status: "draft" });
	});

	it("has a page for every hub and every method, none of them with text", () => {
		for (const h of HUBS) {
			const page = pageResolver({ path: h.path, target: { kind: "hub", id: h.id } }, "ro", "x");
			expect(page?.title, h.id).toBeTruthy();
			expect(page?.excerpt, h.id).toBeUndefined();
		}
		for (const m of METHODS) {
			const page = pageResolver({ path: m.path, target: { kind: "method", id: m.id } }, "ro", "x");
			expect(page?.kind, m.id).toBe("method");
			expect(page?.excerpt, m.id).toBeUndefined();
		}
	});
});

describe("an information page", () => {
	it("the first visit: published, with an excerpt of its steps", async () => {
		const input = await ask({
			question: "ce se întâmplă la prima vizită?",
			guidePage: { path: "/prima-vizita" },
		});
		expect(input?.page?.status).toBe("published");
		expect(input?.page?.excerpt).toContain("Te sunăm noi");
	});
});

describe("what a visitor can forge", () => {
	it("an unknown hub, an article of another brand and a path off the site are no page", async () => {
		for (const guidePage of [
			{ path: "/copii/nu-exista", kind: "hub", id: "nu-exista" },
			{
				path: "/articole/nivelurile-focus-pe-intelees",
				kind: "article",
				slug: "nivelurile-focus-pe-intelees",
			},
			{ path: "/__admin/compass" },
		]) {
			const input = await ask({ question: "ce spune?", guidePage });
			expect(input?.question).toBe("ce spune?");
			expect(input?.page, JSON.stringify(guidePage)).toBeUndefined();
		}
	});
});
