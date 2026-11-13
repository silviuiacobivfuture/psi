import type { Appointment, Column } from "../port/schema";

/** What is being placed: a time on a day, and every column it keeps busy (the column and any room or device). */
export interface Probe {
	date: string;
	startMin: number;
	durationMin: number;
	columnIds: ReadonlyArray<string>;
	/** The appointment being edited or moved: it never conflicts with itself. */
	ignoreId?: string;
	/** A series being edited: its other members are not conflicts either. */
	ignoreSeriesId?: string | null;
}

export interface Conflict {
	columnId: string;
	appointmentId: string;
	startMin: number;
	endMin: number;
}

/** A cancelled appointment frees its time; every other status keeps its columns busy. */
export function occupies(a: Appointment): boolean {
	return a.status !== "cancelled";
}

export function columnsOf(a: Pick<Appointment, "columnId" | "resourceIds">): string[] {
	return [a.columnId, ...a.resourceIds];
}

/** Two ranges overlap when each starts before the other ends: touching is not overlapping. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

export function findConflicts(all: ReadonlyArray<Appointment>, probe: Probe): Conflict[] {
	const end = probe.startMin + probe.durationMin;
	const out: Conflict[] = [];
	for (const a of all) {
		if (a.date !== probe.date || !occupies(a)) continue;
		if (a.id === probe.ignoreId) continue;
		if (probe.ignoreSeriesId != null && a.seriesId === probe.ignoreSeriesId) continue;
		if (!overlaps(probe.startMin, end, a.startMin, a.startMin + a.durationMin)) continue;
		const mine = new Set(probe.columnIds);
		for (const col of columnsOf(a))
			if (mine.has(col))
				out.push({
					columnId: col,
					appointmentId: a.id,
					startMin: a.startMin,
					endMin: a.startMin + a.durationMin,
				});
	}
	return out;
}

export interface Suggestions {
	/** The first later start, on the same quarter-hour grid, when everything asked for is free. */
	laterStart: number | null;
	/** Other columns of the same kind as the main one that are free at the asked time. */
	otherColumns: ReadonlyArray<Column>;
}

const DAY_FROM = 7 * 60;
const DAY_TO = 21 * 60;
const STEP = 15;

export function suggest(
	all: ReadonlyArray<Appointment>,
	columns: ReadonlyArray<Column>,
	probe: Probe,
): Suggestions {
	let laterStart: number | null = null;
	for (
		let s = Math.ceil(probe.startMin / STEP) * STEP + STEP;
		s + probe.durationMin <= DAY_TO;
		s += STEP
	) {
		if (s < DAY_FROM) continue;
		if (findConflicts(all, { ...probe, startMin: s }).length === 0) {
			laterStart = s;
			break;
		}
	}
	const main = columns.find((c) => c.id === probe.columnIds[0]);
	const extras = probe.columnIds.slice(1);
	const otherColumns =
		main === undefined
			? []
			: columns.filter(
					(c) =>
						c.kind === main.kind &&
						c.id !== main.id &&
						findConflicts(all, { ...probe, columnIds: [c.id, ...extras] }).length === 0,
				);
	return { laterStart, otherColumns };
}

/** The dates of a weekly series: the first one and every seventh day after, by count or until a day. */
export function seriesDates(
	first: string,
	rule: { count?: number | undefined; until?: string | undefined },
	addDays: (iso: string, n: number) => string,
): string[] {
	const dates = [first];
	for (let i = 1; i < 52; i++) {
		const next = addDays(first, 7 * i);
		if (rule.count !== undefined && dates.length >= rule.count) break;
		if (rule.until !== undefined && next > rule.until) break;
		if (rule.count === undefined && rule.until === undefined) break;
		dates.push(next);
	}
	return dates;
}
