import { describe, expect, it } from "vitest";
import { type BookingScope, bookingPauseOf, bookingTurn, reshow } from "../booking";
import { BUNDLED_LANGUAGES } from "../language/index";
import type { ProfileLocale } from "../profile";
import { instructionsFor } from "../prompt";
import type { PauseNotice } from "../scheduling/port";
import { runFindAvailability } from "../scheduling/tools";
import { MemorySchedulingStore } from "../testing";

/**
 * While the clinic has paused online booking the visitor's assistant says the clinic's message instead of proposing
 * times: the booking dialogue answers a paused offer (the organisation's pause before any search, a service's pause from
 * the search), a cancel still works, and the model's instructions carry the message whatever the question.
 */
const NOW = Date.parse("2026-11-12T08:00:00Z");
const PAUSE: PauseNotice = {
	level: "organisation",
	message: { ro: "Revenim luni cu programările.", en: "Booking opens again on Monday." },
	callbacksOpen: true,
};
const slot = {
	id: "e1",
	start: Date.parse("2026-11-13T09:00:00+02:00"),
	end: Date.parse("2026-11-13T10:00:00+02:00"),
	practitionerName: "DEMO Ana",
	modes: ["onsite" as const],
};

function store(): MemorySchedulingStore {
	return new MemorySchedulingStore().offer("clinic", "evaluation", [slot]);
}
const scope = (s: MemorySchedulingStore): BookingScope => ({
	port: s,
	scope: { tenant: "clinic", services: ["evaluation"] },
});
const ask = (s: MemorySchedulingStore, question: string) =>
	bookingTurn(scope(s), { question }, BUNDLED_LANGUAGES, NOW);

describe("the booking dialogue while booking is paused", () => {
	it("answers a request for times with the paused offer and searches nothing", async () => {
		const s = store();
		s.pause = async () => PAUSE;
		const offer = await ask(s, "Vreau o programare");
		expect(offer).toMatchObject({ kind: "times", status: "paused", pause: PAUSE, slots: [] });
		expect(s.calls.filter((c) => c.method === "findSlots")).toEqual([]);
	});

	it("answers a booking already under way with the paused offer, holding nothing", async () => {
		const s = store();
		const first = await ask(s, "Vreau o programare");
		expect(first?.status).toBe("ok");
		s.pause = async () => PAUSE;
		const next = await bookingTurn(
			scope(s),
			{ question: "prima", ...(first?.state === undefined ? {} : { state: first.state }) },
			BUNDLED_LANGUAGES,
			NOW,
		);
		expect(next).toMatchObject({ status: "paused" });
		expect(s.calls.some((c) => c.method === "hold")).toBe(false);
	});

	it("lets a message that is not about booking through to the model", async () => {
		const s = store();
		s.pause = async () => PAUSE;
		expect(await ask(s, "Ce este neurofeedback-ul?")).toBeUndefined();
	});

	it("still cancels with the reference and the code", async () => {
		const s = store();
		s.pause = async () => PAUSE;
		const offer = await ask(s, "vreau să anulez programarea");
		expect(offer?.kind).toBe("cancel_ask");
	});

	it("turns a service's pause from the search into the paused offer", async () => {
		const s = store();
		s.slotsPaused = { ...PAUSE, level: "service" };
		const offer = await ask(s, "Vreau o programare");
		expect(offer).toMatchObject({ status: "paused", pause: { level: "service" } });
		const found = await runFindAvailability(
			s,
			{ tenant: "clinic", services: ["evaluation"] },
			{ service: "evaluation", days: 7, partOfDay: "any", limit: 3 },
			NOW,
		);
		expect(found).toMatchObject({ status: "paused", slots: [] });
	});

	it("shows the paused offer again when a reply denied the calendar", async () => {
		const s = store();
		s.slotsPaused = PAUSE;
		expect(await reshow(scope(s), undefined, "vreau o programare", "ro", NOW)).toMatchObject({
			status: "paused",
		});
	});

	it("reads no pause from a port that cannot say, or one that fails", async () => {
		const s = store();
		expect(await bookingPauseOf(scope(s))).toBeUndefined();
		s.pause = async () => {
			throw new Error("store down");
		};
		expect(await bookingPauseOf(scope(s))).toBeUndefined();
		expect((await ask(s, "Vreau o programare"))?.status).toBe("ok");
	});
});

const OWN: ProfileLocale = {
	voice: "You are the clinic's guide.",
	policy: ["Never promise a time is free."],
	nextSteps: "booking",
};

describe("the model's instructions while booking is paused", () => {
	for (const locale of ["ro", "en"] as const) {
		const pack = BUNDLED_LANGUAGES.find((p) => p.locale === locale);
		const own = OWN;
		if (pack === undefined) throw new Error(`no ${locale}`);

		it(`carry the clinic's message and the callback, in ${locale}`, () => {
			const message = PAUSE.message[locale];
			const open = instructionsFor(pack, own, undefined, { message, callbacksOpen: true });
			expect(open).toContain(message);
			const closed = instructionsFor(pack, own, undefined, { message, callbacksOpen: false });
			expect(closed).toContain(message);
			expect(closed).not.toEqual(open);
		});

		it(`say nothing of a pause when there is none, in ${locale}`, () => {
			expect(instructionsFor(pack, own)).not.toContain(PAUSE.message[locale]);
			expect(instructionsFor(pack, own)).toEqual(instructionsFor(pack, own, undefined, undefined));
		});
	}
});
