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

	it("older turns do not keep what the visitor typed: the state stays on the latest guide turns only", () => {
		const named: BookingState = { ...STATE, stage: "details", details: { name: "Ana Pop" } };
		let turns = continueConversation([], "x", { answer: "A", booking: named });
		turns = continueConversation(turns, "y", { answer: "B", booking: named });
		turns = continueConversation(turns, "z", { answer: "C", booking: named });
		expect(turns.filter((t) => t.booking !== undefined)).toHaveLength(2);
		expect(JSON.stringify(turns.slice(0, 2))).not.toContain("Ana Pop");
	});

	it("a finished booking leaves no state behind, so a later 'da' resumes nothing", () => {
		const named: BookingState = { ...STATE, stage: "details", details: { name: "Ana Pop" } };
		let turns = continueConversation([], "x", { answer: "A", booking: named });
		turns = continueConversation(turns, "da", {
			answer: "Cererea a fost trimisă.",
			endsBooking: true,
		});
		expect(bookingStateOf(turns)).toBeUndefined();
		expect(JSON.stringify(turns)).not.toContain("Ana Pop");
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

describe.each([
	[
		"psizone",
		"psizone",
		"evaluation",
		"ro",
		[
			"Ana Pop",
			"9",
			"Fiul meu are anxietate și refuză școala",
			"0722 123 456",
			"ana@example.ro",
			"da",
		],
		"child",
	],
	[
		"psizone",
		"psizone",
		"evaluation",
		"en",
		[
			"Ana Pop",
			"34",
			"I have trouble sleeping and constant worry",
			"+44 20 7946 0958",
			"ana@example.com",
			"yes",
		],
		"adult",
	],
	[
		"hemisync",
		"hemisync",
		"session",
		"ro",
		[
			"Dan Ionescu",
			"41",
			"Caut ajutor pentru somn și neliniște",
			"0722 123 456",
			"dan@example.ro",
			"da",
		],
		"adult",
	],
	[
		"hemisync",
		"hemisync",
		"session",
		"en",
		[
			"Dan Ionescu",
			"7",
			"I am looking for help with sleep and worry",
			"0722 123 456",
			"dan@example.com",
			"confirm",
		],
		"adult",
	],
] as const)("a whole booking in the chat on %s in %s", (brand, tenant, service, locale, says, audience) => {
	it("asks one thing at a time, books once on the yes, and ends the flow", async () => {
		const day = Math.ceil(Date.now() / (24 * H)) * 24 * H;
		const port = new MemorySchedulingStore().offer(
			tenant,
			service,
			[1, 2, 3].map((d) => ({
				id: `s${d}`,
				start: day + d * 24 * H + 7 * H,
				end: day + d * 24 * H + 8 * H,
				practitionerName: "DEMO Ana",
				modes: ["onsite" as const],
			})),
		);
		port.catalogue = async () => [{ slug: service }];
		const guide = createPsiEngine({ knowledge: kb, scheduling: port }).guide(brand);
		let turns: ReturnType<typeof continueConversation> = [];
		const turn = async (question: string): Promise<BookingOffer> => {
			const state = bookingStateOf(turns);
			const events = await collect(
				guide.ask({
					question,
					locale,
					history: historyOf(turns),
					...(state === undefined ? {} : { booking: state }),
				}),
			);
			const offer = events.find((e) => e.type === "booking")?.offer as BookingOffer | undefined;
			if (offer === undefined) throw new Error(`"${question}" was not a booking turn`);
			turns = continueConversation(turns, question, {
				answer: "turn",
				...(offer.state === undefined ? { endsBooking: true } : { booking: offer.state }),
			});
			return offer;
		};
		const times = await turn(
			locale === "ro" ? "Vreau să programez o evaluare" : "I want to book an appointment",
		);
		expect(times.kind).toBe("times");
		let offer = await turn(locale === "ro" ? "a doua" : "the second one");
		expect(offer.kind).toBe("confirm");
		const asked: Array<string | undefined> = [offer.details?.ask];
		for (const text of says.slice(0, -1)) {
			offer = await turn(text);
			asked.push(offer.details?.ask);
		}
		expect(asked).toEqual(["name", "age", "details", "phone", "email", undefined]);
		expect(offer.kind).toBe("summary");
		expect(port.calls.filter((c) => c.method === "hold")).toEqual([]);
		offer = await turn(says.at(-1) ?? "");
		expect(offer.kind).toBe("booked");
		expect(offer.booked?.cancelCode).toBeDefined();
		const submit = port.calls.filter((c) => c.method === "submit");
		expect(submit).toHaveLength(1);
		expect(submit[0]).toMatchObject({ audience, contact: { name: says[0] } });
		expect(bookingStateOf(turns)).toBeUndefined();
		expect(JSON.stringify(turns)).not.toContain(offer.booked?.cancelCode ?? "none");
	});
});
