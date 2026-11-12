import type { Busy, DayException, Mode, ServiceSpec, WeeklyRule } from "./catalog";
import { overlaps } from "./conflicts";
import {
	addDays,
	DAY_MINUTES,
	type LocalDate,
	MINUTE_MS,
	resolveLocal,
	toLocal,
	weekdayOf,
} from "./time";

/** The most days one slot search walks; longer ranges are cut here. */
export const MAX_SEARCH_DAYS = 190;

/** Everything slot generation reads: one practitioner's calendar for one service. */
export interface SlotQuery {
	timeZone: string;
	service: ServiceSpec;
	rules: ReadonlyArray<WeeklyRule>;
	exceptions: ReadonlyArray<DayException>;
	/** What is already taken, buffers included. */
	busy: ReadonlyArray<Busy>;
	/** Earliest start (inclusive), UTC ms. */
	from: number;
	/** Latest start (exclusive), UTC ms. */
	to: number;
	now: number;
	/** Only slots that offer this mode. */
	mode?: Mode;
}

/** A start that can be booked: [start, end), and the modes it can be held in. */
export interface Slot {
	start: number;
	end: number;
	modes: ReadonlyArray<Mode>;
}

interface Window {
	start: number;
	end: number;
	modes: ReadonlyArray<Mode>;
}

function appliesOn(rule: WeeklyRule, date: LocalDate, weekday: number): boolean {
	if (rule.weekday !== weekday) return false;
	if (rule.validFrom !== undefined && date < rule.validFrom) return false;
	if (rule.validUntil !== undefined && date > rule.validUntil) return false;
	return true;
}

function subtract(window: Window, cutStart: number, cutEnd: number): ReadonlyArray<Window> {
	if (cutEnd <= window.start || cutStart >= window.end) return [window];
	const parts: Window[] = [];
	if (cutStart > window.start) parts.push({ ...window, end: cutStart });
	if (cutEnd < window.end) parts.push({ ...window, start: cutEnd });
	return parts;
}

/** The opening windows of one local date: the weekly rules, then the day's exceptions. */
export function windowsOn(
	date: LocalDate,
	rules: ReadonlyArray<WeeklyRule>,
	exceptions: ReadonlyArray<DayException>,
	allModes: ReadonlyArray<Mode>,
): ReadonlyArray<Window> {
	const weekday = weekdayOf(date);
	const today = exceptions.filter((e) => e.date === date);
	if (today.some((e) => e.kind === "closed" && e.start === undefined)) return [];
	let windows: ReadonlyArray<Window> = [
		...rules
			.filter((rule) => appliesOn(rule, date, weekday))
			.map((rule) => ({ start: rule.start, end: rule.end, modes: rule.modes })),
		...today.flatMap((e) =>
			e.kind === "open" && e.start !== undefined && e.end !== undefined
				? [{ start: e.start, end: e.end, modes: e.modes ?? allModes }]
				: [],
		),
	];
	for (const cut of today) {
		if (cut.kind !== "closed" || cut.start === undefined || cut.end === undefined) continue;
		const { start, end } = cut;
		windows = windows.flatMap((w) => subtract(w, start, end));
	}
	return windows;
}

/** The instant a window boundary names; a boundary in a gap moves to the first minute after it. */
function boundary(date: LocalDate, minutes: number, timeZone: string): number {
	const day = minutes >= DAY_MINUTES ? addDays(date, 1) : date;
	let at = minutes >= DAY_MINUTES ? minutes - DAY_MINUTES : minutes;
	for (; at < DAY_MINUTES; at += 1) {
		const resolved = resolveLocal(day, at, timeZone);
		if (resolved.kind === "exact") return resolved.instant;
		if (resolved.kind === "ambiguous") return resolved.earlier;
	}
	throw new RangeError(`no boundary on ${day}`);
}

/** The instant a slot starts at, or undefined when that wall time does not exist that day. */
function slotStart(date: LocalDate, minutes: number, timeZone: string): number | undefined {
	const resolved = resolveLocal(date, minutes, timeZone);
	if (resolved.kind === "gap") return undefined;
	// A repeated hour is offered once, at its first occurrence.
	return resolved.kind === "exact" ? resolved.instant : resolved.earlier;
}

function modesFor(window: Window, query: SlotQuery): ReadonlyArray<Mode> {
	const offered = window.modes.filter((mode) => query.service.modes.includes(mode));
	return query.mode === undefined ? offered : offered.filter((mode) => mode === query.mode);
}

/**
 * The bookable slots of one practitioner for one service, in start order. Windows are wall time
 * in `timeZone`, so a 09:00 opening stays 09:00 across a daylight-saving change; durations are
 * real elapsed time, so a session never ends past its window. A wall time the clocks skip is never
 * offered, and one they repeat is offered once. A slot is dropped when it starts before the notice
 * period, beyond the horizon, outside [from, to), or when it (with the service's buffer) overlaps
 * anything busy.
 */
export function generateSlots(query: SlotQuery): ReadonlyArray<Slot> {
	const { service, timeZone } = query;
	const earliest = Math.max(query.from, query.now + service.minNoticeMinutes * MINUTE_MS);
	const latest = Math.min(query.to, query.now + service.horizonDays * DAY_MINUTES * MINUTE_MS);
	if (earliest >= latest) return [];
	const durationMs = service.durationMinutes * MINUTE_MS;
	const blockMs = (service.durationMinutes + service.bufferMinutes) * MINUTE_MS;
	const found = new Map<number, Slot>();
	const lastDate = toLocal(latest, timeZone).date;
	let date = toLocal(earliest, timeZone).date;
	for (let day = 0; day < MAX_SEARCH_DAYS && date <= lastDate; day += 1, date = addDays(date, 1)) {
		for (const window of windowsOn(date, query.rules, query.exceptions, service.modes)) {
			const modes = modesFor(window, query);
			if (modes.length === 0) continue;
			const windowEnd = boundary(date, window.end, timeZone);
			for (let at = window.start; at + service.durationMinutes <= window.end; ) {
				const start = slotStart(date, at, timeZone);
				at += service.stepMinutes;
				if (start === undefined || start < earliest || start >= latest) continue;
				if (start + durationMs > windowEnd) continue;
				const taken = { start, until: start + blockMs };
				if (query.busy.some((busy) => overlaps(taken, busy))) continue;
				const seen = found.get(start);
				const merged = seen === undefined ? modes : [...new Set([...seen.modes, ...modes])];
				found.set(start, { start, end: start + durationMs, modes: merged });
			}
		}
	}
	return [...found.values()].sort((a, b) => a.start - b.start);
}

/** True when `start` is one of the slots `query` offers in `mode`: what a hold must re-check. */
export function isOffered(
	query: Omit<SlotQuery, "from" | "to">,
	start: number,
	mode: Mode,
): boolean {
	const slots = generateSlots({ ...query, mode, from: start, to: start + 1 });
	return slots.some((slot) => slot.start === start && slot.modes.includes(mode));
}
