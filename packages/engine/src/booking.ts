import { findCodes, isCancelIntent, readWish, type Wish } from "./booking-parse";
import {
	type BookingCancel,
	type BookingCriteria,
	type BookingKind,
	type BookingNotice,
	type BookingState,
	MAX_SHOWN,
	type PartOfDay,
} from "./booking-state";
import { within } from "./deadline";
import type { LanguagePack } from "./language/pack";
import { addLocalDays } from "./scheduling/local-time";
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
	BookingKind,
	BookingNotice,
	BookingState,
} from "./booking-state";
export { BookingStateSchema } from "./booking-state";

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
	/** The organisation's limits the form holds to, on a site its settings govern. */
	limits?: BookingLimits;
}

/** The profile's scheduling, when both the profile opted in and the engine was given a store. */
export interface BookingScope {
	port: SchedulingPort;
	scope: ProfileScheduling;
	/** The organisation's limits on booking in the chat, on a site its settings govern. */
	limits?: BookingLimits;
}

/**
 * The organisation's limits on booking in the chat (`booking.*` of its visitor settings): no time later than
 * `horizonDays` from now is offered, and `offerCallback` false leaves the call-back out of the form. The offer carries
 * them, so the app's form (its picker and its call-back switch) holds to them too. The booking form's own fields (the
 * name, a way to reach the person, for whom, consent and the time or call back) are not part of them.
 */
export interface BookingLimits {
	horizonDays: number;
	offerCallback: boolean;
}

const DAY_MS = 86_400_000;

/** How many free times one offer shows, and over how many days. */
const OFFER_SLOTS = 6;
const OFFER_DAYS = 14;
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

function fresh(service: string): BookingCriteria {
	return { service, days: OFFER_DAYS, partOfDay: "any" };
}

/** The criteria after the wish: only what the message named changes. */
function merge(
	base: BookingCriteria,
	wish: Wish,
	shown: ReadonlyArray<ProposedSlot>,
): BookingCriteria {
	let { service, days, partOfDay, mode, fromDate, weekday } = base;
	if (wish.anything === true) {
		fromDate = undefined;
		weekday = undefined;
		days = OFFER_DAYS;
		partOfDay = "any";
	}
	if (wish.service !== undefined) service = wish.service;
	if (wish.fromDate !== undefined) {
		fromDate = wish.fromDate;
		days = wish.days ?? 1;
		weekday = undefined;
	} else if (wish.weekday !== undefined && days < 7) {
		fromDate = undefined;
		days = OFFER_DAYS;
	}
	if (wish.weekday !== undefined) weekday = wish.weekday;
	if (wish.partOfDay !== undefined) partOfDay = wish.partOfDay;
	if (wish.mode !== undefined) mode = wish.mode;
	const last = shown.at(-1);
	if (wish.later === true && last !== undefined) {
		fromDate = addLocalDays(last.date, 1);
		days = OFFER_DAYS;
		weekday = undefined;
	}
	return {
		service,
		days,
		partOfDay,
		...(fromDate === undefined ? {} : { fromDate }),
		...(weekday === undefined ? {} : { weekday }),
		...(mode === undefined ? {} : { mode }),
	};
}

function unique(slots: ReadonlyArray<ProposedSlot>): ReadonlyArray<ProposedSlot> {
	const seen = new Set<string>();
	return slots.filter((slot) => !seen.has(slot.slotId) && seen.add(slot.slotId) !== undefined);
}

function stateOf(
	stage: BookingState["stage"],
	criteria: BookingCriteria,
	slots: ReadonlyArray<ProposedSlot>,
): BookingState {
	return { stage, criteria, shown: unique(slots).slice(0, MAX_SHOWN) };
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

async function look(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	limit: number = OFFER_SLOTS,
	partOfDay: PartOfDay = criteria.partOfDay,
): Promise<FindAvailabilityOutput> {
	const found = await lookAll(booking, criteria, now, limit, partOfDay);
	const horizon = booking.limits?.horizonDays;
	if (horizon === undefined || found.status !== "ok") return found;
	// Nothing later than the organisation's horizon is offered.
	const last = now + horizon * DAY_MS;
	const slots = found.slots.filter((slot) => Date.parse(slot.startsAt) <= last);
	return slots.length === 0 ? { ...found, status: "none", slots } : { ...found, slots };
}

function lookAll(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	limit: number,
	partOfDay: PartOfDay,
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

function restricted(criteria: BookingCriteria): boolean {
	return (
		criteria.fromDate !== undefined ||
		criteria.weekday !== undefined ||
		criteria.partOfDay !== "any" ||
		criteria.mode !== undefined
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
): Promise<BookingOffer> {
	const horizon = booking.limits?.horizonDays;
	// A time past the organisation's horizon (carried in an older state) is not offered for confirmation.
	if (horizon !== undefined && Date.parse(slot.startsAt) > now + horizon * DAY_MS) {
		return searchOffer(booking, criteria, now, "not_free");
	}
	const checked = await runRequestAppointment(booking.port, booking.scope, {
		service: criteria.service,
		slotId: slot.slotId,
		startsAt: slot.startsAt,
	});
	if (checked.status === "needs_confirmation") {
		return {
			kind: "confirm",
			service: criteria.service,
			status: "ok",
			slots: [checked.proposal],
			chosen: checked.proposal,
			state: stateOf("confirm", criteria, shown.length === 0 ? [checked.proposal] : shown),
		};
	}
	if (checked.status === "no_longer_free") return searchOffer(booking, criteria, now, "taken");
	return timesOffer(criteria, { status: "unavailable", slots: [] }, undefined);
}

function minutesOf(slot: ProposedSlot): number {
	return Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3));
}

function partOf(minutes: number): PartOfDay {
	if (minutes < 720) return "morning";
	return minutes < 1020 ? "afternoon" : "evening";
}

function matchesWish(slot: ProposedSlot, wish: Wish): boolean {
	return (
		(wish.minutes === undefined || minutesOf(slot) === wish.minutes) &&
		(wish.weekday === undefined || slot.weekday === wish.weekday) &&
		(wish.fromDate === undefined || wish.days !== 1 || slot.date === wish.fromDate)
	);
}

/** A time named by clock ("Tuesday at 10"): among the shown ones, else among the day's free ones. */
async function pickByClock(
	booking: BookingScope,
	criteria: BookingCriteria,
	wish: Wish,
	shown: ReadonlyArray<ProposedSlot>,
	now: number,
): Promise<BookingOffer> {
	const among = shown.filter((slot) => matchesWish(slot, wish));
	const only = among.length === 1 ? among[0] : undefined;
	if (only !== undefined) return confirmOffer(booking, criteria, only, shown, now);
	if (among.length > 1) {
		return timesOffer(criteria, { status: "ok", slots: among }, "ambiguous");
	}
	const minutes = wish.minutes ?? 0;
	const found = await look(booking, criteria, now, PICK_SLOTS, wish.partOfDay ?? partOf(minutes));
	const hits = found.slots.filter((slot) => matchesWish(slot, wish));
	const hit = hits.length === 1 ? hits[0] : undefined;
	if (hit !== undefined) return confirmOffer(booking, criteria, hit, hits, now);
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
		return {
			...booking,
			scope: { tenant: scope.tenant, services: entries.map((e) => e.slug), names },
		};
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
		if (picked !== undefined) return confirmOffer(booking, criteria, picked, shown, now);
	}
	if (wish.minutes !== undefined) return pickByClock(booking, criteria, wish, shown, now);
	const refined = base !== undefined || Object.keys(wish).length > 0;
	return searchOffer(booking, criteria, now, refined ? "refined" : undefined);
}

/**
 * One booking turn: the offer to show, or undefined when the message is not about booking and the
 * grounded answer should take it. `state` is what the page carried from the last booking turn.
 */
export async function bookingTurn(
	offered: BookingScope,
	input: { question: string; state?: BookingState },
	packs: ReadonlyArray<LanguagePack>,
	now: number = Date.now(),
): Promise<BookingOffer | undefined> {
	const offer = await bookingStep(offered, input, packs, now);
	return offer === undefined || offered.limits === undefined
		? offer
		: { ...offer, limits: offered.limits };
}

async function bookingStep(
	offered: BookingScope,
	input: { question: string; state?: BookingState },
	packs: ReadonlyArray<LanguagePack>,
	now: number,
): Promise<BookingOffer | undefined> {
	const { question, state } = input;
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
	return meaningful(wish, state, question) ? act(booking, state, wish, now) : undefined;
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
