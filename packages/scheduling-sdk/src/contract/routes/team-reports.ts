import { route } from "../define";
import {
	AppointmentsReportAnswer,
	AppointmentsReportQuery,
	BlacklistHitsReportAnswer,
	ClientsReportAnswer,
	FunnelReportAnswer,
	PackagesReportAnswer,
	RatesReportAnswer,
	RatesReportQuery,
	RatingsReportAnswer,
	ReportCsv,
	ReportCsvQuery,
	ReportParam,
	ReportRange,
	RevenueReportAnswer,
	UtilisationReportAnswer,
} from "../entities-reports";
import { AppParam } from "../primitives";

const CORE = { key: "reports_view_core", target: { kind: "app" } } as const;

/**
 * The reports: counts and rates are the `core` group, revenue (the one report with money in it) the `money` group.
 * Each takes a range of at most a year and a day, and refuses a larger one with 400 `invalid` (`range_too_long`) and
 * a store that would have to read too much with 400 `invalid` (`too_many_rows`) rather than answer from part of the
 * data. None of them returns a name, a contact or a text: only counts, rates, ids and, for revenue, whole bani.
 */
export const REPORT_ROUTES = [
	route({
		id: "reports.appointments",
		method: "GET",
		path: "/v1/apps/:app/reports/appointments",
		side: "team",
		summary: "Bookings counted by status, service, person, room or device, per day, week or month",
		params: AppParam,
		query: AppointmentsReportQuery,
		response: AppointmentsReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.utilisation",
		method: "GET",
		path: "/v1/apps/:app/reports/utilisation",
		side: "team",
		summary: "How much of their available time each person, room and device was booked",
		params: AppParam,
		query: ReportRange,
		response: UtilisationReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.rates",
		method: "GET",
		path: "/v1/apps/:app/reports/rates",
		side: "team",
		summary: "Cancellation and no-show rates, optionally per client, worst first",
		params: AppParam,
		query: RatesReportQuery,
		response: RatesReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.clients",
		method: "GET",
		path: "/v1/apps/:app/reports/clients",
		side: "team",
		summary: "How many clients came, and how many of them were new or returning",
		params: AppParam,
		query: ReportRange,
		response: ClientsReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.packages",
		method: "GET",
		path: "/v1/apps/:app/reports/packages",
		side: "team",
		summary: "Packages sold, sessions used and sessions left (counts, no prices)",
		params: AppParam,
		query: ReportRange,
		response: PackagesReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.funnel",
		method: "GET",
		path: "/v1/apps/:app/reports/funnel",
		side: "team",
		summary: "The online booking funnel: started, submitted, booked, by channel",
		params: AppParam,
		query: ReportRange,
		response: FunnelReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.ratings",
		method: "GET",
		path: "/v1/apps/:app/reports/ratings",
		side: "team",
		summary: "What clients rated, by kind and by person (never what they wrote)",
		params: AppParam,
		query: ReportRange,
		response: RatingsReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.blacklistHits",
		method: "GET",
		path: "/v1/apps/:app/reports/blacklist-hits",
		side: "team",
		summary:
			"What the blacklist did: online refusals and staff overrides, by severity, category and authority",
		params: AppParam,
		query: ReportRange,
		response: BlacklistHitsReportAnswer,
		permission: CORE,
	}),
	route({
		id: "reports.revenue",
		method: "GET",
		path: "/v1/apps/:app/reports/revenue",
		side: "team",
		summary: "Money in, money refunded and money still owed, in whole bani (the money group)",
		params: AppParam,
		query: ReportRange,
		response: RevenueReportAnswer,
		permission: { key: "reports_view_money", target: { kind: "app" } },
	}),
	route({
		id: "reports.csv",
		method: "GET",
		path: "/v1/apps/:app/reports/:report/csv",
		side: "team",
		summary:
			"A report as a CSV file, in a JSON answer { filename, csv }; needs the report's own export permission",
		params: ReportParam,
		query: ReportCsvQuery,
		response: ReportCsv,
		permission: {
			key: "reports_export_core",
			target: {
				kind: "dynamic",
				// An app-wide key is asked of the app, whatever object type carries the question (as the blacklist's is).
				type: "sched_role",
				candidates: ["reports_export_core", "reports_export_money"],
			},
		},
		audit: "report.export",
	}),
] as const;
