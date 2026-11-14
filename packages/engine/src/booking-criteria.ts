import type { Wish } from "./booking-parse";
import type { BookingCriteria, PartOfDay } from "./booking-state";
import { addLocalDays } from "./scheduling/local-time";
import type { ProposedSlot } from "./scheduling/tools";

/** The search a booking turn works on: building it, merging a wish into it, and matching times. */

/** How many days one offer looks over. */
export const OFFER_DAYS = 14;

export function fresh(service: string): BookingCriteria {
	return { service, days: OFFER_DAYS, partOfDay: "any" };
}

/** The criteria after the wish: only what the message named changes. */
export function merge(
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

export function unique(slots: ReadonlyArray<ProposedSlot>): ReadonlyArray<ProposedSlot> {
	const seen = new Set<string>();
	return slots.filter((slot) => !seen.has(slot.slotId) && seen.add(slot.slotId) !== undefined);
}

export function restricted(criteria: BookingCriteria): boolean {
	return (
		criteria.fromDate !== undefined ||
		criteria.weekday !== undefined ||
		criteria.partOfDay !== "any" ||
		criteria.mode !== undefined
	);
}

export function minutesOf(slot: ProposedSlot): number {
	return Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3));
}

export function partOf(minutes: number): PartOfDay {
	if (minutes < 720) return "morning";
	return minutes < 1020 ? "afternoon" : "evening";
}

export function matchesWish(slot: ProposedSlot, wish: Wish): boolean {
	return (
		(wish.minutes === undefined || minutesOf(slot) === wish.minutes) &&
		(wish.weekday === undefined || slot.weekday === wish.weekday) &&
		(wish.fromDate === undefined || wish.days !== 1 || slot.date === wish.fromDate)
	);
}
