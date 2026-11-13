import { v } from "convex/values";
import {
	appointmentsReport,
	blacklistHitsReport,
	clientsReport,
	funnelReport,
	GROUPS,
	packagesReport,
	ratesByClient,
	ratesReport,
	ratingsReport,
	utilisationReport,
} from "../src/clinic/reports";
import type {
	ReportBlacklistEvent,
	ReportBlock,
	ReportFeedback,
	ReportPackage,
	ReportRosterDay,
	ReportWebRequest,
} from "../src/clinic/reports/types";
import { query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import {
	calendarIn,
	entryOfVisit,
	filterArgs,
	filterOf,
	MAX_ROWS,
	openRange,
	rangeArgs,
	visitsIn,
} from "./reportRows";
import { serverKeyValidator } from "./validators";

/**
 * Read-only reports for the staff API, one query per report (src/clinic/reports). The API checks
 * the permission first (`REPORTS` says which: `reports_view_all_core`; revenue, the only report
 * with money, is in `apiReportsMoney.ts` and needs `reports_view_all_money`). Every query takes a
 * range `[from, to)` of at most a year and a day, the app's zone does the bucketing, and a query
 * that would read too much refuses (`too_many_rows`) rather than answer from part of the data.
 * Nothing here writes, and nothing returns a name, a contact or a text.
 */
const TOO_MANY = REFUSED("too_many_rows");
const base = { key: serverKeyValidator, tenant: v.string(), ...rangeArgs };

export const appointments = query({
	args: {
		...base,
		...filterArgs,
		group: v.union(...GROUPS.map((g) => v.literal(g))),
		statuses: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await calendarIn(ctx, args.tenant, opened.range);
		if (rows === null) return TOO_MANY;
		const statuses = (args.statuses ?? []).filter(
			(s): s is "held" | "requested" | "confirmed" | "cancelled" | "declined" | "expired" =>
				["held", "requested", "confirmed", "cancelled", "declined", "expired"].includes(s),
		);
		if (statuses.length !== (args.statuses ?? []).length) return REFUSED("invalid");
		const report = appointmentsReport(rows, opened.range, args.granularity, args.group, {
			...filterOf(args),
			...(statuses.length === 0 ? {} : { statuses }),
		});
		return { ok: true as const, timeZone: opened.range.zone, report };
	},
});

export const utilisation = query({
	args: base,
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const { range } = opened;
		// A visit that started the day before can run into the range (no visit lasts a day): read it too.
		const visits = await visitsIn(ctx, args.tenant, { ...range, from: range.from - 86_400_000 });
		if (visits === null) return TOO_MANY;
		const roster = await ctx.db
			.query("rosterDays")
			.withIndex("by_tenant_date", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		if (roster.length > MAX_ROWS) return TOO_MANY;
		const blocks = await ctx.db
			.query("staffBlocks")
			.withIndex("by_tenant_person_start", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		if (blocks.length > MAX_ROWS) return TOO_MANY;
		const days: ReportRosterDay[] = roster.map((d) => ({
			person: { kind: d.person.kind, id: d.person.id },
			date: d.date,
			entry:
				d.status === "works"
					? { status: "works", startMinutes: d.startMinutes ?? 0, endMinutes: d.endMinutes ?? 0 }
					: { status: d.status },
		}));
		const blocked: ReportBlock[] = blocks.map((b) => ({
			person: { kind: b.person.kind, id: b.person.id },
			dateStart: b.dateStart,
			dateEnd: b.dateEnd,
		}));
		return {
			ok: true as const,
			timeZone: range.zone,
			report: utilisationReport(visits.map(entryOfVisit), days, blocked, range),
		};
	},
});

export const rates = query({
	args: {
		...base,
		...filterArgs,
		byClient: v.optional(v.boolean()),
		minBookings: v.optional(v.number()),
		now: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await calendarIn(ctx, args.tenant, opened.range);
		if (rows === null) return TOO_MANY;
		const now = args.now ?? Date.now();
		const filter = filterOf(args);
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: ratesReport(rows, opened.range, now, filter),
			...(args.byClient === true
				? {
						clients: ratesByClient(rows, opened.range, now, {
							filter,
							minBookings: Math.max(1, Math.floor(args.minBookings ?? 1)),
						}).slice(0, 200),
					}
				: {}),
		};
	},
});

export const clients = query({
	args: { ...base, ...filterArgs },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await calendarIn(ctx, args.tenant, opened.range);
		if (rows === null) return TOO_MANY;
		const named = new Set(
			rows
				.filter((r) => r.status === "confirmed" && r.client !== undefined)
				.map((r) => r.client ?? ""),
		);
		// Who had a confirmed visit before the range: one indexed read per client of the range.
		const prior = new Set<string>();
		for (const client of named) {
			const id = ctx.db.normalizeId("clients", client);
			if (id === null) continue;
			const earlier = await ctx.db
				.query("visits")
				.withIndex("by_tenant_client_start", (q) =>
					q.eq("tenant", args.tenant).eq("client", id).lt("start", opened.range.from),
				)
				.filter((q) => q.eq(q.field("status"), "confirmed"))
				.first();
			if (earlier !== null) prior.add(client);
		}
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: clientsReport(rows, prior, opened.range, args.granularity, filterOf(args)),
		};
	},
});

export const packages = query({
	args: { ...base, now: v.optional(v.number()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const stored = await ctx.db
			.query("packages")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant))
			.take(2_001);
		if (stored.length > 2_000) return TOO_MANY;
		const list: ReportPackage[] = stored.map((p) => ({
			id: p._id,
			client: p.client,
			sessionType: p.sessionType,
			totalSessions: p.totalSessions,
			bonusSessions: p.bonusSessions,
			priceMinor: 0,
			createdAt: p.createdAt,
		}));
		const linked = [];
		for (const p of stored) {
			const visits = await ctx.db
				.query("visits")
				.withIndex("by_tenant_package_start", (q) =>
					q.eq("tenant", args.tenant).eq("package", p._id),
				)
				.take(2_001);
			if (visits.length > 2_000) return TOO_MANY;
			linked.push(...visits.filter((x) => x.deletedAt === undefined).map(entryOfVisit));
		}
		if (linked.length > MAX_ROWS) return TOO_MANY;
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: packagesReport(list, linked, opened.range, args.granularity, args.now ?? Date.now()),
		};
	},
});

export const funnel = query({
	args: base,
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_created", (q) =>
				q.eq("tenant", args.tenant).gte("_creationTime", args.from).lt("_creationTime", args.to),
			)
			.take(MAX_ROWS + 1);
		if (rows.length > MAX_ROWS) return TOO_MANY;
		const requests: ReportWebRequest[] = rows.map((r) => ({
			created: r._creationTime,
			channel: r.channel,
			status: r.status,
			...(r.submittedAt === undefined ? {} : { submittedAt: r.submittedAt }),
		}));
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: funnelReport(requests, opened.range, args.granularity),
		};
	},
});

export const ratings = query({
	args: base,
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await ctx.db
			.query("feedback")
			.withIndex("by_tenant_created", (q) =>
				q.eq("tenant", args.tenant).gte("createdAt", args.from).lt("createdAt", args.to),
			)
			.take(5_001);
		if (rows.length > 5_000) return TOO_MANY;
		const items: ReportFeedback[] = [];
		for (const f of rows) {
			let practitioner: string | undefined;
			if (f.visit !== undefined) {
				const visit = await ctx.db.get(f.visit);
				if (visit?.column.kind === "practitioner") practitioner = visit.column.id;
			} else if (f.appointment !== undefined) {
				practitioner = (await ctx.db.get(f.appointment))?.practitioner;
			}
			items.push({
				kind: f.kind,
				createdAt: f.createdAt,
				status: f.status,
				...(f.rating === undefined ? {} : { rating: f.rating }),
				...(practitioner === undefined ? {} : { practitioner }),
			});
		}
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: ratingsReport(items, opened.range, args.granularity),
		};
	},
});

export const blacklistHits = query({
	args: base,
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const rows = await ctx.db
			.query("blacklistEvents")
			.withIndex("by_tenant_at", (q) =>
				q.eq("tenant", args.tenant).gte("at", args.from).lt("at", args.to),
			)
			.take(MAX_ROWS + 1);
		if (rows.length > MAX_ROWS) return TOO_MANY;
		const events: ReportBlacklistEvent[] = rows.map((e) => ({
			at: e.at,
			kind: e.kind,
			entry: e.entry,
			severity: e.severity,
			category: e.category,
			matchedBy: e.matchedBy,
			channel: e.channel,
			...(e.authority === undefined ? {} : { authority: e.authority }),
		}));
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: blacklistHitsReport(events, opened.range, args.granularity),
		};
	},
});
