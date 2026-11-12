import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BookingOffer, type BookingScope, bookingTurn, isBookingIntent } from "../booking";
import { readWish } from "../booking-parse";
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
const CODE = "K7M3-9QXA";
const SECRET = "ABCD-EFGH-JKMN-PQRS";

/** A local wall time in Bucharest in November (UTC+2) as an instant. */
function at(date: string, time: string): number {
	return Date.parse(`${date}T${time}:00+02:00`);
}

const FREE: ReadonlyArray<readonly [string, string, string, "onsite" | "online"]> = [
	["fri", "2026-11-13", "09:00", "onsite"],
	["mon9", "2026-11-16", "09:00", "onsite"],
	["mon10", "2026-11-16", "10:15", "onsite"],
	["tue10", "2026-11-17", "10:00", "onsite"],
	["tue14", "2026-11-17", "14:00", "onsite"],
	["wedweb", "2026-11-18", "11:00", "online"],
	["mon23", "2026-11-23", "09:00", "onsite"],
];

function store(): MemorySchedulingStore {
	return new MemorySchedulingStore().offer(
		"harbour",
		"bike-fitting",
		FREE.map(([id, date, time, mode]) => ({
			id,
			start: at(date, time),
			end: at(date, time) + 3_600_000,
			practitionerName: "DEMO Fitter",
			modes: [mode],
		})),
	);
}

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

async function turn(
	port: MemorySchedulingStore,
	question: string,
	state?: BookingOffer["state"],
): Promise<BookingOffer | undefined> {
	const booking: BookingScope = { port, scope: SCOPE };
	return bookingTurn(
		booking,
		{ question, ...(state === undefined ? {} : { state }) },
		BUNDLED_LANGUAGES,
		NOW,
	);
}

const dates = (offer: BookingOffer | undefined): ReadonlyArray<string> =>
	offer?.slots.map((s) => `${s.date} ${s.time}`) ?? [];

describe("what the visitor says is understood without a model", () => {
	it.each([
		["poti sa faci o programare pentru mine ?"],
		["Puteți să mă programați la o evaluare?"],
		["Poți face o programare pentru copilul meu"],
		["Can you book an appointment for me?"],
		["could you schedule me for an evaluation"],
	])("%j is a booking request", (question) => {
		expect(isBookingIntent(question, BUNDLED_LANGUAGES)).toBe(true);
	});

	it.each([
		["săptămâna viitoare, dimineața", { fromDate: "2026-11-16", days: 7, partOfDay: "morning" }],
		["next week", { fromDate: "2026-11-16", days: 7 }],
		["marți la 10", { weekday: 2, minutes: 600 }],
		["tuesday at 2pm", { weekday: 2, minutes: 840 }],
		["vineri după-amiaza", { weekday: 5, partOfDay: "afternoon" }],
		["20 noiembrie", { fromDate: "2026-11-20", days: 1 }],
		["the 20th of november", { fromDate: "2026-11-20", days: 1 }],
		["mâine", { fromDate: "2026-11-13", days: 1 }],
		["a doua", { ordinal: 2 }],
		["the last one", { ordinal: -1 }],
		["varianta 3", { ordinal: 3 }],
		["online", { mode: "online" }],
		["la cabinet", { mode: "onsite" }],
		["ora 10:30", { minutes: 630 }],
		["orice zi", { anything: true }],
		["alte zile", { later: true }],
	])("reads %j", (text, expected) => {
		expect(readWish(text, "2026-11-12", ["bike-fitting"], true)).toMatchObject(expected);
	});

	it("does not read a greeting as a part of the day, nor 'book online' as a mode, on a first request", () => {
		expect(readWish("Bună dimineața, vreau o programare", "2026-11-12", [], false)).toEqual({});
		expect(readWish("vreau o programare online", "2026-11-12", [], false).mode).toBeUndefined();
		expect(readWish("vreau o evaluare online", "2026-11-12", [], false).mode).toBe("online");
	});
});

describe("a booking conversation across turns", () => {
	it("turn 1 offers times and leaves a state; turn 2 'next week, mornings' refines it", async () => {
		const port = store();
		const first = await turn(port, "Bună, aș vrea să fac o programare pentru o evaluare");
		expect(first).toMatchObject({ kind: "times", status: "ok", state: { stage: "times" } });
		expect(first?.notice).toBeUndefined();
		const second = await turn(port, "săptămâna viitoare, dimineața", first?.state);
		expect(second).toMatchObject({ kind: "times", status: "ok", notice: "refined" });
		expect(dates(second)).toEqual([
			"2026-11-16 09:00",
			"2026-11-16 10:15",
			"2026-11-17 10:00",
			"2026-11-18 11:00",
		]);
		expect(second?.state?.criteria).toMatchObject({
			fromDate: "2026-11-16",
			days: 7,
			partOfDay: "morning",
		});
	});

	it("a refinement changes only what it names: weekday, then online, then anything", async () => {
		const port = store();
		const next = await turn(
			port,
			"săptămâna viitoare, dimineața",
			(await turn(port, "vreau o programare"))?.state,
		);
		const tuesday = await turn(port, "marți", next?.state);
		expect(dates(tuesday)).toEqual(["2026-11-17 10:00"]);
		expect(tuesday?.state?.criteria).toMatchObject({ weekday: 2, partOfDay: "morning" });
		const online = await turn(
			port,
			"mai bine online",
			(await turn(port, "alta zi", tuesday?.state))?.state,
		);
		expect(online?.state?.criteria.mode).toBe("online");
		const any = await turn(port, "orice zi, oricând", online?.state);
		// The day and part of the day are dropped; the mode the visitor chose stays.
		expect(any?.state?.criteria).toEqual({
			service: "bike-fitting",
			days: 14,
			partOfDay: "any",
			mode: "online",
		});
		expect(any?.status).toBe("ok");
	});

	it("'other days' looks past the last time shown", async () => {
		const port = store();
		const first = await turn(port, "I want to book an appointment");
		const later = await turn(port, "another day please", first?.state);
		expect(later?.slots.every((s) => s.date > (first?.slots.at(-1)?.date ?? ""))).toBe(true);
	});

	it("nothing free for the refinement gives the nearest times, said so", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		const none = await turn(port, "sâmbătă", first?.state);
		expect(none).toMatchObject({ kind: "times", status: "ok", notice: "relaxed" });
		expect(none?.slots.length).toBeGreaterThan(0);
	});

	it("picks by position and shows the confirm step for a time checked free", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		const picked = await turn(port, "a doua", first?.state);
		expect(picked).toMatchObject({
			kind: "confirm",
			status: "ok",
			chosen: { slotId: "mon9", date: "2026-11-16", time: "09:00" },
			state: { stage: "confirm" },
		});
		const last = await turn(port, "the last one", first?.state);
		expect(last?.chosen?.slotId).toBe("wedweb");
	});

	it("picks by day and clock time, among the shown and beyond them", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		expect((await turn(port, "luni la 10:15", first?.state))?.chosen?.slotId).toBe("mon10");
		expect((await turn(port, "marți la 14", first?.state))?.chosen?.slotId).toBe("tue14");
		// Not among the six shown (the 23rd), found by asking for it.
		expect((await turn(port, "23 noiembrie la 9", first?.state))?.chosen?.slotId).toBe("mon23");
		// A request that names the time straight away needs no earlier list.
		expect((await turn(port, "vreau o programare marți la 10"))?.chosen?.slotId).toBe("tue10");
	});

	it("a clock time that matches several shown times lists them; one that matches none shows the day", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		const nine = await turn(port, "la 9", first?.state);
		expect(nine).toMatchObject({ kind: "times", notice: "ambiguous" });
		expect(dates(nine)).toEqual(["2026-11-13 09:00", "2026-11-16 09:00"]);
		const none = await turn(port, "marți la 11", first?.state);
		expect(none).toMatchObject({ kind: "times", notice: "not_free" });
		expect(dates(none)).toEqual(["2026-11-17 10:00"]);
	});

	it("a time taken in between is not offered: the nearest free ones instead", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		port.take("harbour", "bike-fitting", "mon9");
		const retry = await turn(port, "a doua", first?.state);
		expect(retry).toMatchObject({ kind: "times", notice: "taken" });
		expect(retry?.slots.map((s) => s.slotId)).not.toContain("mon9");
	});

	it("a state that names a time the store never offered cannot be confirmed", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		const forged = first?.state && {
			...first.state,
			shown: [{ ...(first.state.shown[0] ?? FORGED), slotId: "forged" }],
		};
		const picked = await turn(port, "prima", forged);
		expect(picked?.kind).toBe("times");
		expect(picked?.notice).toBe("taken");
	});

	it("asks which services can be booked, and keeps the state", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		const services = await turn(port, "what services can I book?", first?.state);
		expect(services).toMatchObject({ kind: "services", services: ["bike-fitting"] });
		expect(services?.state?.shown).toEqual(first?.state?.shown);
	});

	it("leaves a question that is not about booking to the grounded answer", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		for (const question of [
			"Cât costă evaluarea?",
			"how does the evaluation work?",
			"Cum ajung la clinică în persoană?",
			"mulțumesc",
		]) {
			expect(await turn(port, question, first?.state)).toBeUndefined();
		}
		expect(await turn(port, "săptămâna viitoare", undefined)).toBeUndefined();
	});

	it("says unavailable when the store is down", async () => {
		const port = store();
		const first = await turn(port, "vreau o programare");
		port.failing = true;
		expect(await turn(port, "a doua", first?.state)).toMatchObject({ status: "unavailable" });
		expect(await turn(port, "joi dimineața", first?.state)).toMatchObject({
			status: "unavailable",
		});
	});
});

const FORGED = {
	slotId: "x",
	startsAt: "2026-11-13T07:00:00.000Z",
	date: "2026-11-13",
	time: "09:00",
	weekday: 5,
	durationMinutes: 60,
	mode: "onsite" as const,
	practitioner: "DEMO Fitter",
};

describe("cancelling in the conversation", () => {
	it("asks for the reference and the cancel code, and writes nothing", async () => {
		const port = store().addRequest(CODE, SECRET, at("2026-11-16", "09:00"));
		const ask = await turn(port, "vreau să anulez programarea");
		expect(ask).toMatchObject({ kind: "cancel_ask", state: { stage: "cancel" } });
		expect(port.calls.some((c) => c.method === "cancel")).toBe(false);
		const english = await turn(port, "I need to cancel my appointment");
		expect(english?.kind).toBe("cancel_ask");
	});

	it("cancels with both, in the same message or in the next one", async () => {
		const port = store().addRequest(CODE, SECRET, at("2026-11-16", "09:00"));
		const done = await turn(port, `anulează programarea ${CODE} ${SECRET}`);
		expect(done).toMatchObject({ kind: "cancel_result", cancel: { status: "cancelled" } });
		expect(done?.cancel?.startsAt).toBe(new Date(at("2026-11-16", "09:00")).toISOString());
		expect(port.isCancelled(CODE)).toBe(true);

		const other = store().addRequest(CODE, SECRET, at("2026-11-16", "09:00"));
		const ask = await turn(other, "I want to cancel");
		const sent = await turn(other, `${CODE} and ${SECRET}`, ask?.state);
		expect(sent?.cancel?.status).toBe("cancelled");
	});

	it("each refusal is its own result and changes nothing", async () => {
		const port = store().addRequest(CODE, SECRET, at("2026-11-16", "09:00"));
		const wrong = await turn(port, `cancel my appointment ${CODE} ZZZZ-ZZZZ-ZZZZ-ZZZZ`);
		expect(wrong?.cancel?.status).toBe("not_found");
		const unknown = await turn(port, `cancel my appointment 0000-0000 ${SECRET}`);
		expect(unknown?.cancel?.status).toBe("not_found");
		expect(port.isCancelled(CODE)).toBe(false);
		await turn(port, `cancel my appointment ${CODE} ${SECRET}`);
		const again = await turn(port, `cancel my appointment ${CODE} ${SECRET}`);
		expect(again?.cancel?.status).toBe("not_cancellable");
		port.failing = true;
		const down = await turn(port, `cancel my appointment ${CODE} ${SECRET}`);
		expect(down).toMatchObject({ status: "unavailable", cancel: { status: "unavailable" } });
	});

	it("a how-does-cancelling-work question is not a cancellation", async () => {
		const port = store();
		expect(await turn(port, "Cum funcționează anularea unei programări?")).toBeUndefined();
	});
});

describe("through the engine", () => {
	it("keeps the booking context on follow-up turns without asking the model", async () => {
		const server = await startFakeOpenRouter([{ kind: "text", chunks: ["x"] }]);
		fake = server;
		const port = store();
		const profile: Profile = { ...BIKES, scheduling: SCOPE };
		const engine = createEngine({
			profiles: [profile],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling: port,
		});
		const guide = engine.guide("harbour-bikes");
		const first = await collect(
			guide.ask({ question: "I want to book an appointment", locale: "en" }),
		);
		const offer = first[0]?.type === "booking" ? first[0].offer : undefined;
		expect(offer?.state).toBeDefined();
		// Without the carried state the follow-up is an ordinary question; with it, a booking turn.
		const second = await collect(
			guide.ask({
				question: "the second one",
				locale: "en",
				history: [{ role: "guide", text: "Here are the free times." }],
				...(offer?.state === undefined ? {} : { booking: offer.state }),
			}),
		);
		expect(shape(second)).toEqual(["booking", "done"]);
		const confirm = second[0]?.type === "booking" ? second[0].offer : undefined;
		expect(confirm?.kind).toBe("confirm");
		expect(server.requests).toHaveLength(0);
		// A tampered state is refused as input, never trusted.
		const bad = await collect(
			guide.ask({ question: "the second one", locale: "en", booking: { stage: "x" } as never }),
		);
		expect(shape(bad)).not.toContain("booking");
	});
});

describe("the findAvailability tool's weekday filter", () => {
	it("keeps only that day of the week, and the tool's schema accepts it", async () => {
		const { runFindAvailability, schedulingInputSchemas } = await import("../scheduling/tools");
		const input = schedulingInputSchemas(SCOPE.services).find.parse({
			service: "bike-fitting",
			weekday: 2,
			days: 14,
		});
		const found = await runFindAvailability(store(), SCOPE, input, NOW);
		expect(found.slots.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-17"]);
		expect(
			schedulingInputSchemas(SCOPE.services).find.safeParse({ service: "bike-fitting", weekday: 8 })
				.success,
		).toBe(false);
	});
});
