import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineKnowledge } from "../contract";
import { createEngine } from "../engine";
import {
	type EngineServices,
	mentionedServices,
	RECOMMEND_SERVICES_TOOL,
	type ServiceFact,
} from "../grounding/services-tool";
import type { Profile } from "../profile";
import { answerText, collect, startFakeOpenRouter } from "../testing";
import { BIKES } from "./consumer-profiles";

const knowledge: EngineKnowledge = { search: async () => [] };

const RENT: ServiceFact = {
	id: "rent",
	name: "Weekend rental",
	brand: "bikes",
	price: "Price: 30 EUR.",
	action: { kind: "link", label: "Reserve", href: "https://bikes.example.test/reserve" },
};
const TOUR: ServiceFact = {
	id: "tour",
	name: "Harbour tour",
	brand: "bikes",
	action: { kind: "ask", label: "Book the tour", text: "I'd like to book the harbour tour" },
};
const BARE: ServiceFact = { id: "bare", name: "Repair desk", brand: "bikes" };

beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

describe("the buttons a reply earns", () => {
	it("are the actions of the services it names, once each, at most two, in the tool's order", () => {
		const reply = "Try the Harbour tour, or the weekend rental. The Repair desk helps too.";
		expect(mentionedServices(reply, [RENT, TOUR, BARE])).toEqual([RENT.action, TOUR.action]);
		expect(mentionedServices(reply, [TOUR, TOUR])).toEqual([TOUR.action]);
	});

	it("are none for a service the reply does not name or that has no action", () => {
		expect(mentionedServices("Anything else?", [RENT, TOUR])).toEqual([]);
		expect(mentionedServices("Visit the repair desk.", [BARE])).toEqual([]);
		expect(mentionedServices("Weekend rental", [])).toEqual([]);
	});
});

function engineWith(services: EngineServices | undefined, profile: Profile = BIKES) {
	return createEngine({
		profiles: [profile],
		knowledge,
		model: { id: "acme/small-model", apiKey: "test-key" },
		...(services === undefined ? {} : { services }),
	});
}

async function call(tool: unknown, input: object): Promise<unknown> {
	if (typeof tool !== "object" || tool === null || !("execute" in tool)) {
		throw new Error("not an executable tool");
	}
	return await Reflect.apply(Object(tool).execute, tool, [input, {}]);
}

describe("the recommendServices tool", () => {
	const services: EngineServices = {
		needs: [{ id: "weekend", description: "a weekend trip" }],
		find: () => ({ services: [RENT], note: "Say the price only as returned." }),
	};

	it("does not exist unless the consumer gave services", async () => {
		const tools = await engineWith(undefined).guide("harbour-bikes").agent.listTools();
		expect(Object.keys(tools)).not.toContain(RECOMMEND_SERVICES_TOOL);
	});

	it("returns the consumer's facts and note for the need asked", async () => {
		const tools = await engineWith(services).guide("harbour-bikes").agent.listTools();
		const out = await call(tools[RECOMMEND_SERVICES_TOOL], { need: "weekend" });
		expect(out).toEqual({ services: [RENT], note: "Say the price only as returned." });
	});

	it("answers a failing lookup with a note that keeps it from the visitor, never an error", async () => {
		const failing: EngineServices = {
			needs: services.needs,
			find: () => Promise.reject(new Error("cms down")),
		};
		const tools = await engineWith(failing).guide("harbour-bikes").agent.listTools();
		const out = await call(tools[RECOMMEND_SERVICES_TOOL], { need: "weekend" });
		expect(out).toMatchObject({ services: [] });
		expect(JSON.stringify(out)).toContain("Do not tell the visitor");
	});

	it("rejects a port that is not one, at startup", () => {
		expect(() =>
			createEngine({
				profiles: [BIKES],
				knowledge,
				model: { id: "acme/small-model" },
				// @ts-expect-error a port without find is the misconfiguration under test
				services: { needs: [] },
			}),
		).toThrow(/services must have a find function/);
	});
});

describe("a booking handoff", () => {
	const WITH_HANDOFF: Profile = {
		...BIKES,
		locales: {
			en: {
				voice: "You are the Harbour Bikes helper.",
				policy: [],
				nextSteps: "booking a bike",
				handoff: {
					line: "Bookings happen in the main desk's chat. Press the button.",
					label: "Start booking",
					href: (q) =>
						`https://desk.example.test/?start=${q.includes("tandem") ? "tandem" : "bike"}`,
				},
			},
		},
	};

	it("answers a booking request without the model: the line and the button", async () => {
		const fake = await startFakeOpenRouter([{ kind: "text", chunks: ["never sent"] }]);
		try {
			const engine = createEngine({
				profiles: [WITH_HANDOFF],
				knowledge,
				model: { id: "acme/small-model", apiKey: "test-key", baseURL: fake.baseURL },
			});
			const events = await collect(
				engine
					.guide("harbour-bikes")
					.ask({ question: "I'd like to book an appointment for a tandem", locale: "en" }),
			);
			expect(fake.requests).toHaveLength(0);
			expect(answerText(events)).toBe("Bookings happen in the main desk's chat. Press the button.");
			expect(events.find((e) => e.type === "actions")).toEqual({
				type: "actions",
				actions: [
					{ kind: "link", label: "Start booking", href: "https://desk.example.test/?start=tandem" },
				],
			});
			expect(events.at(-1)).toEqual({ type: "done" });
		} finally {
			await fake.close();
		}
	});
});
