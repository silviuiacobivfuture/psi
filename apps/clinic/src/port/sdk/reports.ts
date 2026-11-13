import { daysIn } from "../../domain/report";
import { addDays, parseDay, weekStart } from "../../lib/dates";
import type { CalendarData } from "../port";
import { PortError } from "../port";
import type { Figures, Report, ReportQuery, ReportSlice, Snapshot } from "../report-schema";
import type { AppSlug, Column, Service } from "../schema";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { instantOf, wallOf } from "./time";

/** What the mapping needs besides the reports: the names the reports' ids stand for, and the visits for the weekly heat. */
export interface ReportLookups {
	columns(app: AppSlug): Promise<Column[]>;
	services(app: AppSlug): Promise<Service[]>;
	calendar(app: AppSlug, from: string, to: string): Promise<CalendarData>;
}

const num = (by: Readonly<Record<string, number>>, key: string): number => by[key] ?? 0;
/** Bookings that stand: asked for and confirmed. The rest (held, cancelled, declined, expired) are not visits. */
const standing = (by: Readonly<Record<string, number>>): number =>
	num(by, "requested") + num(by, "confirmed");

const byBusiest = (a: ReportSlice, b: ReportSlice): number =>
	b.appointments - a.appointments || a.name.localeCompare(b.name);

/**
 * Statistics, from the scheduling service's nine reports (`reports.*`): counts by status, service, person and room; how
 * much of their time people and rooms were booked; the cancellation and no-show counts; new and returning clients;
 * the request funnel; revenue (the money group); the packages as they stand. The service has no report by weekday and
 * hour, so the heat is drawn from the period's own visits. A report the person may not read (revenue, without the money
 * group) is simply absent from the answer, never an error; a figure the service does not split by person is `null`.
 */
export function reportsGroup(sdk: SdkContext, look: ReportLookups) {
	const { api, run } = sdk;

	/** A report this person may not read answers 403: it is absent, and the rest of the screen stands. */
	async function mayNot<T>(call: () => Promise<T>): Promise<T | null> {
		try {
			return await call();
		} catch (error) {
			if (toPortError(error).code === "forbidden") return null;
			throw error;
		}
	}

	async function figures(
		app: AppSlug,
		zone: string,
		from: string,
		to: string,
		personId: string | undefined,
		names: {
			people: Map<string, string>;
			rooms: Map<string, string>;
			services: Map<string, string>;
		},
	): Promise<Figures> {
		const range = {
			app,
			from: instantOf(from, 0, zone),
			to: instantOf(addDays(to, 1), 0, zone),
			granularity: "day" as const,
		};
		const who = personId === undefined ? {} : { practitioner: personId };
		const grouped = (group: "status" | "practitioner" | "service" | "room") =>
			api.reports.appointments({ ...range, group, ...(group === "practitioner" ? {} : who) });
		const [status, people, services, rooms, use, rates, clients, funnel, revenue, visits] =
			await Promise.all([
				grouped("status"),
				grouped("practitioner"),
				grouped("service"),
				grouped("room"),
				api.reports.utilisation(range),
				api.reports.rates({ ...range, ...who, byClient: "false", minBookings: 1 }),
				personId === undefined ? api.reports.clients(range) : Promise.resolve(null),
				mayNot(() => api.reports.funnel(range)),
				mayNot(() => api.reports.revenue(range)),
				look.calendar(app, from, to),
			]);
		const by = status.report.by;
		const dayOf = new Map(status.report.buckets.map((b) => [b.bucket, b.by]));
		const mine = use.report.practitioners.filter(
			(p) => personId === undefined || p.id === personId,
		);
		const minutes = (id: string): number =>
			[...use.report.practitioners, ...use.report.rooms].find((u) => u.id === id)?.bookedMinutes ??
			0;
		const slices = (report: typeof people, label: Map<string, string>): ReportSlice[] =>
			Object.entries(report.report.by)
				.map(([id, n]) => ({
					id,
					name: label.get(id) ?? id,
					appointments: n,
					attended: null,
					cancelled: null,
					noShow: null,
					bookedMin: minutes(id),
					revenueBani: null,
				}))
				.sort(byBusiest);
		const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
		for (const a of visits.appointments) {
			if (a.status === "cancelled" || a.status === "leave" || a.status === "medical-leave")
				continue;
			if (personId !== undefined && a.columnId !== personId) continue;
			const row = heat[(parseDay(a.date).getUTCDay() + 6) % 7];
			const hour = Math.min(23, Math.floor(a.startMin / 60));
			if (row !== undefined) row[hour] = (row[hour] ?? 0) + 1;
		}
		return {
			from,
			to,
			appointments: standing(by),
			attended: rates.report.attended,
			cancelled: rates.report.cancelled,
			noShow: rates.report.absent,
			bookedMin: mine.reduce((s, p) => s + p.bookedMinutes, 0),
			capacityMin: mine.reduce((s, p) => s + p.availableMinutes, 0),
			newClients: clients?.report.new ?? null,
			returningClients: clients?.report.returning ?? null,
			revenueBani: revenue === null ? null : Math.max(0, revenue.report.total.netMinor),
			requests: funnel?.report.total.submitted ?? 0,
			requestsConverted: funnel?.report.total.booked ?? 0,
			byDay: daysIn(from, to).map((date) => {
				const day = dayOf.get(date) ?? {};
				return { date, appointments: standing(day), cancelled: num(day, "cancelled") };
			}),
			byPerson: slices(people, names.people),
			byService: slices(services, names.services),
			byRoom: slices(rooms, names.rooms),
			heat,
		};
	}

	async function snapshot(app: AppSlug, zone: string): Promise<Snapshot> {
		const today = wallOf(Date.now(), zone).date;
		const week = weekStart(today);
		const month = `${today.slice(0, 7)}-01`;
		const count = async (from: string, to: string): Promise<number> =>
			standing(
				(
					await api.reports.appointments({
						app,
						from: instantOf(from, 0, zone),
						to: instantOf(addDays(to, 1), 0, zone),
						granularity: "month",
						group: "status",
					})
				).report.by,
			);
		const [d, w, m, packages] = await Promise.all([
			count(today, today),
			count(week, addDays(week, 6)),
			count(month, addDays(addMonthOf(month), -1)),
			mayNot(() =>
				api.reports.packages({
					app,
					from: instantOf(addDays(today, -365), 0, zone),
					to: instantOf(addDays(today, 1), 0, zone),
					granularity: "month",
				}),
			),
		]);
		return {
			today: d,
			week: w,
			month: m,
			packagesActive: packages?.report.remaining.packages ?? 0,
			// The packages report counts what is left in all of them; which ones have two sessions or fewer it does not say.
			packagesEnding: null,
		};
	}

	return {
		report: (app: AppSlug, query: ReportQuery): Promise<Report> =>
			run(async () => {
				const zone = await sdk.zone(app);
				const [columns, services] = await Promise.all([look.columns(app), look.services(app)]);
				const names = {
					people: new Map(columns.filter((c) => c.kind === "person").map((c) => [c.id, c.name])),
					rooms: new Map(columns.filter((c) => c.kind === "room").map((c) => [c.id, c.name])),
					services: new Map(services.map((s) => [s.id, s.name])),
				};
				const one = (from: string, to: string) =>
					figures(app, zone, from, to, query.personId, names);
				const [snap, current, previous] = await Promise.all([
					snapshot(app, zone),
					one(query.from, query.to),
					query.compare === undefined
						? Promise.resolve(null)
						: one(query.compare.from, query.compare.to),
				]);
				return { snapshot: snap, current, previous };
			}).catch((error: unknown) => {
				if (error instanceof PortError) throw error;
				throw toPortError(error);
			}),
	};
}

/** The first day of the month after `monthStart` (a `YYYY-MM-01`). */
function addMonthOf(monthStart: string): string {
	const d = parseDay(monthStart);
	d.setUTCMonth(d.getUTCMonth() + 1);
	return d.toISOString().slice(0, 10);
}
