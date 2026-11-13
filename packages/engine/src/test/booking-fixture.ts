import { type BookingOffer, type BookingScope, bookingTurn } from "../booking";
import type { BookingState, DetailField } from "../booking-state";
import { BUNDLED_LANGUAGES } from "../language/index";
import type { SchedulingPort } from "../scheduling/port";
import { MemorySchedulingStore } from "../testing";

/** Thursday 12 November 2026, 10:00 in Bucharest (UTC+2). */
export const NOW = Date.parse("2026-11-12T08:00:00Z");
export const SCOPE = { tenant: "harbour", services: ["bike-fitting"] };

const at = (date: string, time: string): number => Date.parse(`${date}T${time}:00+02:00`);
const FREE: ReadonlyArray<readonly [string, string, string]> = [
	["fri", "2026-11-13", "09:00"],
	["mon9", "2026-11-16", "09:00"],
	["tue10", "2026-11-17", "10:00"],
	["tue14", "2026-11-17", "14:00"],
];

export function store(without: ReadonlyArray<string> = []): MemorySchedulingStore {
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

/** One visitor message in the booking dialogue; `typed` is what they wrote before redaction. */
export async function say(
	port: SchedulingPort,
	question: string,
	state?: BookingState,
	options: { typed?: string; scope?: BookingScope["scope"]; locale?: string } = {},
): Promise<BookingOffer | undefined> {
	return bookingTurn(
		{ port, scope: options.scope ?? SCOPE },
		{
			question,
			...(options.typed === undefined ? {} : { typed: options.typed }),
			...(options.locale === undefined ? {} : { locale: options.locale }),
			...(state === undefined ? {} : { state }),
		},
		BUNDLED_LANGUAGES,
		NOW,
	);
}

/** The state as it is when the guide has just asked for `field`. */
export function asking(offer: BookingOffer, field: DetailField | "confirm"): BookingState {
	if (offer.state === undefined) throw new Error("the offer carries no state");
	return { ...offer.state, asked: field };
}

/** A port with only the two methods every store has: no hold, no submit. */
export function findOnly(port: MemorySchedulingStore): SchedulingPort {
	return { findSlots: (search) => port.findSlots(search), cancel: (input) => port.cancel(input) };
}

/** A reply that must exist and be an offer of this kind. */
export async function sayKind(
	port: SchedulingPort,
	text: string,
	state: BookingState | undefined,
	kind: BookingOffer["kind"],
	options: Parameters<typeof say>[3] = {},
): Promise<BookingOffer> {
	const offer = await say(port, text, state, options);
	if (offer?.kind !== kind) {
		throw new Error(`"${text}" gave ${offer?.kind ?? "no offer"}, expected ${kind}`);
	}
	return offer;
}

/** The conversation up to the details step: the request, the week, the time. */
export async function chosen(
	port: SchedulingPort = store(),
	options: Parameters<typeof say>[3] = {},
): Promise<BookingOffer> {
	const first = await say(port, "Vreau să programez o evaluare", undefined, options);
	const week = await say(port, "săptămâna viitoare", first?.state, options);
	return sayKind(port, "marți la 10", week?.state, "confirm", options);
}

/** What a visitor says to give all five details, one answer per question. */
export const ANSWERS = [
	"Ana Pop",
	"34 de ani",
	"Mă simt anxioasă de câteva luni și nu dorm bine",
	"0722 123 456",
	"ana@example.ro",
] as const;

/** The summary, reached by answering every question in turn. */
export async function summary(
	port: SchedulingPort = store(),
	options: Parameters<typeof say>[3] = {},
): Promise<BookingOffer> {
	let offer = await chosen(port, options);
	for (const [i, answer] of ANSWERS.entries()) {
		const kind = i === ANSWERS.length - 1 ? "summary" : "confirm";
		offer = await sayKind(port, answer, offer.state, kind, options);
	}
	if (offer.kind !== "summary") throw new Error(`expected the summary, got ${offer.kind}`);
	return offer;
}
