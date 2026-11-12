import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBookingIntent, offerTimes } from "../booking";
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

const H = 3_600_000;
const SCOPE = { tenant: "harbour", services: ["bike-fitting"] };
const PROFILE: Profile = { ...BIKES, scheduling: SCOPE };

/** Free times tomorrow and the day after, relative to now. */
function store(): MemorySchedulingStore {
	const day = Math.ceil(Date.now() / (24 * H)) * 24 * H;
	return new MemorySchedulingStore().offer("harbour", "bike-fitting", [
		{
			id: "a",
			start: day + 7 * H,
			end: day + 8 * H,
			practitionerName: "DEMO Fitter",
			modes: ["onsite"],
		},
		{
			id: "b",
			start: day + 13 * H,
			end: day + 14 * H,
			practitionerName: "DEMO Fitter",
			modes: ["onsite"],
		},
		{
			id: "c",
			start: day + 31 * H,
			end: day + 32 * H,
			practitionerName: "DEMO Fitter",
			modes: ["online"],
		},
	]);
}

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

describe("booking intent", () => {
	it.each([
		["en", "I want to book an evaluation for my son next week"],
		["en", "Can I book an appointment?"],
		["en", "I'd like to schedule a session"],
		["ro", "Vreau să programez o evaluare pentru fiul meu săptămâna viitoare"],
		["ro", "Cum fac o programare?"],
		["ro", "Aveți ore libere joi?"],
	])("recognises (%s) %j", (_l, question) => {
		expect(isBookingIntent(question, BUNDLED_LANGUAGES)).toBe(true);
	});

	it.each([
		"What does the booking form ask for?",
		"Ce servicii aveți pentru copii cu ADHD?",
		"How long is a session?",
	])("leaves %j to the grounded answer", (question) => {
		expect(isBookingIntent(question, BUNDLED_LANGUAGES)).toBe(false);
	});
});

describe("booking inside the conversation", () => {
	it("offers the store's free times as a booking event, with no model call and nothing held", async () => {
		const server = await startFakeOpenRouter([{ kind: "text", chunks: ["x"] }]);
		fake = server;
		const scheduling = store();
		const knowledge = new FakeKnowledge([]);
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge,
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling,
		});
		const events = await collect(
			engine
				.guide("harbour-bikes")
				.ask({ question: "I want to book a session tomorrow morning", locale: "en" }),
		);
		expect(shape(events)).toEqual(["booking", "done"]);
		const offer = events[0]?.type === "booking" ? events[0].offer : undefined;
		expect(offer?.status).toBe("ok");
		expect(offer?.service).toBe("bike-fitting");
		expect(offer?.slots.length).toBeGreaterThan(0);
		expect(server.requests).toHaveLength(0);
		expect(server.screenings).toHaveLength(0);
		expect(knowledge.calls).toHaveLength(0);
	});

	it("never offers times on a crisis, and answers a profile without scheduling as usual", async () => {
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
			scheduling: store(),
		});
		const crisis = await collect(
			engine
				.guide("harbour-bikes")
				.ask({ question: "I crashed and I'm bleeding, can I book an appointment?", locale: "en" }),
		);
		expect(shape(crisis)).toEqual(["refusal:crisis", "done"]);
		const plain = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
		});
		const events = await collect(
			plain.guide("harbour-bikes").ask({ question: "Can I book an appointment?", locale: "en" }),
		);
		expect(shape(events)).not.toContain("booking");
	});

	it("says unavailable when the store fails, without throwing", async () => {
		const broken = {
			findSlots: () => Promise.reject(new Error("down")),
			cancel: () => Promise.reject(new Error("down")),
		};
		const offer = await offerTimes({ port: broken, scope: SCOPE }, "book");
		expect(offer).toMatchObject({ status: "unavailable", slots: [] });
	});
});
