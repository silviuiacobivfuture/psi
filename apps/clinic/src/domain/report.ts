import { addDays, parseDay, range, weekStart } from "../lib/dates";
import type { Figures, ReportSlice, Snapshot } from "../port/report-schema";
import type {
	Appointment,
	Client,
	Column,
	Package,
	RosterEntry,
	Service,
	WebRequest,
} from "../port/schema";
import { packageUsage } from "./usage";

/** Everything a report is computed from: a store's rows, whole. */
export interface ReportInput {
	today: string;
	appointments: ReadonlyArray<Appointment>;
	clients: ReadonlyArray<Client>;
	services: ReadonlyArray<Service>;
	columns: ReadonlyArray<Column>;
	packages: ReadonlyArray<Package>;
	requests: ReadonlyArray<WebRequest>;
	roster: ReadonlyArray<RosterEntry>;
}

/** A default working day (9-17) on weekdays, for a person nobody put on the roster. */
const DEFAULT_DAY_MIN = 8 * 60;
const MAX_DAYS = 400;

const isVisit = (a: Appointment): boolean => a.status !== "leave" && a.status !== "medical-leave";
const weekday = (iso: string): number => (parseDay(iso).getUTCDay() + 6) % 7;
const inRange = (date: string, from: string, to: string): boolean => date >= from && date <= to;

/** Every day from `from` to `to`, both included (at most a bounded number: a report is not an archive). */
export function daysIn(from: string, to: string): string[] {
	const n = Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;
	return range(from, Math.max(1, Math.min(MAX_DAYS, n)));
}

function capacityMin(
	people: ReadonlyArray<Column>,
	roster: ReadonlyArray<RosterEntry>,
	from: string,
	to: string,
): number {
	let total = 0;
	for (const p of people) {
		// A rostered day counts as rostered (leave and free days are no capacity); any other weekday is a default working day.
		const byDate = new Map(roster.filter((r) => r.personId === p.id).map((r) => [r.date, r]));
		for (const d of daysIn(from, to)) {
			const r = byDate.get(d);
			if (r === undefined) total += weekday(d) < 5 ? DEFAULT_DAY_MIN : 0;
			else if (r.kind === "work") total += Math.max(0, (r.toMin ?? 0) - (r.fromMin ?? 0));
		}
	}
	return total;
}

function revenueOf(
	appointments: ReadonlyArray<Appointment>,
	packages: ReadonlyArray<Package>,
	from: string,
	to: string,
): number {
	const sessions = appointments
		.filter((a) => a.packageId === null && a.paidMethod !== null && inRange(a.date, from, to))
		.reduce((sum, a) => sum + a.priceBani, 0);
	const payments = packages
		.flatMap((p) => p.payments)
		.filter((p) => inRange(p.date, from, to))
		.reduce((sum, p) => sum + p.amountBani, 0);
	return sessions + payments;
}

function slice(id: string, name: string, rows: ReadonlyArray<Appointment>): ReportSlice {
	const live = rows.filter((a) => a.status !== "cancelled");
	return {
		id,
		name,
		appointments: live.length,
		attended: rows.filter((a) => a.status === "attended").length,
		cancelled: rows.filter((a) => a.status === "cancelled").length,
		noShow: rows.filter((a) => a.status === "no-show").length,
		bookedMin: live.reduce((s, a) => s + a.durationMin, 0),
		revenueBani: rows
			.filter((a) => a.packageId === null && a.paidMethod !== null)
			.reduce((s, a) => s + a.priceBani, 0),
	};
}

const byBusiest = (a: ReportSlice, b: ReportSlice): number =>
	b.appointments - a.appointments || a.name.localeCompare(b.name);

/** One period's figures, from the rows; `personId` narrows every figure to that person's column. */
export function figuresFor(
	input: ReportInput,
	from: string,
	to: string,
	personId?: string,
): Figures {
	const people = input.columns.filter((c) => c.kind === "person");
	const rooms = input.columns.filter((c) => c.kind === "room");
	const scoped = input.appointments.filter(
		(a) => isVisit(a) && (personId === undefined || a.columnId === personId),
	);
	const rows = scoped.filter((a) => inRange(a.date, from, to));
	const live = rows.filter((a) => a.status !== "cancelled");
	const first = new Map<string, string>();
	for (const a of input.appointments)
		if (a.clientId !== null && isVisit(a) && a.status !== "cancelled") {
			const had = first.get(a.clientId);
			if (had === undefined || a.date < had) first.set(a.clientId, a.date);
		}
	const clientsIn = new Set(live.flatMap((a) => (a.clientId === null ? [] : [a.clientId])));
	const requests = input.requests.filter((r) => inRange(r.receivedAt.slice(0, 10), from, to));
	const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
	for (const a of live) {
		const row = heat[weekday(a.date)];
		const hour = Math.min(23, Math.floor(a.startMin / 60));
		if (row !== undefined) row[hour] = (row[hour] ?? 0) + 1;
	}
	const days = daysIn(from, to);
	return {
		from,
		to,
		appointments: live.length,
		attended: rows.filter((a) => a.status === "attended").length,
		cancelled: rows.filter((a) => a.status === "cancelled").length,
		noShow: rows.filter((a) => a.status === "no-show").length,
		bookedMin: live.reduce((s, a) => s + a.durationMin, 0),
		capacityMin: capacityMin(
			personId === undefined ? people : people.filter((p) => p.id === personId),
			input.roster,
			from,
			to,
		),
		newClients: [...clientsIn].filter((id) => (first.get(id) ?? "") >= from).length,
		returningClients: [...clientsIn].filter((id) => (first.get(id) ?? "") < from).length,
		revenueBani: revenueOf(scoped, personId === undefined ? input.packages : [], from, to),
		requests: requests.length,
		requestsConverted: requests.filter((r) => r.handled).length,
		byDay: days.map((date) => ({
			date,
			appointments: live.filter((a) => a.date === date).length,
			cancelled: rows.filter((a) => a.date === date && a.status === "cancelled").length,
		})),
		byPerson: people
			.map((p) =>
				slice(
					p.id,
					p.name,
					rows.filter((a) => a.columnId === p.id),
				),
			)
			.sort(byBusiest),
		byService: input.services
			.map((s) =>
				slice(
					s.id,
					s.name,
					rows.filter((a) => a.serviceId === s.id),
				),
			)
			.filter((s) => s.appointments + s.cancelled > 0)
			.sort(byBusiest),
		byRoom: rooms
			.map((r) =>
				slice(
					r.id,
					r.name,
					rows.filter((a) => a.columnId === r.id || a.resourceIds.includes(r.id)),
				),
			)
			.sort(byBusiest),
		heat,
	};
}

/** Today, this week, this month and the packages as they stand: independent of the period asked. */
export function snapshotFor(input: ReportInput): Snapshot {
	const live = input.appointments.filter((a) => isVisit(a) && a.status !== "cancelled");
	const week = weekStart(input.today);
	const month = `${input.today.slice(0, 7)}-01`;
	const active = input.packages.filter(
		(p) => packageUsage(p, input.appointments, input.today).left > 0,
	);
	return {
		today: live.filter((a) => a.date === input.today).length,
		week: live.filter((a) => inRange(a.date, week, addDays(week, 6))).length,
		month: live.filter((a) => a.date.startsWith(month.slice(0, 7))).length,
		packagesActive: active.length,
		packagesEnding: active.filter((p) => packageUsage(p, input.appointments, input.today).left <= 2)
			.length,
	};
}
