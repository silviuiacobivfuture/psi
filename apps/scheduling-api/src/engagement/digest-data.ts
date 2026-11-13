import { startOfLocalDay } from "@psi/scheduling/domain";
import { addDaysKey } from "../handlers/shared";
import type { AppointmentRow, StorePort } from "../store/types";

/** The most lines a digest prints; the rest is a count the person reads in the calendar. */
export const MAX_LINES = 60;

/** The local calendar date of an instant in a zone, `YYYY-MM-DD`. */
export function localDate(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/** The local clock time of an instant in a zone, `HH:MM`. */
export function localClock(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(instant);
}

/** The live sessions that start on local days `from`..`to` inclusive (a block, a group slot or a deleted row is not one). */
export async function sessionsBetween(
	store: StorePort,
	app: string,
	timeZone: string,
	from: string,
	to: string,
): Promise<AppointmentRow[]> {
	const rows = await store.c.appointments.list(app, {
		range: {
			field: "start",
			gte: startOfLocalDay(from, timeZone),
			lt: startOfLocalDay(addDaysKey(to, 1), timeZone),
		},
	});
	return rows
		.filter((a) => a.kind === "session" && a.deletedAt === undefined)
		.sort((a, b) => a.start - b.start);
}

/** `Ana Popescu · Terapie ABA`: who and what, nothing about why. */
export async function linesOf(
	store: StorePort,
	app: string,
	rows: readonly AppointmentRow[],
): Promise<{ at: string; text: string }[]> {
	const out: { at: string; text: string }[] = [];
	for (const a of rows.slice(0, MAX_LINES)) {
		const [client, service] = await Promise.all([
			a.clientId === undefined ? undefined : store.c.clients.get(app, a.clientId),
			a.serviceId === undefined ? undefined : store.c.services.get(app, a.serviceId),
		]);
		out.push({
			at: new Date(a.start).toISOString(),
			text: `${client?.name ?? "—"} · ${service?.name.ro ?? "Programare"}`.slice(0, 200),
		});
	}
	return out;
}

export interface OwnerStats {
	appointments: number;
	attended: number;
	cancelled: number;
	noShows: number;
	occupancyPercent: number;
	/** Money taken in the period, in cents. */
	revenueCents: number;
}

/**
 * The numbers an owner reads: how many sessions there were and how they ended, how much of the working time was booked,
 * and what was paid. Occupancy is booked minutes (cancelled ones do not count) over the minutes the roster says people
 * work; with no roster it is 0, never a guess.
 */
export async function ownerStats(
	store: StorePort,
	app: string,
	timeZone: string,
	from: string,
	to: string,
): Promise<OwnerStats> {
	const sessions = await sessionsBetween(store, app, timeZone, from, to);
	const booked = sessions
		.filter((a) => a.status !== "cancelled")
		.reduce((sum, a) => sum + (a.end - a.start) / 60_000, 0);
	const roster = (await store.c.roster.list(app)).filter(
		(r) => r.kind === "work" && r.date >= from && r.date <= to,
	);
	const available = roster.reduce((sum, r) => sum + Math.max(0, (r.end ?? 0) - (r.start ?? 0)), 0);
	const paid = await store.c.payments.list(app, {
		range: {
			field: "paidAt",
			gte: startOfLocalDay(from, timeZone),
			lt: startOfLocalDay(addDaysKey(to, 1), timeZone),
		},
	});
	return {
		appointments: sessions.length,
		attended: sessions.filter((a) => a.status === "attended").length,
		cancelled: sessions.filter((a) => a.status === "cancelled").length,
		noShows: sessions.filter((a) => a.status === "no_show").length,
		occupancyPercent: available === 0 ? 0 : Math.min(100, Math.round((booked / available) * 100)),
		revenueCents: paid.reduce((sum, p) => sum + p.amountCents, 0),
	};
}

/** Money as the messages print it: `1.250,00 RON` in Romanian grouping, whatever the reader's language. */
export function money(cents: number): string {
	return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} RON`;
}
