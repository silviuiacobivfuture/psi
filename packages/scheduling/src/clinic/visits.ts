import type { Busy } from "../domain/catalog";
import { type AppointmentStatus, isBlocking } from "../domain/conflicts";
import { MINUTE_MS, parseClock, resolveLocal } from "../domain/time";

/**
 * A staff-made appointment ("visit"): on one COLUMN of the calendar. The four kinds of column
 * are distinct things: a practitioner takes sessions; a device (NFB 1/2) and a room (Cabinet Grup)
 * are resources; a group activity (RaceMeUp, OPTIMOKID) is its own series. Only practitioners are
 * ever offered by the public picker.
 */
export const COLUMN_KINDS = ["practitioner", "device", "room", "group"] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

export interface Column {
	kind: ColumnKind;
	id: string;
}

export function columnKey(c: Column): string {
	return `${c.kind}:${c.id}`;
}

export const ATTENDANCE = ["pending", "attended", "absent"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export const CREDIT_TYPES = ["base", "bonus"] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

/** What a visit occupies, for conflicts. */
export interface VisitSpan {
	id: string;
	column: Column;
	/** An extra room or device the visit uses besides its column. */
	room?: string;
	device?: string;
	start: number;
	end: number;
	status: AppointmentStatus;
}

export type Exclusive = "practitioner" | "device" | "room";

export interface Overlap {
	a: string;
	b: string;
	resource: Exclusive;
	resourceId: string;
}

/**
 * The things a visit holds exclusively: its practitioner, its device, its room. A group column
 * is not exclusive (many clients attend one activity) but its room and device still are.
 */
export function exclusives(v: VisitSpan): ReadonlyArray<{ resource: Exclusive; id: string }> {
	const held = new Map<string, { resource: Exclusive; id: string }>();
	const add = (resource: Exclusive, id: string): void => {
		held.set(`${resource}:${id}`, { resource, id });
	};
	if (v.column.kind === "practitioner") add("practitioner", v.column.id);
	if (v.column.kind === "device") add("device", v.column.id);
	if (v.column.kind === "room") add("room", v.column.id);
	if (v.device !== undefined) add("device", v.device);
	if (v.room !== undefined) add("room", v.room);
	return [...held.values()];
}

/** Every pair of live visits that need the same practitioner, device or room at the same time. */
export function findOverlaps(
	visits: ReadonlyArray<VisitSpan>,
	now: number,
): ReadonlyArray<Overlap> {
	const byResource = new Map<string, VisitSpan[]>();
	for (const v of visits) {
		if (!isBlocking({ status: v.status, start: v.start, blockedUntil: v.end }, now)) continue;
		for (const held of exclusives(v)) {
			const key = `${held.resource}:${held.id}`;
			byResource.set(key, [...(byResource.get(key) ?? []), v]);
		}
	}
	const found: Overlap[] = [];
	for (const [key, list] of byResource) {
		const sorted = [...list].sort((x, y) => x.start - y.start || x.end - y.end);
		const [resource, ...rest] = key.split(":");
		const resourceId = rest.join(":");
		for (let i = 0; i < sorted.length; i += 1) {
			const first = sorted[i];
			if (first === undefined) continue;
			for (let j = i + 1; j < sorted.length; j += 1) {
				const second = sorted[j];
				if (second === undefined || second.start >= first.end) break;
				const [a, b] = first.id < second.id ? [first.id, second.id] : [second.id, first.id];
				if (resource === "practitioner" || resource === "device" || resource === "room") {
					found.push({ a, b, resource, resourceId });
				}
			}
		}
	}
	return found.sort(
		(x, y) =>
			x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.resource.localeCompare(y.resource),
	);
}

/**
 * The busy spans of a practitioner's live visits: the public booking flow subtracts these from
 * the practitioner's slots, so a staff-made visit and a web booking can never take the same time.
 */
export function busyOfVisits(
	visits: ReadonlyArray<VisitSpan>,
	practitionerId: string,
	now: number,
): ReadonlyArray<Busy> {
	return visits
		.filter((v) => v.column.kind === "practitioner" && v.column.id === practitionerId)
		.filter((v) => isBlocking({ status: v.status, start: v.start, blockedUntil: v.end }, now))
		.map((v) => ({ start: v.start, until: v.end }));
}

export type WallTimeProblem = "bad_date" | "bad_time" | "nonexistent";

/**
 * The instant a wall date and `HH:MM` name in the zone, stored as an instant like the rest of the
 * code. A repeated wall time (the October change: 03:00 to 03:59 happens twice) takes the earlier
 * instant; a skipped one (March) does not exist and is reported, never guessed.
 */
export function wallToInstant(
	date: string,
	clock: string,
	timeZone: string,
): { ok: true; instant: number } | { ok: false; problem: WallTimeProblem } {
	let minutes: number;
	try {
		minutes = parseClock(clock);
	} catch {
		return { ok: false, problem: "bad_time" };
	}
	if (minutes >= 1440) return { ok: false, problem: "bad_time" };
	try {
		const resolved = resolveLocal(date, minutes, timeZone);
		if (resolved.kind === "gap") return { ok: false, problem: "nonexistent" };
		return { ok: true, instant: resolved.kind === "exact" ? resolved.instant : resolved.earlier };
	} catch {
		return { ok: false, problem: "bad_date" };
	}
}

export type VisitProblem =
	| "end_not_after_start"
	| "duration_mismatch"
	| "client_required"
	| "negative_money"
	| "credit_without_package"
	| "bonus_in_group";

export interface VisitCheck {
	column: Column;
	client?: string;
	start: number;
	end: number;
	durationMinutes: number;
	priceMinor?: number;
	amountPaidMinor?: number;
	package?: string;
	creditType?: CreditType;
}

/**
 * What makes a visit unsound. A client is optional only for a group activity or a block; a
 * practitioner, device or room column needs one. Durations agree with the instants.
 */
export function visitProblems(v: VisitCheck): ReadonlyArray<VisitProblem> {
	const problems: VisitProblem[] = [];
	if (v.end <= v.start) problems.push("end_not_after_start");
	else if (Math.round((v.end - v.start) / MINUTE_MS) !== v.durationMinutes) {
		problems.push("duration_mismatch");
	}
	if (v.client === undefined && v.column.kind !== "group") problems.push("client_required");
	if ((v.priceMinor ?? 0) < 0 || (v.amountPaidMinor ?? 0) < 0) problems.push("negative_money");
	if (v.creditType !== undefined && v.package === undefined)
		problems.push("credit_without_package");
	return problems;
}
