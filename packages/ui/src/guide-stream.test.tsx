/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Guide, GuideEvent } from "@psi/guide";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GuideLabels } from "./components/guide-answer";
import { parseAnswerTarget, parseAskSignals, questionFor, streamGuideAnswer } from "./guide-stream";

const labels: GuideLabels = {
	thinking: "T",
	footer: "F",
	contact: { label: "C", href: "/c" },
	reviewedBy: (name, date) => `R ${name} ${date}`,
	refusals: {
		crisis: <div class="crisis">112</div>,
		out_of_scope: "OOS",
		no_content: "NC",
		unavailable: "U",
	},
};

function fakeGuide(events: ReadonlyArray<GuideEvent>): Guide {
	return {
		brand: "eqsync",
		model: "test",
		async *ask() {
			yield* events;
		},
	};
}

async function patches(events: ReadonlyArray<GuideEvent>): Promise<string[]> {
	const app = new Hono();
	app.post("/", (c) =>
		streamGuideAnswer(c, {
			guide: fakeGuide(events),
			locale: "ro",
			question: "Q",
			target: "guide-answer",
			labels,
		}),
	);
	const body = await (await app.request("/", { method: "POST" })).text();
	return body
		.split("\n")
		.filter((l) => l.startsWith("data: elements "))
		.map((l) => l.slice("data: elements ".length));
}

describe("streamGuideAnswer", () => {
	it("streams thinking, the text, then the answer with its cited, reviewed sources", async () => {
		const out = await patches([
			{ type: "thinking" },
			{ type: "text", delta: "Hello. " },
			{ type: "text", delta: "World [1]." },
			{
				type: "sources",
				sources: [
					{ id: "a", title: "A", url: "/a", reviewedBy: "Dr X", reviewedAt: "2026-01-02" },
					{ id: "b", title: "B", url: "/b", reviewedBy: null, reviewedAt: null },
				],
			},
			{ type: "done" },
		]);
		expect(out).toHaveLength(4);
		expect(out[0]).toContain('aria-busy="true"');
		expect(out[0]).toContain("T");
		expect(out[1]).toContain(">Hello. </span>");
		expect(out[2]).toContain(">Hello. World [1].</span>");
		const done = out[3] ?? "";
		expect(done).toContain('aria-busy="false"');
		expect(done).toContain('data-done=""');
		expect(done).toContain('<a class="pz-msg__source" href="/a">A · R Dr X 2026-01-02</a>');
		expect(done).toContain('<a class="pz-msg__source" href="/b">B</a>');
		expect(done).toContain('<p class="mt-3 text-body-sm text-ink-faint">F</p>');
		for (const html of out) expect(html).not.toContain("\n");
	});

	it("replaces a partial answer with a refusal and points to the contact source", async () => {
		const out = await patches([
			{ type: "thinking" },
			{ type: "text", delta: "Partial." },
			{ type: "refusal", reason: "out_of_scope" },
			{ type: "done" },
		]);
		expect(out).toHaveLength(3);
		expect(out[2]).toContain("<p>OOS</p>");
		expect(out[2]).toContain('href="/c">C</a>');
		expect(out[2]).not.toContain("Partial.");
	});

	it("renders the app's crisis block as given, with no sources", async () => {
		const out = await patches([{ type: "refusal", reason: "crisis" }, { type: "done" }]);
		expect(out.at(-1)).toContain('<div class="pz-msg__bubble"><div class="crisis">112</div></div>');
		expect(out.at(-1)).not.toContain("pz-msg__source");
	});
});

describe("asking", () => {
	it("parses the posted signals and the target", () => {
		expect(parseAskSignals(null)).toBeNull();
		expect(parseAskSignals([])).toBeNull();
		expect(parseAskSignals({ question: 1 })).toBeNull();
		expect(parseAskSignals({ question: "a", other: 2 })).toEqual({
			question: "a",
			compassQuery: undefined,
		});
		expect(parseAnswerTarget("compass-answer")).toBe("compass-answer");
		expect(parseAnswerTarget("nope")).toBe("guide-answer");
		expect(parseAnswerTarget(undefined)).toBe("guide-answer");
	});

	it("picks the asking field's question, trimmed and bounded", () => {
		expect(questionFor("guide-answer", { question: "  hi  " })).toBe("hi");
		expect(questionFor("compass-answer", { question: "hi" })).toBeNull();
		expect(questionFor("compass-answer", { compassQuery: "where" })).toBe("where");
		expect(questionFor("guide-answer", { question: "   " })).toBeNull();
		expect(questionFor("guide-answer", { question: "x".repeat(501) })).toBeNull();
		expect(questionFor("guide-answer", { question: "x".repeat(500) })).toHaveLength(500);
	});
});
