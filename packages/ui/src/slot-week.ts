/**
 * The calendar arithmetic behind the slot picker, all in the practice's own time zone and on plain
 * `YYYY-MM-DD` dates (a date carries no zone, so adding days never meets daylight saving).
 */

export type SlotMode = "onsite" | "online";

/** One bookable time as the store offers it: the id names it, the picker never trusts anything else. */
export interface PickerSlot {
	id: string;
	/** UTC ms of the start. */
	start: number;
	practitioner: string;
	practitionerName: string;
	mode: SlotMode;
}

export type PartOfDay = "morning" | "afternoon" | "evening";
export const PARTS_OF_DAY: ReadonlyArray<PartOfDay> = ["morning", "afternoon", "evening"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isLocalDate(value: string): boolean {
	if (!DATE.test(value)) return false;
	const time = Date.parse(`${value}T12:00:00Z`);
	return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** "2026-11-19" for the instant, on the wall clock of `timeZone`. */
export function localDate(instant: number, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
	return parts;
}

/** "09:30" for the instant, on the wall clock of `timeZone`. */
export function localTime(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(instant);
}

export function addDays(date: string, days: number): string {
	return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday of the week the date falls in. */
export function mondayOf(date: string): string {
	const day = new Date(`${date}T12:00:00Z`).getUTCDay();
	return addDays(date, -((day + 6) % 7));
}

/** Morning before 12:00, afternoon before 17:00, evening after. */
export function partOfDay(time: string): PartOfDay {
	const hour = Number.parseInt(time.slice(0, 2), 10);
	if (hour < 12) return "morning";
	return hour < 17 ? "afternoon" : "evening";
}

export interface DayCell {
	date: string;
	/** Distinct start times free on the day. */
	count: number;
	today: boolean;
	past: boolean;
}

/** Distinct start times only: two practitioners free at once are one button, the first one's. */
export function distinctTimes(slots: ReadonlyArray<PickerSlot>): ReadonlyArray<PickerSlot> {
	const seen = new Set<number>();
	return [...slots]
		.sort((a, b) => a.start - b.start)
		.filter((slot) => {
			if (seen.has(slot.start)) return false;
			seen.add(slot.start);
			return true;
		});
}

/** The seven days of the week starting `week` (a Monday), with how many times each has. */
export function weekCells(
	week: string,
	slots: ReadonlyArray<PickerSlot>,
	timeZone: string,
	today: string,
): ReadonlyArray<DayCell> {
	const perDay = new Map<string, Set<number>>();
	for (const slot of slots) {
		const date = localDate(slot.start, timeZone);
		const set = perDay.get(date) ?? new Set<number>();
		set.add(slot.start);
		perDay.set(date, set);
	}
	return Array.from({ length: 7 }, (_, i) => {
		const date = addDays(week, i);
		return {
			date,
			count: date < today ? 0 : (perDay.get(date)?.size ?? 0),
			today: date === today,
			past: date < today,
		};
	});
}

/** The first day of the week that has times, or undefined. */
export function firstDayWithTimes(cells: ReadonlyArray<DayCell>): string | undefined {
	return cells.find((cell) => cell.count > 0)?.date;
}

/** A day's times by part of the day, in order; empty parts are left out. */
export function groupByPart(
	slots: ReadonlyArray<PickerSlot>,
	timeZone: string,
): ReadonlyArray<{ part: PartOfDay; slots: ReadonlyArray<PickerSlot & { time: string }> }> {
	const timed = distinctTimes(slots).map((slot) => ({
		...slot,
		time: localTime(slot.start, timeZone),
	}));
	return PARTS_OF_DAY.map((part) => ({
		part,
		slots: timed.filter((slot) => partOfDay(slot.time) === part),
	})).filter((group) => group.slots.length > 0);
}
