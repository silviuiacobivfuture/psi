import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BookingOffer, type BookingScope, bookingTurn } from "../booking";
import { deniesCalendar } from "../booking-guard";
import { createEngine } from "../engine";
import { BUNDLED_LANGUAGES } from "../language/index";
import type { Profile } from "../profile";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	MemorySchedulingStore,
	shape,
	startFakeOpenRouter,
} from "../testing";
import { BIKES } from "./consumer-profiles";

/** Thursday 12 November 2026, 10:00 in Bucharest (UTC+2). */
const NOW = Date.parse("2026-11-12T08:00:00Z");
const SCOPE = { tenant: "harbour", services: ["bike-fitting"] };
const PROFILE: Profile = { ...BIKES, scheduling: SCOPE };

const at = (date: string, time: string): number => Date.parse(`${date}T${time}:00+02:00`);
const FREE: ReadonlyArray<readonly [string, string, string]> = [
	["fri", "2026-11-13", "09:00"],
	["mon9", "2026-11-16", "09:00"],
	["tue10", "2026-11-17", "10:00"],
	["tue14", "2026-11-17", "14:00"],
];

function store(without: ReadonlyArray<string> = []): MemorySchedulingStore {
	return new MemorySchedulingStore().offer(
		"harbour",
		"bike-fitting",
		FREE.filter(([id]) => !without.includes(id)).map(([id, date, time]) => ({
			id,
			start: at(date, time),
			end: at(date, time) + 3_600_000,
			practitionerName: "DEMO Fitter",
			modes: ["onsite" as const],
		})),
	);
}

async function say(
	port: MemorySchedulingStore,
	question: string,
	state?: BookingOffer["state"],
	typed?: string,
): Promise<BookingOffer | undefined> {
	const booking: BookingScope = { port, scope: SCOPE };
	return bookingTurn(
		booking,
		{
			question,
			...(typed === undefined ? {} : { typed }),
			...(state === undefined ? {} : { state }),
		},
		BUNDLED_LANGUAGES,
		NOW,
	);
}

/** The conversation up to the details step: the request, the week, the time. */
async function chosen(port = store()): Promise<BookingOffer> {
	const first = await say(port, "Vreau să programez o evaluare");
	const week = await say(port, "săptămâna viitoare", first?.state);
	const picked = await say(port, "marți la 10", week?.state);
	if (picked?.kind !== "confirm") throw new Error(`expected the confirm step, got ${picked?.kind}`);
	return picked;
}

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

describe("the details step: the chat fills the booking form", () => {
	it("choosing a time moves to the details stage and keeps the time", async () => {
		const picked = await chosen();
		expect(picked.state?.stage).toBe("details");
		expect(picked.state?.chosen).toMatchObject({ date: "2026-11-17", time: "10:00" });
		expect(picked.details).toMatchObject({
			values: {},
			missing: ["name", "contact", "forWhom", "consent"],
			nudge: false,
		});
	});

	it("the exact transcript: a name, a phone, who it is for, the agreement, each typed in the chat", async () => {
		const port = store();
		let offer = await chosen(port);
		const steps: ReadonlyArray<readonly [string, ReadonlyArray<string>, ReadonlyArray<string>]> = [
			["Iacob Silviu Iulian", ["name"], ["contact", "forWhom", "consent"]],
			["0722 123 456", ["phone"], ["forWhom", "consent"]],
			["pentru mine", ["forWhom"], ["consent"]],
			["sunt de acord", ["consent"], []],
		];
		for (const [text, heard, missing] of steps) {
			const next = await say(port, text, offer.state);
			if (next?.kind !== "confirm") throw new Error(`"${text}" left the confirm step`);
			expect(next.details?.heard).toEqual(heard);
			expect(next.details?.missing).toEqual(missing);
			expect(next.chosen).toMatchObject({ date: "2026-11-17", time: "10:00" });
			offer = next;
		}
		expect(offer.details?.values).toEqual({
			name: "Iacob Silviu Iulian",
			phone: "0722123456",
			forWhom: "adult",
			consent: true,
		});
	});

	it("takes everything said in one message, in any order, with an e-mail instead of a phone", async () => {
		const port = store();
		const picked = await chosen(port);
		const all = await say(
			port,
			"x",
			picked.state,
			"Silviu Iacob, silviu@example.ro, pentru fiul meu, sunt de acord",
		);
		expect(all?.details?.values).toEqual({
			name: "Silviu Iacob",
			email: "silviu@example.ro",
			forWhom: "child",
			consent: true,
		});
		expect(all?.details?.missing).toEqual([]);
		const reversed = await say(port, "x", picked.state, "+40 722 123 456 mă numesc Ana Pop");
		expect(reversed?.details?.values).toMatchObject({ name: "Ana Pop", phone: "+40722123456" });
		expect(reversed?.details?.missing).toEqual(["forWhom", "consent"]);
	});

	it("reads a teenager and a child by age, and does not take 'nu accept' for an agreement", async () => {
		const picked = await chosen();
		const teen = await say(picked && store(), "x", picked.state, "pentru fiica mea de 15 ani");
		expect(teen?.details?.values.forWhom).toBe("teen");
		const child = await say(store(), "x", picked.state, "are 9 ani");
		expect(child?.details?.values.forWhom).toBe("child");
		const refused = await say(store(), "x", picked.state, "nu accept");
		expect(refused?.details?.values.consent).toBeUndefined();
	});

	it("keeps what it knows when a later message adds one more piece, and a new piece replaces the old", async () => {
		const port = store();
		const named = await say(port, "x", (await chosen(port)).state, "Ana Pop");
		const again = await say(port, "x", named?.state, "Ioana Pop");
		expect(again?.details?.values.name).toBe("Ioana Pop");
	});

	it("nudges back to the form on text that tells nothing, and keeps the chosen time", async () => {
		const port = store();
		const picked = await chosen(port);
		for (const garbage of ["asdf qwer", "hmm", "....", "123", "ok bine"]) {
			const next = await say(port, garbage, picked.state);
			expect(next?.kind, garbage).toBe("confirm");
			expect(next?.details?.nudge, garbage).toBe(true);
			expect(next?.details?.heard, garbage).toEqual([]);
			expect(next?.state?.chosen).toEqual(picked.state?.chosen);
		}
	});

	it("leaves a real question to the guide, and answers nothing of the booking", async () => {
		const picked = await chosen();
		for (const question of [
			"Cât durează o evaluare?",
			"How long does it take?",
			"Unde vă aflați?",
		]) {
			expect(await say(store(), question, picked.state), question).toBeUndefined();
		}
	});

	it("a wish in this stage still refines the booking, the details kept", async () => {
		const port = store();
		const named = await say(port, "x", (await chosen(port)).state, "Ana Pop");
		const moved = await say(port, "marți la 14", named?.state);
		expect(moved?.kind).toBe("confirm");
		expect(moved?.chosen).toMatchObject({ date: "2026-11-17", time: "14:00" });
		expect(moved?.details?.values.name).toBe("Ana Pop");
	});

	it("a time that lapsed is re-offered with the nearest ones, never confirmed", async () => {
		const picked = await chosen(store());
		const gone = await say(store(["tue10"]), "Ana Pop", picked.state);
		expect(gone?.kind).toBe("times");
		expect(gone?.notice).toBe("taken");
		expect(gone?.slots.length).toBeGreaterThan(0);
		expect(gone?.slots.map((s) => s.slotId)).not.toContain(picked.chosen?.slotId);
	});

	it("never carries a detail into a state that is not the details stage", async () => {
		const port = store();
		const first = await say(port, "Vreau să programez o evaluare");
		expect(first?.state?.details).toBeUndefined();
		expect(first?.state?.chosen).toBeUndefined();
	});

	it("reads the typed text, not the redacted one, through the engine", async () => {
		const picked = await chosen();
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({
				question: "Iacob Silviu Iulian 0722 123 456",
				locale: "en",
				...(picked.state === undefined ? {} : { booking: picked.state }),
			}),
		);
		expect(shape(events)).toEqual(["booking", "done"]);
		const offer = events[0]?.type === "booking" ? events[0].offer : undefined;
		expect(offer?.details?.values).toMatchObject({
			name: "Iacob Silviu Iulian",
			phone: "0722123456",
		});
	});
});

describe("a site that books never says it cannot see its calendar", () => {
	it.each([
		"Nu am acces la calendarul cu orele libere, așa că nu pot confirma eu acest interval.",
		"Din păcate nu pot vedea calendarul.",
		"Nu am acces la orarul echipei.",
		"Nu pot verifica disponibilitatea.",
		"I don't have access to the calendar.",
		"I do not have access to our schedule or the free times.",
		"Sorry, I can't check availability.",
		"I have no access to the calendar.",
	])("blocks %j", (text) => {
		expect(deniesCalendar(text)).toBe(true);
	});

	it.each([
		"Programarea se face în conversație: alege o oră liberă.",
		"We have no access restrictions for the clinic.",
		"Nu am acces la dosarul tău medical.",
		"Calendarul de iarnă începe luni.",
	])("lets %j through", (text) => {
		expect(deniesCalendar(text)).toBe(false);
	});

	it("replaces such a model reply with the booking's own offer, on a site that schedules", async () => {
		const server = await startFakeOpenRouter([
			{
				kind: "text",
				chunks: ["I don't have access to the calendar, sorry. ", "Please use the contact page."],
			},
		]);
		fake = server;
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "Tell me about the fitter", locale: "en" }),
		);
		const kinds = shape(events);
		expect(kinds).toContain("booking");
		expect(kinds.at(-1)).toBe("done");
		const replaced = events.filter((e) => e.type === "replace").at(-1);
		expect(replaced).toMatchObject({ type: "replace", text: "" });
		const offer = events.find((e) => e.type === "booking");
		expect(offer?.type === "booking" && offer.offer.status).toBe("ok");
		expect(offer?.type === "booking" && offer.offer.slots.length).toBeGreaterThan(0);
	});

	it("shows the chosen time again when the denial comes mid-booking", async () => {
		const picked = await chosen();
		const server = await startFakeOpenRouter([
			{ kind: "text", chunks: ["I have no access to the calendar."] },
		]);
		fake = server;
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({
				question: "Tell me about the fitter",
				locale: "en",
				...(picked.state === undefined ? {} : { booking: picked.state }),
			}),
		);
		const offer = events.find((e) => e.type === "booking");
		expect(offer?.type === "booking" && offer.offer.kind).toBe("confirm");
		expect(offer?.type === "booking" && offer.offer.chosen?.time).toBe("10:00");
	});

	it("leaves the same reply alone on a site that does not schedule", async () => {
		const server = await startFakeOpenRouter([
			{ kind: "text", chunks: ["I don't have access to the calendar."] },
		]);
		fake = server;
		const engine = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "Tell me about the fitter", locale: "en" }),
		);
		expect(shape(events)).not.toContain("booking");
	});
});
