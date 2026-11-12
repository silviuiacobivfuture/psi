/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { ConversationTurn, Guide } from "@psi/guide";
import { type Context, Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GuideLabels } from "./components/guide-labels";
import {
	answerGuidePost,
	MAX_GUIDE_BODY,
	mergeRemembered,
	parsePending,
} from "./guide-chat";
import {
	accountMemory,
	type GuideMemory,
	type MemoryAccount,
} from "./guide-memory";

const labels: GuideLabels = {
	thinking: "T",
	stages: { searching: "S", checking: "K" },
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

const guide: Guide = {
	brand: "psizone",
	model: "test",
	async *ask() {
		yield { type: "text", delta: "A." };
		yield { type: "done" };
	},
};

function fakeMemory(
	kept: ConversationTurn[],
): GuideMemory & { forgotten: number } {
	const memory = {
		forgotten: 0,
		async turns() {
			return kept;
		},
		async forget() {
			memory.forgotten += 1;
			kept.length = 0;
		},
	};
	return memory;
}

async function post(
	body: unknown,
	opts: {
		memory?: GuideMemory | null;
		headers?: Record<string, string>;
		raw?: string;
	} = {},
): Promise<{
	status: number;
	elements: string[];
	signals: Record<string, unknown>;
}> {
	const app = new Hono();
	app.post("/ghid", (c) =>
		answerGuidePost(c, {
			locale: "ro",
			labels,
			guide: async () => guide,
			memory: async () => opts.memory ?? null,
		}),
	);
	const res = await app.request("/ghid?target=compass-answer", {
		method: "POST",
		headers: { "content-type": "application/json", ...opts.headers },
		body: opts.raw ?? JSON.stringify(body),
	});
	const lines = (await res.text()).split("\n");
	const elements = lines
		.filter((l) => l.startsWith("data: elements "))
		.map((l) => l.slice("data: elements ".length));
	const last = lines.filter((l) => l.startsWith("data: signals ")).at(-1);
	const signals: Record<string, unknown> =
		last === undefined ? {} : JSON.parse(last.slice("data: signals ".length));
	return { status: res.status, elements, signals };
}

const turns: ConversationTurn[] = [
	{ role: "user", text: "Când e deschis?" },
	{ role: "guide", text: "Luni-vineri [1]." },
	{ role: "user", text: "Și sâmbăta?" },
	{ role: "guide", text: "", refused: "no_content" },
];

describe("restoring the compass's transcript", () => {
	it("renders the kept turns as exchanges, citation markers dropped, and sends the turns back", async () => {
		const { elements, signals } = await post({
			compassOp: "restore",
			compassTurns: turns,
		});
		expect(elements).toHaveLength(1);
		const html = elements[0] ?? "";
		expect(html).toMatch(
			/^<div id="compass-answer" class="pz-compass__answer" role="log"/,
		);
		expect(html.match(/class="pz-exchange"/g)).toHaveLength(2);
		expect(html).toContain(">Luni-vineri.</span>");
		expect(html).toContain("<p>NC</p>");
		expect(signals).toEqual({
			compassTurns: turns,
			compassPending: "",
			compassRemembered: false,
		});
	});

	it("shows a question left mid-answer with a way to ask it again", async () => {
		const { elements, signals } = await post({
			compassOp: "restore",
			compassTurns: turns,
			compassPending: "  Și duminica? ",
		});
		expect(elements[0]).toContain(">Și duminica?</div>");
		expect(elements[0]).toContain("DROPPED");
		expect(elements[0]).toContain('class="pz-exchange__retry"');
		expect(signals.compassPending).toBe("Și duminica?");
	});

	it("is bounded: the last twenty well-formed turns, a pending question within the limit", async () => {
		const many = Array.from({ length: 40 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "guide",
			text: `t${i} ${"y".repeat(5000)}`,
		}));
		const { signals } = await post({
			compassOp: "restore",
			compassTurns: many,
			compassPending: "x".repeat(501),
		});
		const kept = signals.compassTurns;
		expect(Array.isArray(kept) && kept.length).toBe(20);
		expect(signals.compassPending).toBe("");
		expect(parsePending(" a ")).toBe("a");
	});

	it("treats malformed turns as no conversation, and a malformed body as nothing to do", async () => {
		const { signals } = await post({
			compassOp: "restore",
			compassTurns: [{ role: "system", text: "<script>" }],
		});
		expect(signals.compassTurns).toEqual([]);
		expect((await post(null, { raw: "{nope" })).status).toBe(204);
		expect((await post({ compassOp: "drop-tables" })).status).toBe(204);
	});

	it("reads an empty `refused` (a key a reactive signal object can carry) as no refusal", async () => {
		const posted = turns.map((t) => ({ refused: "", ...t }));
		const { signals } = await post({
			compassOp: "restore",
			compassTurns: posted,
		});
		expect(signals.compassTurns).toEqual(turns);
	});

	it("refuses a body larger than the limit", async () => {
		const huge = "x".repeat(MAX_GUIDE_BODY + 1);
		expect((await post(null, { raw: huge })).status).toBe(413);
	});

	it("takes a remembered conversation as the source, across devices", async () => {
		const kept: ConversationTurn[] = [
			{ role: "user", text: "Primul" },
			{ role: "guide", text: "Răspuns 1." },
		];
		const { elements, signals } = await post(
			{ compassOp: "restore", compassTurns: [], compassPending: "Primul" },
			{ memory: fakeMemory(kept) },
		);
		expect(elements[0]).toContain("Răspuns 1.");
		// Answered on the server after the page went away: no longer pending.
		expect(signals).toEqual({
			compassTurns: kept,
			compassPending: "",
			compassRemembered: true,
		});
	});
});

describe("merging a remembered conversation with this device's turns", () => {
	const remembered: ConversationTurn[] = [
		{ role: "user", text: "a" },
		{ role: "guide", text: "A" },
		{ role: "user", text: "b" },
		{ role: "guide", text: "B" },
	];

	it("keeps what came after the last remembered question on this device", () => {
		const local: ConversationTurn[] = [
			{ role: "user", text: "b" },
			{ role: "guide", text: "B" },
			{ role: "user", text: "c" },
			{ role: "guide", text: "", refused: "abuse" },
		];
		expect(mergeRemembered(remembered, local)).toEqual([
			...remembered,
			{ role: "user", text: "c" },
			{ role: "guide", text: "", refused: "abuse" },
		]);
	});

	it("takes the remembered turns alone when this device knows none of them, and the device's without memory", () => {
		expect(mergeRemembered(remembered, [{ role: "user", text: "z" }])).toEqual(
			remembered,
		);
		expect(mergeRemembered([], turns)).toEqual(turns);
	});
});

describe("New conversation", () => {
	it("clears the transcript and the signals, and deletes a remembered conversation", async () => {
		const memory = fakeMemory([
			{ role: "user", text: "a" },
			{ role: "guide", text: "A" },
		]);
		const { elements, signals } = await post(
			{ compassOp: "reset" },
			{ memory, headers: { "sec-fetch-site": "same-origin" } },
		);
		expect(elements[0]).toBe(
			'<div id="compass-answer" class="pz-compass__answer" role="log" aria-live="polite"></div>',
		);
		expect(signals).toEqual({
			compassTurns: [],
			compassPending: "",
			compassRemembered: false,
		});
		expect(memory.forgotten).toBe(1);
	});

	it("never deletes anything for a request from another site", async () => {
		const memory = fakeMemory([{ role: "user", text: "a" }]);
		await post(
			{ compassOp: "reset" },
			{ memory, headers: { "sec-fetch-site": "same-site" } },
		);
		expect(memory.forgotten).toBe(0);
	});
});

describe("the remembered conversation from the estate account", () => {
	function account(opts: {
		signedIn: boolean;
		consent: boolean;
	}): MemoryAccount & {
		removed: string[];
	} {
		const removed: string[] = [];
		return {
			removed,
			async person() {
				return opts.signedIn ? { subject: "sub-1" } : null;
			},
			async stores() {
				return {
					consents: {
						async current(subject: string, purpose: "guide_memory") {
							return (
								opts.consent &&
								subject === "sub-1" &&
								purpose === "guide_memory"
							);
						},
					},
					conversations: {
						async forSite(_subject: string, site: string) {
							return site === "psizone" ? { id: "conv-1" } : null;
						},
						async turns() {
							return [{ question: "Q1", answer: "A1" }];
						},
						async remove(id: string) {
							removed.push(id);
						},
					},
				};
			},
		};
	}
	/** Runs `use` with a real request context. */
	function within<T>(use: (c: Context) => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const app = new Hono();
			app.get("/", async (c) => {
				resolve(await use(c));
				return c.body(null, 204);
			});
			Promise.resolve(app.request("/")).catch(reject);
		});
	}

	it("exists only for a signed-in person who consented", async () => {
		const memoryOf = (acc: MemoryAccount) =>
			within((c) => accountMemory(acc, c, "psizone"));
		expect(await memoryOf(account({ signedIn: false, consent: true }))).toBe(
			null,
		);
		expect(await memoryOf(account({ signedIn: true, consent: false }))).toBe(
			null,
		);
		const acc = account({ signedIn: true, consent: true });
		const memory = await memoryOf(acc);
		expect(await memory?.turns()).toEqual([
			{ role: "user", text: "Q1" },
			{ role: "guide", text: "A1" },
		]);
		await memory?.forget();
		expect(acc.removed).toEqual(["conv-1"]);
	});
});
