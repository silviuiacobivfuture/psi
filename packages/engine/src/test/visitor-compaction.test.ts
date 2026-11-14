import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSISTANT_DEFAULT_MODEL } from "@psi/scheduling-sdk/contract";
import { afterEach, describe, expect, it } from "vitest";
import type { Summariser } from "../compaction";
import { FakeVisitorStore, governed, type Harness } from "./visitor-harness";

/**
 * `memory.compactAfter` on the visitor's kept conversation (the visitor consented: `threadId`): past the window, the
 * older part is folded into one summary by the organisation's `model.summary` (here a fake summariser), the summary
 * reaches the model with the turn's notes, and what writing it used goes into the organisation's meters.
 */
const THREAD = "0b6f0c5e-7d0c-4c55-9c39-3f7d2b0a9e11";
let dir: string | undefined;
let h: Harness | undefined;
afterEach(async () => {
	await h?.server.close();
	h = undefined;
	if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
	dir = undefined;
});

interface Fake {
	summarise: Summariser;
	calls: Array<{ model: string; transcript: string }>;
}
function fakeSummariser(fail = false): Fake {
	const calls: Fake["calls"] = [];
	return {
		calls,
		summarise: async ({ model, transcript }) => {
			calls.push({ model, transcript });
			if (fail) throw new Error("summary model down");
			return {
				text: "They asked about renting bikes by the hour.",
				usage: {
					inputTokens: 300,
					outputTokens: 40,
					cachedTokens: 0,
					costMicroUsd: 9,
					limitHit: false,
				},
			};
		},
	};
}

async function start(fake: Fake, visitor: object): Promise<Harness> {
	dir = mkdtempSync(join(tmpdir(), "visitor-compaction-"));
	const store = new FakeVisitorStore().set(visitor);
	h = await governed(store, undefined, {
		memory: { url: `file:${join(dir, "memory.db")}` },
		summariser: fake.summarise,
	});
	return h;
}

const WINDOW = {
	model: { summary: "acme/cheap-model" },
	memory: { compactAfter: 6, historyMessages: 2 },
};
/** Four answered turns: eight messages kept, past a window of six. */
const FOUR = ["Hello?", "Rent a bike?", "By the hour?", "On weekdays?"];
const kept = (harness: Harness, question: string) =>
	harness.ask(question, { visitorKeys: ["v1"] }, { threadId: THREAD });

describe("folding a long kept conversation", () => {
	it("below the window no model is asked; past it, one summary by the summary model, then not again at once", async () => {
		const fake = fakeSummariser();
		const harness = await start(fake, WINDOW);
		// Each answered turn keeps two messages: before the fourth turn six are kept, at the window, not past it.
		for (const q of FOUR) await kept(harness, q);
		expect(fake.calls).toEqual([]);
		// A conversation's first turn has no thread yet: nothing to fold, and no failure either.
		expect(harness.failures).toEqual([]);
		await kept(harness, "Until when?");
		expect(fake.calls).toHaveLength(1);
		// The summary model asked for is not on the estate's list (the built-in ceilings): the allowed one writes it.
		expect(fake.calls[0]?.model).toBe(ASSISTANT_DEFAULT_MODEL);
		expect(fake.calls[0]?.transcript).toContain("Hello?");
		// What it kept whole and the summary are under the window again: the next turn folds nothing.
		await kept(harness, "And on Sunday?");
		expect(fake.calls).toHaveLength(1);
	});

	it("the summary reaches the model with the turn, and its use is in that turn's meters", async () => {
		const fake = fakeSummariser();
		const harness = await start(fake, WINDOW);
		for (const q of [...FOUR, "Until when?"]) await kept(harness, q);
		const last = harness.server.requests.at(-1);
		expect(JSON.stringify(last?.body)).toContain("They asked about renting bikes by the hour.");
		expect(JSON.stringify(last?.body)).toContain("Summary of the conversation so far:");
		const turns = harness.store.records.map((r) => r.usage);
		const folding = turns.at(-1);
		const before = turns.at(-2);
		expect(folding?.inputTokens).toBeGreaterThanOrEqual(300);
		expect(folding?.costMicroUsd).toBeGreaterThanOrEqual(9);
		expect(folding?.messages).toBe(1);
		expect((folding?.inputTokens ?? 0) - (before?.inputTokens ?? 0)).toBeGreaterThanOrEqual(300);
	});

	it("a conversation that is not kept is never folded, however long its page history", async () => {
		const fake = fakeSummariser();
		const harness = await start(fake, WINDOW);
		const history = Array.from({ length: 20 }, (_, i) => ({
			role: i % 2 === 0 ? ("user" as const) : ("guide" as const),
			text: `turn ${i}`,
		}));
		await harness.ask("Rent a bike?", { visitorKeys: ["v1"] }, { history });
		expect(fake.calls).toEqual([]);
	});

	it("a summary that fails leaves the conversation whole: reported, and the visitor still gets the answer", async () => {
		const fake = fakeSummariser(true);
		const harness = await start(fake, WINDOW);
		for (const q of FOUR) await kept(harness, q);
		const events = await kept(harness, "Until when?");
		expect(fake.calls).toHaveLength(1);
		expect(events.some((e) => e.type === "text")).toBe(true);
		expect(harness.failures.map((f) => f.stage)).toContain("compaction");
	});
});
