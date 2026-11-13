import { z } from "zod/v4";
import { AppParam } from "./primitives";

/**
 * The nine reports and what the caller needs for each. Counts and rates are the `core` group; only revenue has money in
 * it, and needs the `money` group. The list is the permission package's own (`REPORTS`), and a test in the service holds
 * the two together, so a report added there without a route here fails.
 */
export const REPORT_NAMES = [
	"appointments",
	"utilisation",
	"rates",
	"clients",
	"packages",
	"funnel",
	"ratings",
	"blacklistHits",
	"revenue",
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
export const ReportNameSchema = z.enum(REPORT_NAMES);

export const REPORT_GROUPS = {
	appointments: "core",
	utilisation: "core",
	rates: "core",
	clients: "core",
	packages: "core",
	funnel: "core",
	ratings: "core",
	blacklistHits: "core",
	revenue: "money",
} as const satisfies Record<ReportName, "core" | "money">;

export const GRANULARITIES = ["day", "week", "month"] as const;
/** The longest range a report reads: a year and a day of local dates. */
export const MAX_REPORT_DAYS = 366;

/**
 * The window of a report: `[from, to)` in instants, read in the app's zone. The same on every report; a range that is
 * empty, backwards or longer than a year and a day is refused (400), never answered from part of it.
 */
export const ReportRange = z.object({
	from: z.coerce.number().int().nonnegative(),
	to: z.coerce.number().int().nonnegative(),
	granularity: z.enum(GRANULARITIES).default("day"),
});

const Count = z.number().int().nonnegative();
const Counts = z.record(z.string(), Count);
const Rate = z.number().nullable();
const Bucket = z.string();

export const AppointmentsReport = z.object({
	total: Count,
	by: Counts,
	buckets: z.array(z.object({ bucket: Bucket, total: Count, by: Counts })),
});
export const AppointmentsReportQuery = ReportRange.extend({
	group: z.enum(["status", "service", "practitioner", "room", "device"]).default("status"),
	practitioner: z.string().max(80).optional(),
	room: z.string().max(80).optional(),
	device: z.string().max(80).optional(),
	service: z.string().max(80).optional(),
	client: z.string().max(80).optional(),
	source: z.enum(["visit", "web"]).optional(),
	/** Comma-separated statuses: held, requested, confirmed, cancelled, declined, expired. */
	statuses: z.string().max(120).optional(),
});

const Utilisation = z.object({
	id: z.string(),
	availableMinutes: Count,
	bookedMinutes: Count,
	outsideMinutes: Count,
	rate: Rate,
});
export const UtilisationReport = z.object({
	practitioners: z.array(Utilisation),
	rooms: z.array(Utilisation),
	devices: z.array(Utilisation),
});

export const RatesReport = z.object({
	bookings: Count,
	cancelled: Count,
	cancellationRate: Rate,
	attended: Count,
	absent: Count,
	unmarked: Count,
	noShowRate: Rate,
});
export const ClientRates = z.object({
	client: z.string(),
	bookings: Count,
	cancelled: Count,
	attended: Count,
	absent: Count,
	cancellationRate: Rate,
	noShowRate: Rate,
});
export const RatesReportQuery = ReportRange.extend({
	practitioner: z.string().max(80).optional(),
	room: z.string().max(80).optional(),
	device: z.string().max(80).optional(),
	service: z.string().max(80).optional(),
	client: z.string().max(80).optional(),
	source: z.enum(["visit", "web"]).optional(),
	/** Also the rates per client, worst first (at most 200). */
	byClient: z.enum(["true", "false"]).default("false"),
	minBookings: z.coerce.number().int().min(1).max(1000).default(1),
});

export const ClientsReport = z.object({
	active: Count,
	new: Count,
	returning: Count,
	buckets: z.array(z.object({ bucket: Bucket, new: Count, returning: Count })),
});

export const PackagesReport = z.object({
	sold: z.object({
		packages: Count,
		baseSessions: Count,
		bonusSessions: Count,
		byType: Counts,
	}),
	used: z.object({
		base: Count,
		bonus: Count,
		buckets: z.array(z.object({ bucket: Bucket, base: Count, bonus: Count })),
	}),
	remaining: z.object({
		packages: Count,
		sessions: Count,
		overdrawnPackages: Count,
		overdrawnSessions: Count,
	}),
});

const Funnel = z.object({
	started: Count,
	submitted: Count,
	booked: Count,
	declined: Count,
	cancelled: Count,
	pending: Count,
	lapsed: Count,
	submitRate: Rate,
	requestToBooked: Rate,
});
export const FunnelReport = z.object({
	total: Funnel,
	byChannel: z.record(z.string(), Funnel),
	buckets: z.array(z.object({ bucket: Bucket, started: Count, submitted: Count, booked: Count })),
});

const RatingSummary = z.object({
	count: Count,
	average: z.number().nullable(),
	distribution: z.tuple([Count, Count, Count, Count, Count]),
});
export const RatingsReport = z.object({
	total: RatingSummary,
	withoutRating: Count,
	byStatus: Counts,
	byKind: z.record(z.string(), RatingSummary),
	byPractitioner: z.record(z.string(), RatingSummary),
	buckets: z.array(RatingSummary.extend({ bucket: Bucket })),
});

export const BlacklistHitsReport = z.object({
	total: Count,
	refused: Count,
	overridden: Count,
	bySeverity: Counts,
	byCategory: Counts,
	byChannel: Counts,
	byMatch: Counts,
	byAuthority: Counts,
	topEntries: z.array(z.object({ entry: z.string(), hits: Count })),
	buckets: z.array(z.object({ bucket: Bucket, refused: Count, overridden: Count })),
});

/** Whole bani; a refund is negative money in, so `net` is `paid - refunded`. */
const Money = z.object({
	paidMinor: z.number().int(),
	refundedMinor: z.number().int(),
	netMinor: z.number().int(),
});
export const RevenueReport = z.object({
	total: Money,
	byMethod: z.record(z.enum(["cash", "card", "transfer", "unknown"]), Money),
	sources: z.object({ ledger: Money, visits: Money }),
	buckets: z.array(Money.extend({ bucket: Bucket })),
	outstanding: z.object({
		packages: z.object({ count: Count, minor: z.number().int() }),
		visits: z.object({ count: Count, minor: z.number().int() }),
		minor: z.number().int(),
	}),
});

const Answer = <T extends z.ZodType>(report: T) => z.object({ timeZone: z.string(), report });
export const AppointmentsReportAnswer = Answer(AppointmentsReport);
export const UtilisationReportAnswer = Answer(UtilisationReport);
export const RatesReportAnswer = Answer(RatesReport).extend({
	clients: z.array(ClientRates).optional(),
});
export const ClientsReportAnswer = Answer(ClientsReport);
export const PackagesReportAnswer = Answer(PackagesReport);
export const FunnelReportAnswer = Answer(FunnelReport);
export const RatingsReportAnswer = Answer(RatingsReport);
export const BlacklistHitsReportAnswer = Answer(BlacklistHitsReport);
export const RevenueReportAnswer = Answer(RevenueReport);

/**
 * A report as a CSV file, for the spreadsheet: `{ filename, csv }`. The file is plain text, every cell quoted when it
 * needs it, and a cell that would be read as a formula by a spreadsheet is made harmless. Needs the report's own
 * `export` permission.
 */
export const ReportCsv = z.object({ filename: z.string().max(120), csv: z.string() });
export const ReportCsvQuery = z.object({
	from: ReportRange.shape.from,
	to: ReportRange.shape.to,
	granularity: ReportRange.shape.granularity,
	group: AppointmentsReportQuery.shape.group.optional(),
});
export const ReportParam = AppParam.extend({ report: ReportNameSchema });
