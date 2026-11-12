import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, MemorySchedulingStore } from "@psi/engine/testing";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type BookingOffer,
	type BookingState,
	bookingStateOf,
	continueConversation,
	createPsiEngine,
	historyOf,
	parseConversation,
} from "../index";

const H = 3_600_000;
let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-booking-conv-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

const STATE: BookingState = {
	stage: "times",
	criteria: { service: "evaluation", days: 14, partOfDay: "morning" },
	shown: [],
};

describe("the booking state in the page's conversation", () => {
	it("rides on the guide's turn and survives parsing; history stays plain text", () => {
		const turns = continueConversation([], "vreau o programare", {
			answer: "Ți-am arătat orele libere.",
			booking: STATE,
		});
		expect(turns.at(-1)).toEqual({
			role: "guide",
			text: "Ți-am arătat orele libere.",
			booking: STATE,
		});
		expect(bookingStateOf(turns)).toEqual(STATE);
		expect(historyOf(turns)).toEqual([
			{ role: "user", text: "vreau o programare" },
			{ role: "guide", text: "Ți-am arătat orele libere." },
		]);
	});

	it("is found on the latest guide turn, or the one before it, and not further back", () => {
		let turns = continueConversation([], "vreau o programare", { answer: "A", booking: STATE });
		expect(bookingStateOf(turns)).toEqual(STATE);
		turns = continueConversation(turns, "ce preț are?", { answer: "B" });
		expect(bookingStateOf(turns)).toEqual(STATE);
		turns = continueConversation(turns, "și cât durează?", { answer: "C" });
		expect(bookingStateOf(turns)).toBeUndefined();
		expect(bookingStateOf([])).toBeUndefined();
	});

	it("a tampered state voids the conversation, never steers a question", () => {
		const bad = [
			{ role: "user", text: "x" },
			{ role: "guide", text: "y", booking: { stage: "times", criteria: { service: "x" } } },
		];
		expect(parseConversation(bad)).toEqual([]);
	});
});

describe("Psizone's guide keeps the booking context across turns", () => {
	it("turn 1 offers times; turn 2 'săptămâna viitoare, dimineața' is a booking turn, not a phone number", async () => {
		const day = Math.ceil(Date.now() / (24 * H)) * 24 * H;
		const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => ({
			id: `s${d}`,
			start: day + d * 24 * H + 7 * H,
			end: day + d * 24 * H + 8 * H,
			practitionerName: "DEMO Ana",
			modes: ["onsite" as const],
		}));
		const port = new MemorySchedulingStore().offer("psizone", "evaluation", slots);
		// The services come from the store, not from the profile.
		port.catalogue = async () => [{ slug: "evaluation" }];
		const guide = createPsiEngine({ knowledge: kb, scheduling: port }).guide("psizone");
		const first = await collect(
			guide.ask({
				question: "Bună, aș vrea să fac o programare pentru o evaluare pentru copilul meu",
				locale: "ro",
			}),
		);
		const offer = first.find((e) => e.type === "booking")?.offer as BookingOffer | undefined;
		expect(offer?.kind).toBe("times");
		const turns = continueConversation([], "x", {
			answer: "Ți-am arătat orele.",
			...(offer?.state ? { booking: offer.state } : {}),
		});
		const second = await collect(
			guide.ask({
				question: "săptămâna viitoare, dimineața",
				locale: "ro",
				history: historyOf(turns),
				...(bookingStateOf(turns) === undefined ? {} : { booking: bookingStateOf(turns) }),
			}),
		);
		const next = second.find((e) => e.type === "booking");
		expect(next?.offer.kind).toBe("times");
		expect(next?.offer.notice === "refined" || next?.offer.notice === "relaxed").toBe(true);
		expect(second.some((e) => e.type === "text")).toBe(false);
	});
});
