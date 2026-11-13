import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../engine";
import type { Profile } from "../profile";
import { collect, FakeKnowledge, shape } from "../testing";
import { ANSWERS, asking, chosen, SCOPE, store } from "./booking-fixture";
import { BIKES } from "./consumer-profiles";

const PROFILE: Profile = { ...BIKES, scheduling: SCOPE };

beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

/**
 * Answering the booking dialogue is read without a model, so a booking of ten messages must not
 * eat a visitor's exchange budget; a question that goes on to the model still counts.
 */
describe("the exchange limit and the booking dialogue", () => {
	const engineWith = (limit: number) =>
		createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
			scheduling: store(),
			settings: async () => ({ exchangeLimit: limit }),
		});

	it("a whole booking in the chat takes one exchange per question asked of the model, none per answer", async () => {
		const engine = engineWith(1);
		const keys = ["session:booking"];
		const ask = (question: string, booking?: Parameters<typeof asking>[0]["state"]) =>
			collect(
				engine
					.guide("harbour-bikes")
					.ask(
						{ question, locale: "en", ...(booking === undefined ? {} : { booking }) },
						{ visitorKeys: keys },
					),
			);
		let offer = await chosen(store());
		const steps = [...ANSWERS];
		for (const answer of steps) {
			const events = await ask(answer, offer.state);
			expect(shape(events), answer).toEqual(["booking", "done"]);
			const next = events[0];
			if (next?.type !== "booking") throw new Error("no booking event");
			offer = next.offer;
		}
		expect(offer.kind).toBe("summary");
	});

	it("a question put to the model from the details step still counts, and is refused over the limit", async () => {
		const engine = engineWith(1);
		const keys = ["session:question"];
		const picked = await chosen(store());
		const state = asking(picked, "name");
		const ask = () =>
			collect(
				engine
					.guide("harbour-bikes")
					.ask(
						{ question: "How long does a fitting take?", locale: "en", booking: state },
						{ visitorKeys: keys },
					),
			);
		const first = await ask();
		expect(shape(first)).not.toContain("refusal:exchange_limit");
		expect(shape(await ask())).toEqual(["refusal:exchange_limit", "done"]);
	});
});
