import { v } from "convex/values";
import { GRANULARITIES, rangeProblem } from "../src/clinic/reports";
import type { Range, ReportAppointment } from "../src/clinic/reports/types";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * What the report queries share: the range arguments, the app's zone, and the mapping of stored
 * rows into the report functions' shapes. Reports only read. A query that would read more rows than
 * one transaction may (Convex stops a query at 16,384 documents) refuses with `too_many_rows`
 * instead of answering from part of the data.
 */
export const MAX_ROWS = 12_000;

export const rangeArgs = {
	from: v.number(),
	to: v.number(),
	granularity: v.union(...GRANULARITIES.map((g) => v.literal(g))),
};

export const filterArgs = {
	practitioner: v.optional(v.string()),
	room: v.optional(v.string()),
	device: v.optional(v.string()),
	service: v.optional(v.string()),
	client: v.optional(v.string()),
	source: v.optional(v.union(v.literal("visit"), v.literal("web"))),
};

export type Opened = { ok: true; range: Range } | { ok: false; reason: string };

/** The range in the app's zone, or why the report cannot be run. */
export async function openRange(
	ctx: QueryCtx,
	tenant: string,
	from: number,
	to: number,
): Promise<Opened> {
	const row = await ctx.db
		.query("tenants")
		.withIndex("by_slug", (q) => q.eq("slug", tenant))
		.unique();
	if (row === null) return { ok: false, reason: "unknown_tenant" };
	const range: Range = { from, to, zone: row.timeZone };
	const problem = rangeProblem(range);
	return problem === undefined ? { ok: true, range } : { ok: false, reason: problem };
}

/** The filter the pure functions take, from the arguments that were given. */
export function filterOf(a: {
	practitioner?: string | undefined;
	room?: string | undefined;
	device?: string | undefined;
	service?: string | undefined;
	client?: string | undefined;
	source?: "visit" | "web" | undefined;
}) {
	return {
		...(a.practitioner === undefined ? {} : { practitioner: a.practitioner }),
		...(a.room === undefined ? {} : { room: a.room }),
		...(a.device === undefined ? {} : { device: a.device }),
		...(a.service === undefined ? {} : { service: a.service }),
		...(a.client === undefined ? {} : { client: a.client }),
		...(a.source === undefined ? {} : { source: a.source }),
	};
}

/** A staff-made visit as a calendar entry. */
export function entryOfVisit(x: Doc<"visits">): ReportAppointment {
	const room = x.room ?? (x.column.kind === "room" ? x.column.id : undefined);
	const device = x.device ?? (x.column.kind === "device" ? x.column.id : undefined);
	return {
		id: x._id,
		source: "visit",
		start: x.start,
		end: x.end,
		status: x.status,
		attendance: x.attendance,
		service: x.sessionType,
		...(x.column.kind === "practitioner" ? { practitioner: x.column.id } : {}),
		...(room === undefined ? {} : { room }),
		...(device === undefined ? {} : { device }),
		...(x.client === undefined ? {} : { client: x.client }),
		...(x.package === undefined ? {} : { package: x.package }),
		...(x.creditType === undefined ? {} : { creditType: x.creditType }),
	};
}

/** The staff-made visits starting in the range (not soft-deleted), or null when there are too many to read. */
export async function visitsIn(
	ctx: QueryCtx,
	tenant: string,
	range: Range,
): Promise<ReadonlyArray<Doc<"visits">> | null> {
	const rows = await ctx.db
		.query("visits")
		.withIndex("by_tenant_start", (q) =>
			q.eq("tenant", tenant).gte("start", range.from).lt("start", range.to),
		)
		.take(MAX_ROWS + 1);
	return rows.length > MAX_ROWS ? null : rows.filter((r) => r.deletedAt === undefined);
}

/** The public bookings starting in the range, as calendar entries, or null when there are too many. */
export async function webIn(
	ctx: QueryCtx,
	tenant: string,
	range: Range,
): Promise<ReadonlyArray<ReportAppointment> | null> {
	const rows = await ctx.db
		.query("appointments")
		.withIndex("by_tenant_start", (q) =>
			q.eq("tenant", tenant).gte("start", range.from).lt("start", range.to),
		)
		.take(MAX_ROWS + 1);
	if (rows.length > MAX_ROWS) return null;
	const services = new Map<string, string>();
	const out: ReportAppointment[] = [];
	for (const r of rows) {
		let slug = services.get(r.service);
		if (slug === undefined) {
			slug = (await ctx.db.get(r.service))?.slug ?? "unknown";
			services.set(r.service, slug);
		}
		out.push({
			id: r._id,
			source: "web",
			start: r.start,
			end: r.end,
			status: r.status,
			service: slug,
			practitioner: r.practitioner,
			...(r.room === undefined ? {} : { room: r.room }),
			...(r.client === undefined ? {} : { client: r.client }),
		});
	}
	return out;
}

/** Visits and public bookings together: the calendar of the range. */
export async function calendarIn(
	ctx: QueryCtx,
	tenant: string,
	range: Range,
): Promise<ReadonlyArray<ReportAppointment> | null> {
	const visits = await visitsIn(ctx, tenant, range);
	const web = await webIn(ctx, tenant, range);
	return visits === null || web === null ? null : [...visits.map(entryOfVisit), ...web];
}
