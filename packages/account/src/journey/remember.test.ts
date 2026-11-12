import type { Guide, GuideEvent, HistoryTurn } from "@psi/guide";
import { describe, expect, it } from "vitest";
import { memoryStores } from "../stores/memory";
import { rememberingGuide } from "./remember";

/** A guide that records the history it was given and answers with fixed events. */
function fakeGuide(
	events: ReadonlyArray<GuideEvent>,
): Guide & { seen: Array<ReadonlyArray<HistoryTurn>> } {
	const seen: Array<ReadonlyArray<HistoryTurn>> = [];
	return {
		brand: "psizone",
		model: "fake",
		seen,
		async *ask(input) {
			seen.push(input.history ?? []);
			for (const e of events) yield e;
		},
	};
}

const ANSWER: ReadonlyArray<GuideEvent> = [
	{ type: "text", delta: "O evaluare durează o oră." },
	{ type: "done" },
];

async function drain(it: AsyncIterable<GuideEvent>): Promise<void> {
	for await (const _ of it) {
		// consume
	}
}

describe("the remembering guide", () => {
	it("keeps an answered turn and sends it back next time, once, even when the page also carries it", async () => {
		const stores = memoryStores();
		const inner = fakeGuide(ANSWER);
		const guide = rememberingGuide(inner, {
			conversations: stores.conversations,
			subject: "s",
			site: "psizone",
			now: () => 1,
		});
		await drain(guide.ask({ question: "Cât durează?", locale: "ro" }));
		expect(inner.seen[0]).toEqual([]);
		// Same visit: the page sends the first turn as history; it must not be doubled.
		const pageTurns: HistoryTurn[] = [
			{ role: "user", text: "Cât durează?" },
			{ role: "guide", text: "O evaluare durează o oră." },
		];
		await drain(guide.ask({ question: "Și prețul?", locale: "ro", history: pageTurns }));
		expect(inner.seen[1]).toEqual(pageTurns);
		// A later visit: nothing on the page, both remembered turns come back from the account.
		await drain(guide.ask({ question: "Unde?", locale: "ro" }));
		expect(inner.seen[2]?.filter((t) => t.role === "user").map((t) => t.text)).toEqual([
			"Cât durează?",
			"Și prețul?",
		]);
	});

	it("never keeps a refused answer", async () => {
		const stores = memoryStores();
		const guide = rememberingGuide(
			fakeGuide([{ type: "refusal", reason: "out_of_scope" }, { type: "done" }]),
			{ conversations: stores.conversations, subject: "s", site: "psizone" },
		);
		await drain(guide.ask({ question: "x", locale: "ro" }));
		expect(await stores.conversations.list("s")).toEqual([]);
	});
});
