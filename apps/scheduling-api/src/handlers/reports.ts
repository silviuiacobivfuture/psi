import { reports } from "@psi/scheduling/clinic";
import {
	AppointmentsReportAnswer,
	BlacklistHitsReportAnswer,
	ClientsReportAnswer,
	FunnelReportAnswer,
	PackagesReportAnswer,
	RatesReportAnswer,
	RatingsReportAnswer,
	REPORT_GROUPS,
	type ReportName,
	RevenueReportAnswer,
	type RouteSpec,
	UtilisationReportAnswer,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { Ctx, HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { ReportQuery } from "../store/ports";

type Handled = HandlersOf<
	| "reports.appointments"
	| "reports.utilisation"
	| "reports.rates"
	| "reports.clients"
	| "reports.packages"
	| "reports.funnel"
	| "reports.ratings"
	| "reports.blacklistHits"
	| "reports.revenue"
	| "reports.csv"
>;

type Named = Record<string, unknown>;
type C = Ctx<RouteSpec>;

/** The range and filters of a request as the store takes them; the instant "now" is the service's clock. */
function queryOf(ctx: C, q: Named): ReportQuery {
	const text = (key: string): string | undefined => {
		const v = q[key];
		return typeof v === "string" ? v : undefined;
	};
	const from = Number(q.from);
	const to = Number(q.to);
	const granularity = q.granularity === "week" || q.granularity === "month" ? q.granularity : "day";
	const group = text("group");
	const source = text("source");
	const statuses = text("statuses");
	return {
		from,
		to,
		granularity,
		now: ctx.now,
		...(group === "service" ||
		group === "practitioner" ||
		group === "room" ||
		group === "device" ||
		group === "status"
			? { group }
			: {}),
		...(statuses === undefined
			? {}
			: {
					statuses: statuses
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s !== ""),
				}),
		...(text("practitioner") === undefined ? {} : { practitioner: text("practitioner") }),
		...(text("room") === undefined ? {} : { room: text("room") }),
		...(text("device") === undefined ? {} : { device: text("device") }),
		...(text("service") === undefined ? {} : { service: text("service") }),
		...(text("client") === undefined ? {} : { client: text("client") }),
		...(source === "visit" || source === "web" ? { source } : {}),
		...(q.byClient === "true" ? { byClient: true } : {}),
		...(typeof q.minBookings === "number" ? { minBookings: q.minBookings } : {}),
	};
}

const ANSWER = {
	appointments: AppointmentsReportAnswer,
	utilisation: UtilisationReportAnswer,
	rates: RatesReportAnswer,
	clients: ClientsReportAnswer,
	packages: PackagesReportAnswer,
	funnel: FunnelReportAnswer,
	ratings: RatingsReportAnswer,
	blacklistHits: BlacklistHitsReportAnswer,
	revenue: RevenueReportAnswer,
} as const;

/**
 * Runs a report and checks its answer against the contract before it leaves: a store whose report does not match the
 * schema is a bug found by the first caller as a 500, never a wrong number shown as a right one.
 */
async function answer<S extends z.ZodType>(
	ctx: C,
	name: ReportName,
	schema: S,
	q: Named,
): Promise<z.output<S>> {
	const got = await ctx.deps.store.reports.run(ctx.app, name, queryOf(ctx, q));
	const parsed = schema.safeParse(got);
	if (!parsed.success) {
		ctx.deps.log({ level: "error", event: "report_shape", requestId: ctx.requestId, report: name });
		throw fail("internal", "the report does not match the contract");
	}
	return parsed.data;
}

export const reportHandlers: Handled = {
	"reports.appointments": (ctx) => answer(ctx, "appointments", ANSWER.appointments, ctx.query),
	"reports.utilisation": (ctx) => answer(ctx, "utilisation", ANSWER.utilisation, ctx.query),
	"reports.rates": (ctx) => answer(ctx, "rates", ANSWER.rates, ctx.query),
	"reports.clients": (ctx) => answer(ctx, "clients", ANSWER.clients, ctx.query),
	"reports.packages": (ctx) => answer(ctx, "packages", ANSWER.packages, ctx.query),
	"reports.funnel": (ctx) => answer(ctx, "funnel", ANSWER.funnel, ctx.query),
	"reports.ratings": (ctx) => answer(ctx, "ratings", ANSWER.ratings, ctx.query),
	"reports.blacklistHits": (ctx) => answer(ctx, "blacklistHits", ANSWER.blacklistHits, ctx.query),
	"reports.revenue": (ctx) => answer(ctx, "revenue", ANSWER.revenue, ctx.query),

	/** A report as a CSV file: the report's own `export` permission, and the export is audited. */
	async "reports.csv"(ctx) {
		const name = ctx.params.report;
		await ctx.authorizeAny([`reports_export_${REPORT_GROUPS[name]}`], "sched_role", ctx.app);
		const got = await answer(ctx, name, ANSWER[name], ctx.query);
		const zone = got.timeZone;
		const csv = reports.reportCsv(name, got.report, {
			from: Number(ctx.query.from),
			to: Number(ctx.query.to),
			zone,
		});
		ctx.auditTarget(name);
		ctx.note({ report: name, bytes: csv.csv.length });
		return csv;
	},
};
