import { confirmation } from "./booking-confirm";
import { fresh, matchesWish, merge, partOf } from "./booking-criteria";
import { answerFirst, detailsTurn, keepOf, talkOf } from "./booking-details-turn";
import { QUESTION_WORDS } from "./booking-fields";
import {
	type BookingOffer,
	type BookingScope,
	confirmOffer,
	type Keep,
	localToday,
	look,
	searchOffer,
	stateOf,
	type Talk,
	timesOffer,
} from "./booking-offers";
import { findCodes, isCancelIntent, readWish, type Wish } from "./booking-parse";
import type { BookingCriteria, BookingLang, BookingState } from "./booking-state";
import { within } from "./deadline";
import { createLanguageDetector } from "./language/detect";
import type { LanguagePack } from "./language/pack";
import { type ProposedSlot, runCancelRequest, SCHEDULING_TIMEOUT_MS } from "./scheduling/tools";
import { fold } from "./text/normalize";

export type { BookingOffer, BookingScope } from "./booking-offers";
export type {
	BookedRequest,
	BookingCancel,
	BookingCriteria,
	BookingDetails,
	BookingDetailsReport,
	BookingKind,
	BookingLang,
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
 * free, the details step. There the guide asks for name, age, what is going on, phone and e-mail
 * one at a time, reads each answer with the booking form's own rules, shows a summary, and on the
 * visitor's explicit yes holds the time and submits the request itself (`booking-submit.ts`),
 * answering with the reference and the cancel code. The model never takes part: it fills no field,
 * and nothing is submitted without the yes. Crisis, the limits and the rules have already run.
 * The conversation's booking state travels with the visitor's page (`BookingState`).
 */

/** The window a pick by clock time looks through. */
const PICK_SLOTS = 10;

/** True when the question asks to book (the packs' `bookingIntent` rules, on folded text). */
export function isBookingIntent(question: string, packs: ReadonlyArray<LanguagePack>): boolean {
	const folded = fold(question);
	return packs.some((pack) => (pack.bookingIntent ?? []).some((rule) => rule.test(folded)));
}

function keepFrom(talk: Talk): Keep {
	return {
		details: talk.values,
		...(talk.key === undefined ? {} : { key: talk.key }),
		...(talk.lang === undefined ? {} : { lang: talk.lang }),
	};
}

/** A time named by clock ("Tuesday at 10"): among the shown ones, else among the day's free ones. */
async function pickByClock(
	booking: BookingScope,
	criteria: BookingCriteria,
	wish: Wish,
	shown: ReadonlyArray<ProposedSlot>,
	now: number,
	talk: Talk,
): Promise<BookingOffer> {
	const keep = keepFrom(talk);
	const among = shown.filter((slot) => matchesWish(slot, wish));
	const only = among.length === 1 ? among[0] : undefined;
	if (only !== undefined) return confirmOffer(booking, criteria, only, shown, now, talk);
	if (among.length > 1) {
		return timesOffer(criteria, { status: "ok", slots: among }, "ambiguous", keep);
	}
	const minutes = wish.minutes ?? 0;
	const found = await look(booking, criteria, now, PICK_SLOTS, wish.partOfDay ?? partOf(minutes));
	const hits = found.slots.filter((slot) => matchesWish(slot, wish));
	const hit = hits.length === 1 ? hits[0] : undefined;
	if (hit !== undefined) return confirmOffer(booking, criteria, hit, hits, now, talk);
	if (hits.length > 1) return timesOffer(criteria, { ...found, slots: hits }, "ambiguous", keep);
	if (found.status === "ok") return timesOffer(criteria, found, "not_free", keep);
	return searchOffer(booking, criteria, now, "not_free", keep);
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
		return { port, scope: { ...scope, services: entries.map((e) => e.slug), names } };
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
	lang: BookingLang,
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
			state: stateOf(base?.stage ?? "times", criteria, shown, {
				...(base?.details === undefined ? {} : { details: base.details }),
				...(base?.key === undefined ? {} : { key: base.key }),
				lang,
			}),
		};
	}
	if (wish.ordinal !== undefined && shown.length > 0) {
		const index = wish.ordinal === -1 ? shown.length - 1 : wish.ordinal - 1;
		const picked = shown[index];
		if (picked !== undefined)
			return confirmOffer(booking, criteria, picked, shown, now, talkOf(base, lang));
	}
	if (wish.minutes !== undefined)
		return pickByClock(booking, criteria, wish, shown, now, talkOf(base, lang));
	const refined = base !== undefined || Object.keys(wish).length > 0;
	return searchOffer(booking, criteria, now, refined ? "refined" : undefined, keepOf(base, lang));
}

/**
 * One booking turn: the offer to show, or undefined when the message is not about booking and the
 * grounded answer should take it. `state` is what the page carried from the last booking turn.
 */
export async function bookingTurn(
	offered: BookingScope,
	input: { question: string; typed?: string; state?: BookingState; locale?: string },
	packs: ReadonlyArray<LanguagePack>,
	now: number = Date.now(),
): Promise<BookingOffer | undefined> {
	const { question, state } = input;
	// What the visitor typed, before the screening hid any phone or e-mail in it: read only for the
	// details of a booking that has a time chosen.
	const typed = input.typed ?? question;
	const booking = await live(offered);
	const lang = langOf(typed, state, input.locale, packs);
	// The answer to what was just asked comes first, before any other reading of the message.
	if (state?.stage === "details") {
		const answered = await answerFirst(booking, state, typed, lang, now);
		if (answered !== undefined) return answered;
	}
	const codes = findCodes(question);
	const both = codes.reference !== undefined && codes.cancelCode !== undefined;
	const awaiting =
		state?.stage === "cancel" && (codes.reference !== undefined || codes.cancelCode !== undefined);
	if (isCancelIntent(question) || both || awaiting) return cancelTurn(booking, question, state);
	const services = booking.scope.services;
	if (isBookingIntent(question, packs)) {
		const wish = readWish(question, localToday(now), services, false, booking.scope.names);
		return act(booking, undefined, wish, now, lang);
	}
	if (state === undefined || state.stage === "cancel") return undefined;
	const wish = readWish(question, localToday(now), services, true, booking.scope.names);
	if (meaningful(wish, state, question)) return act(booking, state, wish, now, lang);
	return state.stage === "details" ? detailsTurn(booking, state, typed, lang, now) : undefined;
}

/**
 * The language the visitor writes in: what their words show, else what an explicit yes shows,
 * else the one the booking already spoke, else the page's.
 */
function langOf(
	typed: string,
	state: BookingState | undefined,
	locale: string | undefined,
	packs: ReadonlyArray<LanguagePack>,
): BookingLang {
	const seen = createLanguageDetector(packs).detect(typed);
	if (seen === "ro" || seen === "en") return seen;
	const said = confirmation(typed)?.lang;
	if (said !== undefined) return said;
	return state?.lang ?? (locale === "en" ? "en" : "ro");
}

/** The chosen time shown again, with what was typed so far: the answer for a reply that denied the calendar. */
export async function reshow(
	offered: BookingScope,
	state: BookingState | undefined,
	question: string,
	locale?: string,
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
			talkOf(state, state.lang ?? (locale === "en" ? "en" : "ro")),
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
	return act(booking, undefined, wish, now, "ro");
}
