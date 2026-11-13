import type { LocalDate } from "../../domain/time";
import { dayAvailability, type RosterEntry } from "../roster";
import { datesOf, instantAt, overlapMinutes } from "./buckets";
import type { Range, ReportAppointment, ReportBlock, ReportRosterDay } from "./types";

/**
 * Utilisation: booked minutes against available minutes, per practitioner, room and device.
 *
 * Available time comes from the roster. A practitioner's own working windows (leave, free days
 * and blocks take them away). A room or a device has no roster of its own: it is available while
 * the clinic is open, which is the UNION of the working windows of every practitioner on the
 * roster that day (reception and volunteers do not open a room). Booked time is the real elapsed time of confirmed entries (a no-show still held the
 * slot), clipped to the range. Time booked outside the available windows is reported apart, never
 * hidden by clamping, so the rate can exceed 100% only through `outsideMinutes`, not through
 * the rate (the rate counts booked time inside the windows).
 */
export interface Utilisation {
	id: string;
	availableMinutes: number;
	/** Booked time inside the available windows. */
	bookedMinutes: number;
	/** Booked time outside them (a visit on a day off, before opening, after closing). */
	outsideMinutes: number;
	/** bookedMinutes / availableMinutes, or null when nothing was available. */
	rate: number | null;
}

export interface UtilisationReport {
	practitioners: ReadonlyArray<Utilisation>;
	rooms: ReadonlyArray<Utilisation>;
	devices: ReadonlyArray<Utilisation>;
}

type Window = { from: number; to: number };

function union(windows: ReadonlyArray<Window>): Window[] {
	const sorted = [...windows].sort((a, b) => a.from - b.from);
	const out: Window[] = [];
	for (const w of sorted) {
		const last = out[out.length - 1];
		if (last !== undefined && w.from <= last.to) last.to = Math.max(last.to, w.to);
		else out.push({ ...w });
	}
	return out;
}

const minutesOf = (windows: ReadonlyArray<Window>): number =>
	windows.reduce((sum, w) => sum + (w.to - w.from) / 60_000, 0);

function booked(
	spans: ReadonlyArray<Window>,
	windows: ReadonlyArray<Window>,
	range: Range,
): { inside: number; outside: number } {
	let inside = 0;
	let outside = 0;
	for (const s of spans) {
		const total = overlapMinutes(s.from, s.to, range.from, range.to);
		let within = 0;
		for (const w of windows)
			within += overlapMinutes(
				s.from,
				s.to,
				Math.max(w.from, range.from),
				Math.min(w.to, range.to),
			);
		inside += within;
		outside += Math.max(0, total - within);
	}
	return { inside, outside };
}

function build(
	id: string,
	windows: ReadonlyArray<Window>,
	spans: ReadonlyArray<Window>,
	range: Range,
): Utilisation {
	const merged = union(
		windows
			.map((w) => ({ from: Math.max(w.from, range.from), to: Math.min(w.to, range.to) }))
			.filter((w) => w.to > w.from),
	);
	const available = minutesOf(merged);
	const { inside, outside } = booked(spans, merged, range);
	return {
		id,
		availableMinutes: available,
		bookedMinutes: inside,
		outsideMinutes: outside,
		rate: available === 0 ? null : inside / available,
	};
}

export function utilisationReport(
	entries: ReadonlyArray<ReportAppointment>,
	roster: ReadonlyArray<ReportRosterDay>,
	blocks: ReadonlyArray<ReportBlock>,
	range: Range,
): UtilisationReport {
	const key = (p: { kind: string; id: string }): string => `${p.kind}:${p.id}`;
	const byPerson = new Map<string, Map<LocalDate, RosterEntry>>();
	for (const d of roster) {
		const m = byPerson.get(key(d.person)) ?? new Map<LocalDate, RosterEntry>();
		m.set(d.date, d.entry);
		byPerson.set(key(d.person), m);
	}
	const blocksOf = new Map<string, Array<{ dateStart: string; dateEnd: string; reason: string }>>();
	for (const b of blocks) {
		blocksOf.set(key(b.person), [
			...(blocksOf.get(key(b.person)) ?? []),
			{ dateStart: b.dateStart, dateEnd: b.dateEnd, reason: "" },
		]);
	}
	const dates = datesOf(range);
	const personWindows = new Map<string, Window[]>();
	const clinic: Window[] = [];
	for (const [person, days] of byPerson) {
		const list: Window[] = [];
		for (const date of dates) {
			const day = dayAvailability(days.get(date), blocksOf.get(person) ?? [], date);
			if (day.kind !== "works") continue;
			const w = {
				from: instantAt(date, day.startMinutes, range.zone),
				to: instantAt(date, day.endMinutes, range.zone),
			};
			if (w.to > w.from) list.push(w);
		}
		personWindows.set(person, list);
		if (person.startsWith("practitioner:")) clinic.push(...list);
	}
	const live = entries.filter(
		(e) => e.status === "confirmed" && e.end > range.from && e.start < range.to,
	);
	const spansBy = (pick: (e: ReportAppointment) => string | undefined): Map<string, Window[]> => {
		const m = new Map<string, Window[]>();
		for (const e of live) {
			const id = pick(e);
			if (id !== undefined) m.set(id, [...(m.get(id) ?? []), { from: e.start, to: e.end }]);
		}
		return m;
	};
	const ofPractitioner = spansBy((e) => e.practitioner);
	const ofRoom = spansBy((e) => e.room);
	const ofDevice = spansBy((e) => e.device);
	const practitionerIds = new Set([
		...ofPractitioner.keys(),
		...[...personWindows.keys()]
			.filter((k) => k.startsWith("practitioner:"))
			.map((k) => k.slice("practitioner:".length)),
	]);
	const sortById = (list: Utilisation[]): Utilisation[] =>
		list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return {
		practitioners: sortById(
			[...practitionerIds].map((id) =>
				build(
					id,
					personWindows.get(`practitioner:${id}`) ?? [],
					ofPractitioner.get(id) ?? [],
					range,
				),
			),
		),
		rooms: sortById([...ofRoom].map(([id, spans]) => build(id, clinic, spans, range))),
		devices: sortById([...ofDevice].map(([id, spans]) => build(id, clinic, spans, range))),
	};
}
