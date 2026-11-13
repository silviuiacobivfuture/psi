import { fresh, matchesWish, merge, partOf, restricted, unique } from "./booking-criteria";
import { missingDetails, readDetails } from "./booking-details";
import { findCodes, isCancelIntent, readWish, type Wish } from "./booking-parse";
import {
	type BookingCancel,
	type BookingCriteria,
	type BookingDetails,
	type BookingDetailsReport,
	type BookingKind,
	type BookingNotice,
	type BookingState,
	MAX_SHOWN,
	type PartOfDay,
} from "./booking-state";
import { within } from "./deadline";
import type { LanguagePack } from "./language/pack";
import type { ProfileScheduling, SchedulingPort } from "./scheduling/port";
import {
	type FindAvailabilityOutput,
	type ProposedSlot,
	runCancelRequest,
	runFindAvailability,
	runRequestAppointment,
	SCHEDULING_TIMEOUT_MS,
} from "./scheduling/tools";
import { fold } from "./text/normalize";

export type {
	BookingCancel,
	BookingCriteria,
	BookingDetails,
	BookingDetailsReport,
	BookingKind,
	BookingNotice,
	BookingState,
} from "./booking-state";
export { BookingDetailsSchema, BookingStateSchema } from "./booking-state";

/**
 * Booking inside the conversation. When a profile schedules, the engine handles the booking
 * dialogue itself, without a model: the first request, then every refinement (another day, next
 * week, mornings, online), a pick by text ("Tuesday at 10", "the second one"), and a cancellation
 * with the reference and cancel code. It uses the scheduling tools' own functions
 * (`findAvailability`, `requestAppointment`, `cancelRequest`) and sends the result as a `booking`
 * event; the app renders it: the free times as buttons, or, for a time that was named and checked
 * free, its confirm step (the booking form: name, contact, consent), which holds the time,
 * confirms it and shows the reference, exactly as its booking page does. Nothing here holds or
 * books, and no personal detail is read or kept: crisis, the limits and the rules have already
 * run. The conversation's booking state travels with the visitor's page (`BookingState`).
 */

/** What a booking turn shows, and the state the next turn starts from. */
export interface BookingOffer {
	kind: BookingKind;
	/** The service the times are for. */
	service: string;
	status: "ok" | "none" | "unavailable";
	timeZone?: string;
	slots: ReadonlyArray<ProposedSlot>;
	/** Why the list differs from what was asked, when it does. */
	notice?: BookingNotice;
	/** `confirm`: the time that was named and found free. */
	chosen?: ProposedSlot;
	/** `confirm`: the details typed in the chat so far, and what the form still needs. */
	details?: BookingDetailsReport;
	/** `cancel_result`: how the cancellation went. */
	cancel?: BookingCancel;
	/** `services`: what can be booked here. */
	services?: ReadonlyArray<string>;
	/** `services`: the names of those services in both languages, when the store has them. */
	names?: Readonly<Record<string, { ro: string; en: string }>>;
	/** `services`: the visitor must choose one before times can be shown. */
	choose?: boolean;
	/** The state to carry into the next turn (absent once the flow is over). */
	state?: BookingState;
}

/** The profile's scheduling, when both the profile opted in and the engine was given a store. */
export interface BookingScope {
	port: SchedulingPort;
	scope: ProfileScheduling;
}

/** How many free times one offer shows, and over how many days. */
const OFFER_SLOTS = 6;
/** The window a pick by clock time looks through. */
const PICK_SLOTS = 10;
const QUESTION_WORDS = /\b(cum|cat|cand|unde|de ce|cine|how|where|why|who|when)\b/;

/** True when the question asks to book (the packs' `bookingIntent` rules, on folded text). */
export function isBookingIntent(question: string, packs: ReadonlyArray<LanguagePack>): boolean {
	const folded = fold(question);
	return packs.some((pack) => (pack.bookingIntent ?? []).some((rule) => rule.test(folded)));
}

function localToday(now: number): string {
	return new Date(now).toISOString().slice(0, 10);
}

function stateOf(
	stage: BookingState["stage"],
	criteria: BookingCriteria,
	slots: ReadonlyArray<ProposedSlot>,
	chosen?: { slot: ProposedSlot; details: BookingDetails },
): BookingState {
	return {
		stage,
		criteria,
		shown: unique(slots).slice(0, MAX_SHOWN),
		...(chosen === undefined
			? {}
			: {
					chosen: chosen.slot,
					...(Object.keys(chosen.details).length === 0 ? {} : { details: chosen.details }),
				}),
	};
}

/** The confirm step's offer for a time checked free, with what the chat told so far. */
function detailsOffer(
	criteria: BookingCriteria,
	slot: ProposedSlot,
	shown: ReadonlyArray<ProposedSlot>,
	values: BookingDetails,
	heard: BookingDetailsReport["heard"] = [],
	nudge = false,
): BookingOffer {
	return {
		kind: "confirm",
		service: criteria.service,
		status: "ok",
		slots: [slot],
		chosen: slot,
		details: { values, missing: missingDetails(values), heard, nudge },
		state: stateOf("details", criteria, shown.length === 0 ? [slot] : shown, {
			slot,
			details: values,
		}),
	};
}

function timesOffer(
	criteria: BookingCriteria,
	found: Pick<FindAvailabilityOutput, "status" | "timeZone" | "slots">,
	notice: BookingNotice | undefined,
): BookingOffer {
	const status = found.status === "unknown_service" ? "unavailable" : found.status;
	return {
		kind: "times",
		service: criteria.service,
		status,
		...(found.timeZone === undefined ? {} : { timeZone: found.timeZone }),
		slots: found.slots,
		...(notice === undefined ? {} : { notice }),
		state: stateOf("times", criteria, found.slots),
	};
}

function look(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	limit: number = OFFER_SLOTS,
	partOfDay: PartOfDay = criteria.partOfDay,
): Promise<FindAvailabilityOutput> {
	return runFindAvailability(
		booking.port,
		booking.scope,
		{
			service: criteria.service,
			days: criteria.days,
			partOfDay,
			limit,
			...(criteria.fromDate === undefined ? {} : { fromDate: criteria.fromDate }),
			...(criteria.weekday === undefined ? {} : { weekday: criteria.weekday }),
			...(criteria.mode === undefined ? {} : { mode: criteria.mode }),
		},
		now,
	);
}

/** A search; when nothing matches a restricted one, the nearest free times instead (`relaxed`). */
async function searchOffer(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	notice: BookingNotice | undefined,
): Promise<BookingOffer> {
	const found = await look(booking, criteria, now);
	if (found.status === "none" && restricted(criteria)) {
		const wide = fresh(criteria.service);
		const nearest = await look(booking, wide, now);
		if (nearest.status === "ok")
			return timesOffer(wide, nearest, notice === "taken" ? "taken" : "relaxed");
	}
	return timesOffer(criteria, found, found.status === "ok" ? notice : undefined);
}

/** Checks the named time is still free and shows it as the confirm step. */
async function confirmOffer(
	booking: BookingScope,
	criteria: BookingCriteria,
	slot: ProposedSlot,
	shown: ReadonlyArray<ProposedSlot>,
	now: number,
	known: BookingDetails = {},
	heard: BookingDetailsReport["heard"] = [],
	nudge = false,
): Promise<BookingOffer> {
	const checked = await runRequestAppointment(booking.port, booking.scope, {
		service: criteria.service,
		slotId: slot.slotId,
		startsAt: slot.startsAt,
	});
	if (checked.status === "needs_confirmation") {
		return detailsOffer(criteria, checked.proposal, shown, known, heard, nudge);
	}
	if (checked.status === "no_longer_free") return searchOffer(booking, criteria, now, "taken");
	return timesOffer(criteria, { status: "unavailable", slots: [] }, undefined);
}

/** A time named by clock ("Tuesday at 10"): among the shown ones, else among the day's free ones. */
async function pickByClock(
	booking: BookingScope,
	criteria: BookingCriteria,
	wish: Wish,
	shown: ReadonlyArray<ProposedSlot>,
	now: number,
	known: BookingDetails,
): Promise<BookingOffer> {
	const among = shown.filter((slot) => matchesWish(slot, wish));
	const only = among.length === 1 ? among[0] : undefined;
	if (only !== undefined) return confirmOffer(booking, criteria, only, shown, now, known);
	if (among.length > 1) {
		return timesOffer(criteria, { status: "ok", slots: among }, "ambiguous");
	}
	const minutes = wish.minutes ?? 0;
	const found = await look(booking, criteria, now, PICK_SLOTS, wish.partOfDay ?? partOf(minutes));
	const hits = found.slots.filter((slot) => matchesWish(slot, wish));
	const hit = hits.length === 1 ? hits[0] : undefined;
	if (hit !== undefined) return confirmOffer(booking, criteria, hit, hits, now, known);
	if (hits.length > 1) return timesOffer(criteria, { ...found, slots: hits }, "ambiguous");
	if (found.status === "ok") return timesOffer(criteria, found, "not_free");
	return searchOffer(booking, criteria, now, "not_free");
}

/** Whether the message named anything the dialogue acts on. */
function meaningful(wish: Wish, state: BookingState | undefined, question: string): boolean {
	const specific =
		wish.ordinal !== undefined ||
		wish.weekday !== undefined ||
		wish.minutes !== undefined ||
		wish.fromDate !== undefined ||
		wish.partOfDay !== undefined;
	const vague =
		wish.mode !== undefined ||
		wish.later === true ||
		wish.anything === true ||
		wish.asksServices === true ||
		(wish.service !== undefined && wish.service !== state?.criteria.service);
	return specific || (vague && !QUESTION_WORDS.test(fold(question)));
}

async function cancelTurn(
	booking: BookingScope,
	question: string,
	state: BookingState | undefined,
): Promise<BookingOffer> {
	const service = state?.criteria.service ?? booking.scope.services[0] ?? "";
	const codes = findCodes(question);
	if (codes.reference === undefined || codes.cancelCode === undefined) {
		return {
			kind: "cancel_ask",
			service,
			status: "ok",
			slots: [],
			state: {
				stage: "cancel",
				criteria: state?.criteria ?? fresh(service),
				shown: state?.shown ?? [],
			},
		};
	}
	const done = await runCancelRequest(booking.port, {
		reference: codes.reference,
		cancelCode: codes.cancelCode,
	});
	return {
		kind: "cancel_result",
		service,
		status: done.status === "unavailable" ? "unavailable" : "ok",
		slots: [],
		cancel: {
			status: done.status,
			...(done.startsAt === undefined ? {} : { startsAt: done.startsAt }),
		},
	};
}

/**
 * The booking scope for this turn: the tenant's services as the store has them now (the port
 * caches briefly), or the profile's own list when the port cannot say or the store does not
 * answer. Read once per turn; everything after it works on this snapshot.
 */
async function live(booking: BookingScope): Promise<BookingScope> {
	const { port, scope } = booking;
	if (port.catalogue === undefined) return booking;
	try {
		const entries = await within(port.catalogue(scope.tenant), SCHEDULING_TIMEOUT_MS, "catalogue");
		const names = Object.fromEntries(
			entries.flatMap((e) => (e.name === undefined ? [] : [[e.slug, e.name]])),
		);
		return { port, scope: { tenant: scope.tenant, services: entries.map((e) => e.slug), names } };
	} catch {
		return booking;
	}
}

/** Acts on what the message named: the services, a pick by position or clock, or a new search. */
async function act(
	booking: BookingScope,
	base: BookingState | undefined,
	wish: Wish,
	now: number,
): Promise<BookingOffer> {
	const service = base?.criteria.service ?? booking.scope.services[0] ?? "";
	const shown = base?.shown ?? [];
	// No service in the store: nothing to book, so the page falls back to the callback form.
	if (booking.scope.services.length === 0) {
		return { kind: "times", service, status: "unavailable", slots: [] };
	}
	const criteria = merge(base?.criteria ?? fresh(service), wish, shown);
	const several = booking.scope.services.length > 1;
	const unchosen = base === undefined && wish.service === undefined && several;
	if (wish.asksServices === true || unchosen) {
		return {
			kind: "services",
			service: criteria.service,
			status: "ok",
			slots: [],
			services: booking.scope.services,
			...(booking.scope.names === undefined ? {} : { names: booking.scope.names }),
			...(wish.asksServices === true ? {} : { choose: true }),
			state: stateOf(base?.stage ?? "times", criteria, shown),
		};
	}
	if (wish.ordinal !== undefined && shown.length > 0) {
		const index = wish.ordinal === -1 ? shown.length - 1 : wish.ordinal - 1;
		const picked = shown[index];
		if (picked !== undefined)
			return confirmOffer(booking, criteria, picked, shown, now, base?.details ?? {});
	}
	if (wish.minutes !== undefined)
		return pickByClock(booking, criteria, wish, shown, now, base?.details ?? {});
	const refined = base !== undefined || Object.keys(wish).length > 0;
	return searchOffer(booking, criteria, now, refined ? "refined" : undefined);
}

/**
 * One booking turn: the offer to show, or undefined when the message is not about booking and the
 * grounded answer should take it. `state` is what the page carried from the last booking turn.
 */
export async function bookingTurn(
	offered: BookingScope,
	input: { question: string; typed?: string; state?: BookingState },
	packs: ReadonlyArray<LanguagePack>,
	now: number = Date.now(),
): Promise<BookingOffer | undefined> {
	const { question, state } = input;
	// What the visitor typed, before the screening hid any phone or e-mail in it: read only for the
	// details of a booking that has a time chosen.
	const typed = input.typed ?? question;
	const booking = await live(offered);
	const codes = findCodes(question);
	const both = codes.reference !== undefined && codes.cancelCode !== undefined;
	const awaiting =
		state?.stage === "cancel" && (codes.reference !== undefined || codes.cancelCode !== undefined);
	if (isCancelIntent(question) || both || awaiting) return cancelTurn(booking, question, state);
	const services = booking.scope.services;
	if (isBookingIntent(question, packs)) {
		const wish = readWish(question, localToday(now), services, false, booking.scope.names);
		return act(booking, undefined, wish, now);
	}
	if (state === undefined || state.stage === "cancel") return undefined;
	const wish = readWish(question, localToday(now), services, true, booking.scope.names);
	if (meaningful(wish, state, question)) return act(booking, state, wish, now);
	return state.stage === "details" ? detailsTurn(booking, state, typed, now) : undefined;
}

/**
 * Free text while a time is chosen and the form is up. What it tells (a name, a phone or an
 * e-mail, who it is for, an explicit agreement) fills the form; a real question goes to the guide
 * (the chosen time stays in the state); anything else sends the visitor back to the form. The
 * chosen time is checked free again, so a hold that lapsed re-offers the nearest times.
 */
async function detailsTurn(
	booking: BookingScope,
	state: BookingState,
	typed: string,
	now: number,
): Promise<BookingOffer | undefined> {
	const { chosen, criteria } = state;
	if (chosen === undefined) return undefined;
	const { values, heard } = readDetails(typed, state.details);
	const nothing = heard.length === 0;
	if (nothing && (typed.includes("?") || QUESTION_WORDS.test(fold(typed)))) return undefined;
	return confirmOffer(booking, criteria, chosen, state.shown, now, values, heard, nothing);
}

/** The chosen time shown again, with what was typed so far: the answer for a reply that denied the calendar. */
export async function reshow(
	offered: BookingScope,
	state: BookingState | undefined,
	question: string,
	now: number = Date.now(),
): Promise<BookingOffer> {
	if (state?.stage === "details" && state.chosen !== undefined) {
		const booking = await live(offered);
		return confirmOffer(
			booking,
			state.criteria,
			state.chosen,
			state.shown,
			now,
			state.details ?? {},
		);
	}
	return offerTimes(offered, question, now);
}

/** Looks up the next free times for the profile's first service. Never throws. */
export async function offerTimes(
	offered: BookingScope,
	question: string,
	now: number = Date.now(),
): Promise<BookingOffer> {
	const booking = await live(offered);
	const wish = readWish(
		question,
		localToday(now),
		booking.scope.services,
		false,
		booking.scope.names,
	);
	return act(booking, undefined, wish, now);
}
