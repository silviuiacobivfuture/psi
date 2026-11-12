/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import {
	type AskInput,
	type Guide,
	type GuideEvent,
	historyOf,
} from "@psi/guide";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GuideLabels } from "./components/guide-labels";
import {
	parseAnswerTarget,
	parseAskSignals,
	questionFor,
	streamGuideAnswer,
} from "./guide-stream";

const labels: GuideLabels = {
	thinking: "T",
	stages: { searching: "SEARCHING", checking: "CHECKING" },
	retry: "RETRY",
	dropped: "DROPPED",
	unanswered: "UNANSWERED",
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
					{
						id: "a",
						title: "A",
						url: "/a",
						reviewedBy: "Dr X",
						reviewedAt: "2026-01-02",
					},
					{
						id: "b",
						title: "B",
						url: "/b",
						reviewedBy: null,
						reviewedAt: null,
					},
				],
			},
			{ type: "done" },
		]);
		expect(out).toHaveLength(4);
		expect(out[0]).toContain('aria-busy="true"');
		expect(out[0]).toContain("T");
		expect(out[1]).toContain(">Hello.</span>");
		expect(out[2]).toContain(">Hello. World [1].</span>");
		const done = out[3] ?? "";
		expect(done).toContain('aria-busy="false"');
		expect(done).toContain('data-done=""');
		expect(done).toContain(
			'<a class="pz-msg__source" href="/a">A · R Dr X 2026-01-02</a>',
		);
		expect(done).toContain('<a class="pz-msg__source" href="/b">B</a>');
		expect(done).toContain('<p class="pz-msg__footer">F</p>');
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

	it("starts the reply over on replace, then keeps appending, and remembers the final text", async () => {
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: fakeGuide([
					{ type: "thinking" },
					{ type: "text", delta: "Wrong one." },
					{ type: "replace", text: "" },
					{ type: "text", delta: "Right " },
					{ type: "text", delta: "one." },
					{ type: "replace", text: "Right one, corrected." },
					{ type: "done" },
				]),
				locale: "ro",
				question: "Q",
				target: "compass-answer",
				labels,
			}),
		);
		const lines = (
			await (await app.request("/", { method: "POST" })).text()
		).split("\n");
		const out = lines
			.filter((l) => l.startsWith("data: elements "))
			.map((l) => l.slice("data: elements ".length));
		// thinking, "Wrong one.", thinking again (replace with no text), two deltas, the full text, done.
		expect(out).toHaveLength(7);
		expect(out[2]).toContain("T");
		expect(out[2]).not.toContain("Wrong one.");
		expect(out[4]).toContain(">Right one.</span>");
		expect(out[5]).toContain(">Right one, corrected.</span>");
		expect(out[6]).toContain('data-done=""');
		expect(out[6]).not.toContain("Wrong one.");
		const turns =
			lines.find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		expect(
			JSON.parse(turns.slice("data: signals ".length)).compassTurns.at(-1),
		).toEqual({
			role: "guide",
			text: "Right one, corrected.",
		});
	});

	it("treats a reply with no words as broken, never as an empty answer", async () => {
		const out = await patches([{ type: "thinking" }, { type: "done" }]);
		expect(out.at(-1)).toContain("<p>U</p>");
		expect(out.at(-1)).not.toContain('data-done=""');
	});

	it("renders the app's crisis block as given, with no sources", async () => {
		const out = await patches([
			{ type: "refusal", reason: "crisis" },
			{ type: "done" },
		]);
		expect(out.at(-1)).toContain(
			'<div class="pz-msg__bubble"><div class="crisis">112</div></div>',
		);
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
			guideTurns: [],
			compassTurns: [],
		});
		expect(parseAnswerTarget("compass-answer")).toBe("compass-answer");
		expect(parseAnswerTarget("nope")).toBe("guide-answer");
		expect(parseAnswerTarget(undefined)).toBe("guide-answer");
	});

	it("picks the asking field's question, trimmed and bounded", () => {
		expect(questionFor("guide-answer", { question: "  hi  " })).toBe("hi");
		expect(questionFor("compass-answer", { question: "hi" })).toBeNull();
		expect(questionFor("compass-answer", { compassQuery: "where" })).toBe(
			"where",
		);
		expect(questionFor("guide-answer", { question: "   " })).toBeNull();
		expect(
			questionFor("guide-answer", { question: "x".repeat(501) }),
		).toBeNull();
		expect(
			questionFor("guide-answer", { question: "x".repeat(500) }),
		).toHaveLength(500);
	});
});

describe("conversation mode", () => {
	function recordingGuide(
		events: ReadonlyArray<GuideEvent>,
		seen: Array<AskInput>,
	): Guide {
		return {
			brand: "eqsync",
			model: "test",
			async *ask(input) {
				seen.push(input);
				yield* events;
			},
		};
	}

	async function converse(
		events: ReadonlyArray<GuideEvent>,
		body: unknown,
		target: "guide-answer" | "compass-answer" = "guide-answer",
	): Promise<{ seen: Array<AskInput>; lines: string[] }> {
		const seen: Array<AskInput> = [];
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: recordingGuide(events, seen),
				locale: "ro",
				question: "Și sâmbăta?",
				target,
				labels,
				signals: parseAskSignals(body),
			}),
		);
		const text = await (await app.request("/", { method: "POST" })).text();
		return { seen, lines: text.split("\n") };
	}

	const earlier = [
		{ role: "user", text: "Când e deschis?" },
		{ role: "guide", text: "Luni-vineri, 9-18 [1]." },
	];

	it("passes the field's earlier turns as history, sends only the new exchange, and appends the answered turn", async () => {
		const { seen, lines } = await converse(
			[{ type: "text", delta: "Sâmbăta e închis [1]." }, { type: "done" }],
			{
				question: "x",
				guideTurns: earlier,
				compassTurns: [{ role: "user", text: "other" }],
			},
		);
		expect(seen[0]?.history).toEqual(earlier);
		// Only the new exchange is sent, appended to the transcript; earlier ones stay as they are.
		const first = lines.findIndex((l) => l.startsWith("data: elements "));
		expect(lines[first - 2]).toBe("data: selector #guide-answer");
		expect(lines[first - 1]).toBe("data: mode append");
		expect(lines[first]).toContain("Și sâmbăta?");
		const sent = lines.filter((l) => l.startsWith("data: elements ")).join();
		expect(sent).not.toContain("Când e deschis?");
		const patch = lines.find((l) =>
			l.startsWith('data: signals {"guideTurns"'),
		);
		expect(JSON.parse((patch ?? "").slice("data: signals ".length))).toEqual({
			guideTurns: [
				...earlier,
				{ role: "user", text: "Și sâmbăta?" },
				{ role: "guide", text: "Sâmbăta e închis [1]." },
			],
		});
	});

	it("keeps the compass's conversation apart", async () => {
		const { seen, lines } = await converse(
			[{ type: "text", delta: "Da [1]." }, { type: "done" }],
			{ compassQuery: "x", guideTurns: earlier },
			"compass-answer",
		);
		expect(seen[0]?.history).toBeUndefined();
		expect(
			lines.find((l) => l.startsWith('data: signals {"compassTurns"')),
		).toBeDefined();
	});

	it("keeps a refused turn visible, but never sends it as history", async () => {
		const { lines } = await converse(
			[{ type: "refusal", reason: "no_content" }, { type: "done" }],
			{ guideTurns: earlier },
		);
		const patch = lines.find((l) =>
			l.startsWith('data: signals {"guideTurns"'),
		);
		const turns = JSON.parse(
			(patch ?? "").slice("data: signals ".length),
		).guideTurns;
		expect(turns).toEqual([
			...earlier,
			{ role: "user", text: "Și sâmbăta?" },
			{ role: "guide", text: "", refused: "no_content" },
		]);
		const next = await converse(
			[{ type: "text", delta: "Da [1]." }, { type: "done" }],
			{
				guideTurns: turns,
			},
		);
		expect(next.seen[0]?.history).toEqual(earlier);
		expect(next.lines.find((l) => l.startsWith("data: elements "))).toContain(
			"Și sâmbăta?",
		);
	});

	it("never leaves the visitor at thinking when the stream breaks", async () => {
		const broken: Guide = {
			brand: "eqsync",
			model: "test",
			async *ask() {
				yield { type: "thinking" };
				throw new Error("boom");
			},
		};
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: broken,
				locale: "ro",
				question: "Q",
				target: "guide-answer",
				labels,
			}),
		);
		const out = (await (await app.request("/", { method: "POST" })).text())
			.split("\n")
			.filter((l) => l.startsWith("data: elements "));
		expect(out.at(-1)).toContain("<p>U</p>");
		expect(out.at(-1)).toContain('aria-busy="false"');
	});

	it("sets the session and browser cookies and counts three visitor keys", async () => {
		const seen: Array<ReadonlyArray<string> | undefined> = [];
		const keyed: Guide = {
			brand: "eqsync",
			model: "test",
			async *ask(_input, control) {
				seen.push(control?.visitorKeys);
				yield { type: "done" };
			},
		};
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: keyed,
				locale: "ro",
				question: "Q",
				target: "guide-answer",
				labels,
			}),
		);
		const res = await app.request("/", {
			method: "POST",
			headers: { "x-forwarded-for": "203.0.113.7" },
		});
		await res.text();
		const cookies = res.headers.getSetCookie();
		expect(
			cookies.some(
				(v) => v.startsWith("psi_guide_session=") && !/Max-Age/i.test(v),
			),
		).toBe(true);
		expect(
			cookies.some(
				(v) => v.startsWith("psi_guide_browser=") && /Max-Age=31536000/.test(v),
			),
		).toBe(true);
		for (const v of cookies) {
			expect(v).toMatch(/HttpOnly/);
			expect(v).toMatch(/SameSite=Lax/);
		}
		expect(seen[0]?.map((k) => k.split(":")[0])).toEqual([
			"session",
			"browser",
			"fingerprint",
		]);
		const session =
			/psi_guide_session=([^;]+)/.exec(cookies.join(";"))?.[1] ?? "";
		const again = await app.request("/", {
			method: "POST",
			headers: { cookie: `psi_guide_session=${session}` },
		});
		await again.text();
		expect(seen[1]?.[0]).toBe(`session:${session}`);
		// No client address: no fingerprint, so one browser never stands for everyone.
		expect(seen[1]?.map((k) => k.split(":")[0])).toEqual([
			"session",
			"browser",
		]);
		expect(
			again.headers
				.getSetCookie()
				.some((v) => v.startsWith("psi_guide_session=")),
		).toBe(false);
	});

	it("treats a malformed or oversized conversation as none, and keeps only the last turns", async () => {
		expect(parseAskSignals({ guideTurns: "nope" })?.guideTurns).toEqual([]);
		expect(
			parseAskSignals({ guideTurns: [{ role: "system", text: "x" }] })
				?.guideTurns,
		).toEqual([]);
		const many = Array.from({ length: 30 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "guide",
			text: `t${i} ${"y".repeat(5000)}`,
		}));
		const kept = parseAskSignals({ guideTurns: many })?.guideTurns ?? [];
		expect(kept).toHaveLength(20);
		expect(kept[0]?.text.startsWith("t10 ")).toBe(true);
		for (const t of kept) expect(t.text.length).toBeLessThanOrEqual(4000);
		const history = historyOf(kept);
		expect(history).toHaveLength(10);
		expect(history[0]?.text.startsWith("t20 ")).toBe(true);
	});
});

describe("the asking field", () => {
	it("is emptied first, before the thinking patch, and the turns patch comes last", async () => {
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: fakeGuide([
					{ type: "text", delta: "Da [1]." },
					{ type: "done" },
				]),
				locale: "ro",
				question: "Q",
				target: "guide-answer",
				labels,
				signals: parseAskSignals({ question: "Q" }),
			}),
		);
		const lines = (await (await app.request("/", { method: "POST" })).text())
			.split("\n")
			.filter((l) => l.startsWith("data: "));
		expect(lines[0]).toBe('data: signals {"question": ""}');
		expect(lines[1]).toBe("data: selector #guide-answer");
		expect(lines[3]?.startsWith("data: elements ")).toBe(true);
		expect(lines.at(-1)?.startsWith('data: signals {"guideTurns":')).toBe(true);
	});
});
