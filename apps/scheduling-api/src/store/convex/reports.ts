import { z } from "zod";
import type { ReportKind, ReportQuery, ReportsPort } from "../ports";
import { personApiId, personRef } from "./ids";
import { Refusal, type Rpc, unwrap } from "./rpc";

const Answer = z.union([
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		report: z.unknown(),
		clients: z.unknown().optional(),
	}),
	Refusal,
]);

/** The Convex function that answers each report; revenue, the one with money in it, is in its own module. */
const FUNCTION: Record<ReportKind, string> = {
	appointments: "apiReports:appointments",
	utilisation: "apiReports:utilisation",
	rates: "apiReports:rates",
	clients: "apiReports:clients",
	packages: "apiReports:packages",
	funnel: "apiReports:funnel",
	ratings: "apiReports:ratings",
	blacklistHits: "apiReports:blacklistHits",
	revenue: "apiReportsMoney:revenue",
};

/** The service's id of a person, as Convex's report functions know a practitioner (they key their rows by the raw id). */
const practitionerIn = (apiId: string): string => {
	const ref = personRef(apiId);
	return ref?.kind === "practitioner" ? ref.id : apiId;
};
const practitionerOut = (id: string): string => personApiId("practitioner", id);

const filterArgs = (q: ReportQuery) => ({
	...(q.practitioner === undefined ? {} : { practitioner: practitionerIn(q.practitioner) }),
	...(q.room === undefined ? {} : { room: q.room }),
	...(q.device === undefined ? {} : { device: q.device }),
	...(q.service === undefined ? {} : { service: q.service }),
	...(q.client === undefined ? {} : { client: q.client }),
	...(q.source === undefined ? {} : { source: q.source }),
});

/** Only the arguments each function declares: Convex refuses a field it does not know. */
const ARGS: Record<ReportKind, (q: ReportQuery) => Record<string, unknown>> = {
	appointments: (q) => ({
		...filterArgs(q),
		group: q.group ?? "status",
		...(q.statuses === undefined || q.statuses.length === 0 ? {} : { statuses: [...q.statuses] }),
	}),
	utilisation: () => ({}),
	rates: (q) => ({
		...filterArgs(q),
		byClient: q.byClient === true,
		minBookings: q.minBookings ?? 1,
		now: q.now,
	}),
	clients: (q) => filterArgs(q),
	packages: (q) => ({ now: q.now }),
	funnel: () => ({}),
	ratings: () => ({}),
	blacklistHits: () => ({}),
	revenue: (q) => ({ now: q.now }),
};

const mapKeys = (value: unknown, key: (k: string) => string): unknown =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value).map(([k, v]) => [key(k), v]))
		: value;
const objectOf = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {};

/**
 * Where Convex keys a row by a practitioner's raw id, the service speaks its own person id (`p<id>`): counts by person
 * in the appointments report, the people of utilisation and of the ratings.
 */
function inServiceIds(name: ReportKind, query: ReportQuery, report: unknown): unknown {
	const r = objectOf(report);
	switch (name) {
		case "appointments": {
			if (query.group !== "practitioner") return report;
			const buckets = Array.isArray(r.buckets) ? r.buckets : [];
			return {
				...r,
				by: mapKeys(r.by, (k) => (k === "none" ? k : practitionerOut(k))),
				buckets: buckets.map((b) => ({
					...objectOf(b),
					by: mapKeys(objectOf(b).by, (k) => (k === "none" ? k : practitionerOut(k))),
				})),
			};
		}
		case "utilisation": {
			const people = Array.isArray(r.practitioners) ? r.practitioners : [];
			return {
				...r,
				practitioners: people.map((p) => {
					const row = objectOf(p);
					return { ...row, id: practitionerOut(String(row.id)) };
				}),
			};
		}
		case "ratings":
			return { ...r, byPractitioner: mapKeys(r.byPractitioner, practitionerOut) };
		default:
			return report;
	}
}

/** The reports over Convex's own queries: read-only, bounded, and refused whole when they would read too much. */
export function reportsPort(rpc: Rpc): ReportsPort {
	return {
		async run(app, name, query) {
			const out = unwrap(
				await rpc.query(
					FUNCTION[name],
					{
						tenant: app,
						from: query.from,
						to: query.to,
						granularity: query.granularity,
						...ARGS[name](query),
					},
					Answer,
				),
			);
			return {
				timeZone: out.timeZone,
				report: inServiceIds(name, query, out.report),
				...(out.clients === undefined ? {} : { clients: out.clients }),
			};
		},
	};
}
