/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { ConversationTurn, Guide, GuideEvent } from "@psi/guide";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
	guideHistory,
	parseAskSignals,
	streamGuideAnswer,
} from "../guide-stream";
import { exchangesOf } from "./guide-answer";
import { jsString, retryExpression, withoutCitations } from "./guide-exchange";
import type { GuideLabels } from "./guide-labels";

const LABELS: GuideLabels = {
	thinking: "T",
	stages: { searching: "SEARCHING", checking: "CHECKING" },
	footer: "F",
	contact: { label: "C", href: "/c" },
	reviewedBy: (name, date) => `R ${name} ${date}`,
	refusals: {
		crisis: <div class="crisis">112</div>,
		out_of_scope: "OOS",
		injection: "INJ",
		abuse: "ABUSE",
		rate_limited: "RATE",
		exchange_limit: "EXCH",
		no_content: "NC",
		unavailable: "U",
	},
	retry: "RETRY",
	dropped: "DROPPED",
	unanswered: "UNANSWERED",
};

async function lines(
	events: ReadonlyArray<GuideEvent>,
	body: unknown,
): Promise<string[]> {
	const guide: Guide = {
		brand: "eqsync",
		model: "test",
		async *ask() {
			yield* events;
		},
	};
	const app = new Hono();
	app.post("/", (c) =>
		streamGuideAnswer(c, {
			guide,
			locale: "ro",
			question: "Q",
			target: "compass-answer",
			labels: LABELS,
			signals: parseAskSignals(body),
		}),
	);
	return (await (await app.request("/", { method: "POST" })).text()).split(
		"\n",
	);
}

describe("an exchange in the compass", () => {
	it("leaves the field alone (the page empties it) and clears the pending question when answered", async () => {
		const out = await lines([{ type: "text", delta: "A." }, { type: "done" }], {
			compassQuery: "Q",
		});
		expect(out.some((l) => l.includes('"question": ""'))).toBe(false);
		const last = out.filter((l) => l.startsWith("data: signals ")).at(-1) ?? "";
		expect(JSON.parse(last.slice("data: signals ".length))).toEqual({
			compassTurns: [
				{ role: "user", text: "Q" },
				{ role: "guide", text: "A." },
			],
			compassPending: "",
		});
		expect(out).toContain("data: selector #compass-answer");
	});

	it("shows what the guide is doing in the typing indicator", async () => {
		const events: GuideEvent[] = [
			{ type: "thinking", stage: "searching" },
			{ type: "thinking", stage: "checking" },
			{ type: "text", delta: "A." },
			{ type: "done" },
		];
		const out = (await lines(events, { compassQuery: "Q" })).filter((l) =>
			l.startsWith("data: elements "),
		);
		expect(out[0]).toContain('class="pz-typing__label">T<');
		expect(out[1]).toContain('class="pz-typing__label">SEARCHING<');
		expect(out[2]).toContain('class="pz-typing__label">CHECKING<');
	});

	it("ends a broken stream with the unavailable refusal and a way to ask again, keeping the question pending", async () => {
		const out = await lines([{ type: "thinking" }], { compassQuery: "Q" });
		const last =
			out.filter((l) => l.startsWith("data: elements ")).at(-1) ?? "";
		expect(last).toContain("<p>U</p>");
		expect(last).toContain('class="pz-exchange__retry"');
		expect(out.some((l) => l.startsWith("data: signals "))).toBe(false);
	});

	it("carries a hidden retry note and an unanswered note while busy, for the page to reveal", async () => {
		const first = (await lines([{ type: "thinking" }], {})).find((l) =>
			l.startsWith("data: elements "),
		);
		expect(first).toContain("data-guide-dropped");
		expect(first).toContain("data-guide-superseded");
		expect(first).toContain('aria-busy="true"');
	});
});

describe("the conversation's turns", () => {
	const turns: ReadonlyArray<ConversationTurn> = [
		{ role: "user", text: "one" },
		{ role: "guide", text: "Answer [1]." },
		{ role: "user", text: "replaced" },
		{ role: "user", text: "refused" },
		{ role: "guide", text: "", refused: "out_of_scope" },
		{ role: "user", text: "three" },
		{ role: "guide", text: "Third." },
	];

	it("never sends an unanswered or refused question as history", () => {
		expect(guideHistory(turns)).toEqual([
			{ role: "user", text: "one" },
			{ role: "guide", text: "Answer [1]." },
			{ role: "user", text: "three" },
			{ role: "guide", text: "Third." },
		]);
	});

	it("reads back as exchanges: answered, unanswered, refused", () => {
		expect(exchangesOf(turns).map((x) => [x.question, x.phase.kind])).toEqual([
			["one", "done"],
			["replaced", "superseded"],
			["refused", "refused"],
			["three", "done"],
		]);
	});
});

describe("text inside Datastar expressions", () => {
	it("never reads a question as a signal or an action", () => {
		expect(jsString("costs $5 @post('/x')")).toBe(
			"\"costs \\u00245 \\u0040post('/x')\"",
		);
		const retry = retryExpression("compass-answer", "$compassOpen @get(");
		expect(retry).not.toMatch(/\$compassOpen|@get/);
		expect(retry).toContain('form[aria-controls="compass-answer"]');
	});

	it("drops citation markers from an answer shown without its sources", () => {
		expect(
			withoutCitations("Da [1]. Închis sâmbăta [2, 3], și duminica [4–5] ."),
		).toBe("Da. Închis sâmbăta, și duminica.");
	});
});

describe("the little markdown in an answer", () => {
	it("renders bold and links to this site, as elements; other links keep only their label", async () => {
		const { Paragraphs } = await import("./guide-exchange");
		const html = String(
			<Paragraphs
				text={
					"**Contact:** [pagina de contact](/contact), [rău](javascript:void) și [afară](https://evil.example) [tot afară](/\\evil.example) <b>x</b>"
				}
			/>,
		);
		expect(html).toBe(
			'<span class="pz-para"><strong>Contact:</strong> <a href="/contact">pagina de contact</a>, rău și afară tot afară &lt;b&gt;x&lt;/b&gt;</span>',
		);
	});
});
