import { fresh, restricted, unique } from "./booking-criteria";
import { missingDetails } from "./booking-fields";
import type { PartOfDay } from "./booking-state";
import {
	type BookedRequest,
	type BookingCancel,
	type BookingCriteria,
	type BookingDetails,
	type BookingDetailsReport,
	type BookingKind,
	type BookingLang,
	type BookingNotice,
	type BookingState,
	type DetailField,
	type DetailsProblem,
	MAX_SHOWN,
} from "./booking-state";
import type { ProfileScheduling, SchedulingPort } from "./scheduling/port";
import {
	type FindAvailabilityOutput,
	type ProposedSlot,
	runFindAvailability,
	runRequestAppointment,
} from "./scheduling/tools";

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
	/** `confirm`, `summary`: the time that was named and found free. */
	chosen?: ProposedSlot;
	/** `confirm`, `summary`, and `times` after a lost time: the details so far, and what is asked next. */
	details?: BookingDetailsReport;
	/** `booked`: the request the guide submitted. */
	booked?: BookedRequest;
	/** `cancel_result`: how the cancellation went. */
	cancel?: BookingCancel;
	/** `services`: what can be booked here. */
	services?: ReadonlyArray<string>;
	/** `services`: the names of those services in both languages, when the store has them. */
	names?: Readonly<Record<string, { ro: string; en: string }>>;
	/** `summary`: the service's name in both languages, when the store has one. */
	serviceName?: { ro: string; en: string };
	/** `services`: the visitor must choose one before times can be shown. */
	choose?: boolean;
	/** The language the booking is spoken in, when the visitor's own words told it. */
	lang?: BookingLang;
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
 * them, so the app's form (its picker and its call-back switch) holds to them too. The details the booking asks for
 * (the name, age, what is going on, phone and e-mail, then the visitor's yes) are not part of them: no setting skips one.
 */
export interface BookingLimits {
	horizonDays: number;
	offerCallback: boolean;
}

const DAY_MS = 86_400_000;

/** True when a time lies past the organisation's horizon, on a site its settings govern. */
export function pastHorizon(booking: BookingScope, startsAt: string, now: number): boolean {
	const horizon = booking.limits?.horizonDays;
	return horizon !== undefined && Date.parse(startsAt) > now + horizon * DAY_MS;
}

/** What the details dialogue carries from one turn to the next, and what the last message told. */
export interface Talk {
	values: BookingDetails;
	heard: BookingDetailsReport["heard"];
	problem?: DetailsProblem;
	nudge: boolean;
	/** The field asked when the message told nothing: it is asked again, not the first missing. */
	asked?: DetailField;
	/** Show the compact form, prefilled, instead of asking. */
	edit: boolean;
	key?: string;
	lang?: BookingLang;
}

export const NO_TALK: Talk = { values: {}, heard: [], nudge: false, edit: false };

/** How many free times one offer shows, and over how many days. */
export const OFFER_SLOTS = 6;

export function localToday(now: number): string {
	return new Date(now).toISOString().slice(0, 10);
}

/** True when the store can hold and submit, so the guide can book what it summarised. */
export function canBook(port: SchedulingPort): boolean {
	return port.hold !== undefined && port.submit !== undefined;
}

export function stateOf(
	stage: BookingState["stage"],
	criteria: BookingCriteria,
	slots: ReadonlyArray<ProposedSlot>,
	extra: {
		chosen?: ProposedSlot;
		details?: BookingDetails;
		asked?: BookingState["asked"];
		key?: string;
		lang?: BookingLang;
	} = {},
): BookingState {
	const { chosen, details, asked, key, lang } = extra;
	return {
		stage,
		criteria,
		shown: unique(slots).slice(0, MAX_SHOWN),
		...(chosen === undefined ? {} : { chosen }),
		...(details === undefined || Object.keys(details).length === 0 ? {} : { details }),
		...(asked === undefined ? {} : { asked }),
		...(key === undefined ? {} : { key }),
		...(lang === undefined ? {} : { lang }),
	};
}

function reportOf(talk: Talk): BookingDetailsReport {
	const missing = missingDetails(talk.values);
	const again = talk.nudge && talk.asked !== undefined && missing.includes(talk.asked);
	const ask = talk.problem?.field ?? (again ? talk.asked : missing[0]);
	return {
		values: talk.values,
		missing,
		heard: talk.heard,
		...(ask === undefined ? {} : { ask }),
		...(talk.problem === undefined ? {} : { problem: talk.problem }),
		nudge: talk.nudge,
		edit: talk.edit,
	};
}

/**
 * The step after a time was chosen: one question, or, with everything in and valid, the summary
 * to confirm. A store that cannot hold and submit never shows the summary: the form finishes it.
 */
export function detailsOffer(
	booking: BookingScope,
	criteria: BookingCriteria,
	slot: ProposedSlot,
	shown: ReadonlyArray<ProposedSlot>,
	talk: Talk = NO_TALK,
): BookingOffer {
	const details = reportOf(talk);
	const complete = details.missing.length === 0 && talk.problem === undefined;
	const summary = complete && !talk.edit && canBook(booking.port);
	const form = talk.edit || (complete && !summary);
	const asked = summary ? "confirm" : form ? undefined : details.ask;
	const key = talk.key ?? globalThis.crypto.randomUUID();
	return {
		kind: summary ? "summary" : "confirm",
		service: criteria.service,
		status: "ok",
		slots: [slot],
		chosen: slot,
		...(booking.scope.names?.[criteria.service] === undefined
			? {}
			: { serviceName: booking.scope.names[criteria.service] }),
		details: { ...details, edit: form },
		...(talk.lang === undefined ? {} : { lang: talk.lang }),
		state: stateOf("details", criteria, shown.length === 0 ? [slot] : shown, {
			chosen: slot,
			details: talk.values,
			...(asked === undefined ? {} : { asked }),
			key,
			...(talk.lang === undefined ? {} : { lang: talk.lang }),
		}),
	};
}

/** Details and identity that outlive a search: what a lost time must not lose. */
export interface Keep {
	details?: BookingDetails;
	key?: string;
	lang?: BookingLang;
}

export function timesOffer(
	criteria: BookingCriteria,
	found: Pick<FindAvailabilityOutput, "status" | "timeZone" | "slots">,
	notice: BookingNotice | undefined,
	keep: Keep = {},
): BookingOffer {
	const status = found.status === "unknown_service" ? "unavailable" : found.status;
	const kept = keep.details !== undefined && Object.keys(keep.details).length > 0;
	return {
		kind: "times",
		service: criteria.service,
		status,
		...(found.timeZone === undefined ? {} : { timeZone: found.timeZone }),
		slots: found.slots,
		...(notice === undefined ? {} : { notice }),
		...(kept && keep.details !== undefined
			? { details: reportOf({ ...NO_TALK, values: keep.details }) }
			: {}),
		...(keep.lang === undefined ? {} : { lang: keep.lang }),
		state: stateOf("times", criteria, found.slots, {
			...(keep.details === undefined ? {} : { details: keep.details }),
			...(keep.key === undefined ? {} : { key: keep.key }),
			...(keep.lang === undefined ? {} : { lang: keep.lang }),
		}),
	};
}

/** The free times asked for, none later than the organisation's horizon on a site its settings govern. */
export async function look(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	limit: number = OFFER_SLOTS,
	partOfDay: PartOfDay = criteria.partOfDay,
): Promise<FindAvailabilityOutput> {
	const found = await lookAll(booking, criteria, now, limit, partOfDay);
	if (booking.limits === undefined || found.status !== "ok") return found;
	const slots = found.slots.filter((slot) => !pastHorizon(booking, slot.startsAt, now));
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

/** A search; when nothing matches a restricted one, the nearest free times instead (`relaxed`). */
export async function searchOffer(
	booking: BookingScope,
	criteria: BookingCriteria,
	now: number,
	notice: BookingNotice | undefined,
	keep: Keep = {},
): Promise<BookingOffer> {
	const found = await look(booking, criteria, now);
	if (found.status === "none" && restricted(criteria)) {
		const wide = fresh(criteria.service);
		const nearest = await look(booking, wide, now);
		if (nearest.status === "ok") {
			return timesOffer(wide, nearest, notice === "taken" ? "taken" : "relaxed", keep);
		}
	}
	return timesOffer(criteria, found, found.status === "ok" ? notice : undefined, keep);
}

/** Checks the named time is still free and moves to the details step with it. */
export async function confirmOffer(
	booking: BookingScope,
	criteria: BookingCriteria,
	slot: ProposedSlot,
	shown: ReadonlyArray<ProposedSlot>,
	now: number,
	talk: Talk = NO_TALK,
): Promise<BookingOffer> {
	// A time past the organisation's horizon (carried in an older state) is not taken further.
	if (pastHorizon(booking, slot.startsAt, now)) {
		return searchOffer(booking, criteria, now, "not_free", {
			details: talk.values,
			...(talk.key === undefined ? {} : { key: talk.key }),
			...(talk.lang === undefined ? {} : { lang: talk.lang }),
		});
	}
	const checked = await runRequestAppointment(booking.port, booking.scope, {
		service: criteria.service,
		slotId: slot.slotId,
		startsAt: slot.startsAt,
	});
	if (checked.status === "needs_confirmation") {
		return detailsOffer(booking, criteria, checked.proposal, shown, talk);
	}
	const keep: Keep = {
		details: talk.values,
		...(talk.key === undefined ? {} : { key: talk.key }),
		...(talk.lang === undefined ? {} : { lang: talk.lang }),
	};
	if (checked.status === "no_longer_free")
		return searchOffer(booking, criteria, now, "taken", keep);
	return timesOffer(criteria, { status: "unavailable", slots: [] }, undefined, keep);
}
