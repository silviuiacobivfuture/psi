import { describe, expect, it } from "vitest";
import { type BookingLimits, type BookingOffer, bookingTurn } from "../booking";
import type { BookingState } from "../booking-state";
import { BUNDLED_LANGUAGES } from "../language/index";
import { ANSWERS, NOW, SCOPE, store } from "./booking-fixture";

/**
 * The organisation's booking settings (`booking.horizonDays`, `booking.offerCallback`) narrow what the chat offers;
 * none of them, nor any other setting, lets the guide propose or make a booking before it has the five details (name,
 * age, what is going on, phone, e-mail) and the visitor's explicit yes. NOW is Thursday 12 November 2026; the fixture's
 * free times are on 13, 16 and 17 November.
 */
type Port = ReturnType<typeof store>;
const PACKS = BUNDLED_LANGUAGES;
const say = (
	port: Port,
	limits: BookingLimits,
	question: string,
	state?: BookingState,
): Promise<BookingOffer | undefined> =>
	bookingTurn(
		{ port, scope: SCOPE, limits },
		{ question, ...(state === undefined ? {} : { state }) },
		PACKS,
		NOW,
	);
const wrote = (port: Port) =>
	port.calls.filter((c) => c.method === "hold" || c.method === "submit");

async function picked(port: Port, limits: BookingLimits): Promise<BookingOffer> {
	const first = await say(port, limits, "Vreau să programez o evaluare");
	const offer = await say(port, limits, "primul", first?.state);
	if (offer?.kind !== "confirm") throw new Error(`expected the details step, got ${offer?.kind}`);
	return offer;
}

const TERMS: ReadonlyArray<BookingLimits> = [
	{ horizonDays: 7, offerCallback: false },
	{ horizonDays: 30, offerCallback: true },
	{ horizonDays: 90, offerCallback: false },
];

describe("the organisation's booking terms never shorten the details", () => {
	it.each(TERMS)("with %j, a yes after fewer than five details books nothing", async (limits) => {
		for (let given = 0; given < ANSWERS.length; given += 1) {
			const port = store();
			let offer = await picked(port, limits);
			for (const answer of ANSWERS.slice(0, given)) {
				offer = (await say(port, limits, answer, offer.state)) ?? offer;
			}
			const yes = await say(port, limits, "da", offer.state);
			expect(yes?.kind, `after ${given} details`).not.toBe("summary");
			expect(yes?.kind, `after ${given} details`).not.toBe("booked");
			expect(wrote(port), `after ${given} details`).toEqual([]);
		}
	});

	it.each(
		TERMS,
	)("with %j, all five details give the summary, and only the yes then books", async (limits) => {
		const port = store();
		let offer = await picked(port, limits);
		for (const answer of ANSWERS) offer = (await say(port, limits, answer, offer.state)) ?? offer;
		expect(offer.kind).toBe("summary");
		expect(offer.limits).toEqual(limits);
		expect(wrote(port)).toEqual([]);
		const done = await say(port, limits, "da", offer.state);
		expect(done?.kind).toBe("booked");
		expect(wrote(port).map((c) => c.method)).toEqual(["hold", "submit"]);
	});
});

describe("the organisation's horizon", () => {
	it("no time past it is offered; a wider one offers the later times", async () => {
		const near: BookingLimits = { horizonDays: 2, offerCallback: true };
		const offer = await say(store(), near, "Vreau să programez o evaluare");
		expect(offer?.slots.map((s) => s.slotId)).toEqual(["fri"]);
		expect(offer?.limits).toEqual(near);
		const wide = await say(store(), TERMS[1] ?? near, "Vreau să programez o evaluare");
		expect(wide?.slots.map((s) => s.slotId)).toEqual(["fri", "mon9", "tue10", "tue14"]);
	});
	it("a time past it, picked from an older offer, is not taken to the details", async () => {
		const port = store();
		const wide = await say(port, { horizonDays: 30, offerCallback: true }, "Vreau o programare");
		const picked = await say(port, { horizonDays: 2, offerCallback: true }, "ultimul", wide?.state);
		expect(picked?.kind).toBe("times");
		expect(picked?.slots.every((s) => s.slotId === "fri")).toBe(true);
		expect(wrote(port)).toEqual([]);
	});
});
