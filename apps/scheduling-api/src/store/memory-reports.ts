import { reports } from "@psi/scheduling/clinic";
import type { WebBooking } from "./memory-visitor";
import type { BlacklistPort, FeedbackPort, ReportKind, ReportQuery, ReportsPort } from "./ports";
import { type AppointmentRow, type Collection, type Rows, StoreRefused } from "./types";

type Cs = { [K in keyof Rows]: Collection<Rows[K]> };
type Entry = reports.ReportAppointment;

/** What one report reads at most, as the Convex queries read (a store that would read more refuses, never answers from part). */
const MAX_ROWS = 12_000;
const MAX_FEEDBACK = 5_000;
const STATUSES: readonly Entry["status"][] = [
	"held",
	"requested",
	"confirmed",
	"cancelled",
	"declined",
	"expired",
];
const ONE_DAY = 86_400_000;

/** A staff appointment as a calendar entry. */
function entryOf(a: AppointmentRow): Entry {
	return {
		id: a.id,
		source: "visit",
		start: a.start,
		end: a.end,
		status:
			a.status === "cancelled" ? "cancelled" : a.status === "requested" ? "requested" : "confirmed",
		attendance:
			a.status === "attended" ? "attended" : a.status === "no_show" ? "absent" : "pending",
		service: a.serviceId ?? a.kind,
		...(a.kind === "group" ? {} : { practitioner: a.practitionerId }),
		...(a.roomId === undefined ? {} : { room: a.roomId }),
		...(a.deviceId === undefined ? {} : { device: a.deviceId }),
		...(a.clientId === undefined ? {} : { client: a.clientId }),
		...(a.packageId === undefined ? {} : { package: a.packageId }),
	};
}

const webEntry = (b: WebBooking): Entry => ({
	id: b.id,
	source: "web",
	start: b.start,
	end: b.end,
	status: b.status,
	service: b.service,
	...(b.practitioner === undefined ? {} : { practitioner: b.practitioner }),
});

const filterOf = (q: ReportQuery) => ({
	...(q.practitioner === undefined ? {} : { practitioner: q.practitioner }),
	...(q.room === undefined ? {} : { room: q.room }),
	...(q.device === undefined ? {} : { device: q.device }),
	...(q.service === undefined ? {} : { service: q.service }),
	...(q.client === undefined ? {} : { client: q.client }),
	...(q.source === undefined ? {} : { source: q.source }),
});

/**
 * The nine reports over the in-memory rows: the same pure functions the Convex queries feed, from the same shapes, so the
 * two stores answer alike. A public booking has the person and the service the visitor chose; the package price is left
 * out of every report but revenue (the core reports hold no money).
 */
export function createMemoryReports(
	c: Cs,
	web: (app: string) => WebBooking[],
	feedback: FeedbackPort,
	blacklist: BlacklistPort,
): ReportsPort {
	async function open(app: string, q: ReportQuery): Promise<reports.Range> {
		const row = await c.apps.get(app, app);
		if (row === undefined) throw new StoreRefused("unknown_tenant");
		const range: reports.Range = { from: q.from, to: q.to, zone: row.timeZone };
		const problem = reports.rangeProblem(range);
		if (problem !== undefined) throw new StoreRefused(problem);
		return range;
	}

	async function visitsIn(app: string, from: number, to: number): Promise<AppointmentRow[]> {
		const rows = (
			await c.appointments.list(app, { range: { field: "start", gte: from, lt: to } })
		).filter((a) => a.deletedAt === undefined);
		if (rows.length > MAX_ROWS) throw new StoreRefused("too_many_rows");
		return rows;
	}

	async function calendar(app: string, range: reports.Range): Promise<Entry[]> {
		const visits = await visitsIn(app, range.from, range.to);
		const sites = web(app).filter((b) => b.start >= range.from && b.start < range.to);
		if (sites.length > MAX_ROWS) throw new StoreRefused("too_many_rows");
		return [...visits.map(entryOf), ...sites.map(webEntry)];
	}

	const kinds: {
		[K in ReportKind]: (
			app: string,
			q: ReportQuery,
			range: reports.Range,
		) => Promise<{ report: unknown; clients?: unknown }>;
	} = {
		async appointments(app, q, range) {
			const statuses = q.statuses ?? [];
			const known = statuses.filter((s): s is Entry["status"] => STATUSES.some((k) => k === s));
			if (known.length !== statuses.length) throw new StoreRefused("invalid");
			return {
				report: reports.appointmentsReport(
					await calendar(app, range),
					range,
					q.granularity,
					q.group ?? "status",
					{ ...filterOf(q), ...(known.length === 0 ? {} : { statuses: known }) },
				),
			};
		},

		async utilisation(app, _q, range) {
			// A visit that started the day before can run into the range (none lasts a day): read it too.
			const visits = await visitsIn(app, range.from - ONE_DAY, range.to);
			const dates = reports.datesOf(range);
			const first = dates[0] ?? "";
			const last = dates[dates.length - 1] ?? "";
			const people = new Map(
				(await c.people.list(app)).map(
					(p) => [p.id, p.kind === "practitioner" ? "practitioner" : "staff"] as const,
				),
			);
			const days: reports.ReportRosterDay[] = (await c.roster.list(app))
				.filter((d) => d.date >= first && d.date <= last)
				.map((d) => ({
					person: { kind: people.get(d.personId) ?? "staff", id: d.personId },
					date: d.date,
					entry:
						d.kind === "work"
							? { status: "works", startMinutes: d.start ?? 0, endMinutes: d.end ?? 0 }
							: {
									status:
										d.kind === "leave_co"
											? "annual_leave"
											: d.kind === "leave_cm"
												? "medical_leave"
												: "free",
								},
				}));
			const blocks: reports.ReportBlock[] = (await c.leave.list(app))
				.filter((l) => l.status === "approved")
				.map((l) => ({
					person: { kind: people.get(l.personId) ?? "staff", id: l.personId },
					dateStart: l.from,
					dateEnd: l.to,
				}));
			return { report: reports.utilisationReport(visits.map(entryOf), days, blocks, range) };
		},

		async rates(app, q, range) {
			const rows = await calendar(app, range);
			const filter = filterOf(q);
			return {
				report: reports.ratesReport(rows, range, q.now, filter),
				...(q.byClient === true
					? {
							clients: reports
								.ratesByClient(rows, range, q.now, {
									filter,
									minBookings: Math.max(1, Math.floor(q.minBookings ?? 1)),
								})
								.slice(0, 200),
						}
					: {}),
			};
		},

		async clients(app, q, range) {
			const rows = await calendar(app, range);
			// Who had a confirmed visit before the range.
			const prior = new Set(
				(await c.appointments.list(app, { range: { field: "start", lt: range.from } }))
					.filter((a) => a.deletedAt === undefined && a.clientId !== undefined)
					.map(entryOf)
					.filter((e) => e.status === "confirmed")
					.map((e) => e.client ?? ""),
			);
			return { report: reports.clientsReport(rows, prior, range, q.granularity, filterOf(q)) };
		},

		async packages(app, q, range) {
			const stored = await c.packages.list(app);
			const list: reports.ReportPackage[] = stored.map((p) => ({
				id: p.id,
				client: p.clientId,
				sessionType: p.name,
				totalSessions: p.sessions,
				bonusSessions: p.bonus,
				// The core report holds no money: the price is revenue's.
				priceMinor: 0,
				createdAt: p.createdAt,
			}));
			const linked = (await c.appointments.list(app))
				.filter((a) => a.deletedAt === undefined && a.packageId !== undefined)
				.map(entryOf);
			return { report: reports.packagesReport(list, linked, range, q.granularity, q.now) };
		},

		async funnel(app, q, range) {
			const rows: reports.ReportWebRequest[] = web(app).map((b) => ({
				created: b.created,
				channel: b.channel,
				status: b.status,
				...(b.submitted ? { submittedAt: b.created } : {}),
			}));
			return { report: reports.funnelReport(rows, range, q.granularity) };
		},

		async ratings(app, q, range) {
			const got = await feedback.list(app, ["core"], {
				from: range.from,
				to: range.to - 1,
				limit: MAX_FEEDBACK + 1,
			});
			if (got.items.length > MAX_FEEDBACK || got.more) throw new StoreRefused("too_many_rows");
			const items: reports.ReportFeedback[] = [];
			for (const f of got.items) {
				const about = f.visit ?? f.appointment;
				const held = about === undefined ? undefined : await c.appointments.get(app, about);
				const person =
					held !== undefined && held.kind !== "group"
						? held.practitionerId
						: web(app).find((b) => b.id === about)?.practitioner;
				items.push({
					kind: f.kind,
					createdAt: f.createdAt,
					status: f.status,
					...(f.rating === undefined ? {} : { rating: f.rating }),
					...(person === undefined ? {} : { practitioner: person }),
				});
			}
			return { report: reports.ratingsReport(items, range, q.granularity) };
		},

		async blacklistHits(app, q, range) {
			const rows = await blacklist.events(app, { limit: MAX_ROWS + 1 });
			if (rows.length > MAX_ROWS) throw new StoreRefused("too_many_rows");
			const events: reports.ReportBlacklistEvent[] = rows
				.filter((e) => e.at >= range.from && e.at < range.to)
				.map((e) => ({
					at: e.at,
					kind: e.kind,
					entry: e.entry,
					severity: e.severity,
					category: e.category,
					matchedBy: e.matchedBy,
					channel: e.channel,
					...(e.authority === undefined ? {} : { authority: e.authority }),
				}));
			return { report: reports.blacklistHitsReport(events, range, q.granularity) };
		},

		async revenue(app, q, range) {
			const visits = await visitsIn(app, range.from, range.to);
			const ledger: reports.ReportPayment[] = (await c.payments.list(app)).map((p) => ({
				id: p.id,
				client: p.clientId,
				amountMinor: p.amountCents,
				at: p.paidAt,
				...(p.packageId === undefined ? {} : { package: p.packageId }),
				...(p.method === undefined ? {} : { method: p.method }),
			}));
			const sold: reports.ReportPackage[] = (await c.packages.list(app)).map((p) => ({
				id: p.id,
				client: p.clientId,
				sessionType: p.name,
				totalSessions: p.sessions,
				bonusSessions: p.bonus,
				priceMinor: p.priceCents,
				createdAt: p.createdAt,
			}));
			const money: reports.ReportVisitMoney[] = visits.map((a) => ({
				id: a.id,
				start: a.start,
				status: entryOf(a).status,
				...(a.packageId === undefined ? {} : { package: a.packageId }),
				...(a.money === undefined
					? {}
					: { priceMinor: a.money.priceCents, amountPaidMinor: a.money.paidCents }),
			}));
			return { report: reports.revenueReport(ledger, sold, money, range, q.granularity, q.now) };
		},
	};

	return {
		async run(app, name, query) {
			const range = await open(app, query);
			return { timeZone: range.zone, ...(await kinds[name](app, query, range)) };
		},
	};
}
