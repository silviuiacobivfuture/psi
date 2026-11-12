import type { LocalDate } from "./time";

/** Where a session happens. */
export type Mode = "onsite" | "online";
export const MODES: ReadonlyArray<Mode> = ["onsite", "online"];

/** Who a session is for, as the booking form asks it; never why. */
export type Audience = "child" | "teen" | "adult";
export const AUDIENCES: ReadonlyArray<Audience> = ["child", "teen", "adult"];

/**
 * What can be booked: its length, the gap kept after it, the grid slots start on, how far ahead
 * and how soon it may be booked, and how long a hold lasts before it lapses.
 */
export interface ServiceSpec {
	durationMinutes: number;
	/** Kept free after the session (notes, room change); blocks the calendar like the session. */
	bufferMinutes: number;
	/** Slots start every `stepMinutes` from the window's start. */
	stepMinutes: number;
	/** No slot starts sooner than this after now. */
	minNoticeMinutes: number;
	/** No slot starts later than this many days after now. */
	horizonDays: number;
	/** How long a hold keeps a slot before it lapses. */
	holdMinutes: number;
	modes: ReadonlyArray<Mode>;
}

/** A weekly opening of one practitioner, in the tenant's wall time. */
export interface WeeklyRule {
	/** ISO weekday: Monday is 1, Sunday is 7. */
	weekday: number;
	/** Minutes after local midnight. */
	start: number;
	/** Minutes after local midnight; after `start`, at most 1440. */
	end: number;
	modes: ReadonlyArray<Mode>;
	/** First date the rule applies (inclusive). */
	validFrom?: LocalDate;
	/** Last date the rule applies (inclusive). */
	validUntil?: LocalDate;
}

/**
 * A one-day change to the weekly rules. `closed` without times closes the whole day; with times it
 * closes that part. `open` adds a window that day.
 */
export interface DayException {
	date: LocalDate;
	kind: "closed" | "open";
	start?: number;
	end?: number;
	/** For `open`: which modes the extra window offers (defaults to every mode). */
	modes?: ReadonlyArray<Mode>;
}

/** A span of the calendar already taken, buffer included: [start, until). */
export interface Busy {
	start: number;
	until: number;
}

/** Limits a service must stay within, whoever configures it. */
export const SERVICE_LIMITS = {
	durationMinutes: { min: 5, max: 480 },
	bufferMinutes: { min: 0, max: 240 },
	stepMinutes: { min: 5, max: 240 },
	minNoticeMinutes: { min: 0, max: 60 * 24 * 30 },
	horizonDays: { min: 1, max: 180 },
	holdMinutes: { min: 1, max: 60 },
} as const;

function within(value: number, range: { min: number; max: number }): boolean {
	return Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** The first problem with a service spec, or undefined when it is sound. */
export function serviceProblem(spec: ServiceSpec): string | undefined {
	const keys = [
		"durationMinutes",
		"bufferMinutes",
		"stepMinutes",
		"minNoticeMinutes",
		"horizonDays",
		"holdMinutes",
	] as const;
	for (const key of keys) {
		if (!within(spec[key], SERVICE_LIMITS[key])) return `${key} out of range`;
	}
	if (spec.modes.length === 0) return "a service needs a mode";
	return undefined;
}

/** The first problem with a weekly rule, or undefined when it is sound. */
export function ruleProblem(rule: WeeklyRule): string | undefined {
	if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) return "weekday";
	if (!Number.isInteger(rule.start) || !Number.isInteger(rule.end)) return "times";
	if (rule.start < 0 || rule.end > 1440 || rule.start >= rule.end) return "times";
	if (rule.modes.length === 0) return "a rule needs a mode";
	if (rule.validFrom !== undefined && rule.validUntil !== undefined) {
		if (rule.validFrom > rule.validUntil) return "validity";
	}
	return undefined;
}
