import type { DayException, OneOffEntry, WeeklyRule } from "@psi/scheduling/domain";

/** A one-off day as the store keeps it: one row per date. */
export interface StoredException extends DayException {
	id: string;
}

/** A practitioner's availability: the weekly rules and the one-off days from a date on. */
export interface StoredAvailability {
	rules: WeeklyRule[];
	exceptions: StoredException[];
	abAnchor?: string | undefined;
}

/** A room's closed time, one row per date. */
export interface StoredClosure {
	id: string;
	date: string;
	start?: number | undefined;
	end?: number | undefined;
}

/**
 * The availability editor's store. Person ids are the team API's (`people`); only a practitioner (a person with a
 * calendar the public site books) has availability. Every write checks everything before its first write, so a refusal
 * writes nothing, and a change to several practitioners lands for all of them or none:
 * - `StoreRefused("not_found")`: a person who is not a practitioner of the app, or a row that is not theirs;
 * - `StoreRefused("invalid")`: a set of rules or an entry with a problem (`weeklyPlanProblems`, `oneOffProblems`).
 */
export interface AvailabilityPort {
	/** Undefined for a person who is not a practitioner of the app. */
	get(app: string, personId: string, fromDate: string): Promise<StoredAvailability | undefined>;
	/** Replaces each named practitioner's weekly rules with its set. */
	replaceRules(
		app: string,
		sets: ReadonlyArray<{ personId: string; rules: ReadonlyArray<WeeklyRule> }>,
	): Promise<void>;
	/** Adds the entry (one row per date) to each named practitioner, in `timeZone`; returns the rows added to each. */
	addOneOff(
		app: string,
		personIds: ReadonlyArray<string>,
		entry: OneOffEntry,
		timeZone: string,
	): Promise<number>;
	/** False when the row is not there, or not the person's. */
	removeOneOff(app: string, personId: string, id: string): Promise<boolean>;
	/** Undefined for a room that is not the app's. */
	closures(app: string, roomId: string, fromDate: string): Promise<StoredClosure[] | undefined>;
	/** Closes the room on each date of [from, until], all day or [start, end); the same closure again adds nothing. */
	addClosure(
		app: string,
		roomId: string,
		closure: { from: string; until: string; start?: number | undefined; end?: number | undefined },
	): Promise<void>;
	removeClosure(app: string, roomId: string, id: string): Promise<boolean>;
}
