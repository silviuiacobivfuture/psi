import type { Busy, DayException, ServiceSpec, WeeklyRule } from "../src/domain/catalog";
import { busyFrom } from "../src/domain/conflicts";
import { addDays, MINUTE_MS, toLocal } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Reading one practitioner's calendar inside a query or a mutation. In a mutation these reads
 * are what Convex's optimistic concurrency checks at commit: a hold that read a range of
 * appointments fails and retries if another transaction wrote into that range first.
 */

/** The longest span one appointment can block (480 min session + 240 min buffer). */
export const MAX_BLOCK_MS = 720 * MINUTE_MS;

export function serviceSpec(service: Doc<"services">): ServiceSpec {
	return {
		durationMinutes: service.durationMinutes,
		bufferMinutes: service.bufferMinutes,
		stepMinutes: service.stepMinutes,
		minNoticeMinutes: service.minNoticeMinutes,
		horizonDays: service.horizonDays,
		holdMinutes: service.holdMinutes,
		modes: service.modes,
	};
}

export async function tenantBySlug(
	ctx: QueryCtx,
	slug: string,
): Promise<Doc<"tenants"> | undefined> {
	const tenant = await ctx.db
		.query("tenants")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	return tenant === null || !tenant.active ? undefined : tenant;
}

export async function serviceBySlug(
	ctx: QueryCtx,
	tenant: string,
	slug: string,
): Promise<Doc<"services"> | undefined> {
	const service = await ctx.db
		.query("services")
		.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant).eq("slug", slug))
		.unique();
	return service === null || !service.active ? undefined : service;
}

export async function rulesOf(
	ctx: QueryCtx,
	practitioner: Id<"practitioners">,
): Promise<ReadonlyArray<WeeklyRule>> {
	const rows = await ctx.db
		.query("rules")
		.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner))
		.collect();
	return rows.map((row) => ({
		weekday: row.weekday,
		start: row.start,
		end: row.end,
		modes: row.modes,
		...(row.validFrom === undefined ? {} : { validFrom: row.validFrom }),
		...(row.validUntil === undefined ? {} : { validUntil: row.validUntil }),
		...(row.week === undefined ? {} : { week: row.week }),
		...(row.override === true ? { override: true } : {}),
	}));
}

/** The exceptions on the local dates [from, to] (inclusive), one day of margin on each side. */
export async function exceptionsOf(
	ctx: QueryCtx,
	practitioner: Id<"practitioners">,
	from: number,
	to: number,
	timeZone: string,
): Promise<ReadonlyArray<DayException>> {
	const first = addDays(toLocal(from, timeZone).date, -1);
	const last = addDays(toLocal(to, timeZone).date, 1);
	const rows = await ctx.db
		.query("exceptions")
		.withIndex("by_practitioner_date", (q) =>
			q.eq("practitioner", practitioner).gte("date", first).lte("date", last),
		)
		.collect();
	return rows.map((row) => ({
		date: row.date,
		kind: row.kind,
		...(row.start === undefined ? {} : { start: row.start }),
		...(row.end === undefined ? {} : { end: row.end }),
		...(row.modes === undefined ? {} : { modes: row.modes }),
	}));
}

/** Every appointment that could overlap [from, to): those starting from `MAX_BLOCK_MS` earlier. */
export async function appointmentsAround(
	ctx: QueryCtx,
	practitioner: Id<"practitioners">,
	from: number,
	to: number,
): Promise<ReadonlyArray<Doc<"appointments">>> {
	return ctx.db
		.query("appointments")
		.withIndex("by_practitioner_start", (q) =>
			q
				.eq("practitioner", practitioner)
				.gte("start", from - MAX_BLOCK_MS)
				.lt("start", to),
		)
		.collect();
}

/**
 * The staff-made visits that could overlap [from, to) on a column of the calendar (`practitioner:<id>`,
 * `room:<id>`, `device:<id>`), as busy spans. Live visits only: a cancelled one frees its time.
 */
export async function visitBusyOnColumn(
	ctx: QueryCtx,
	tenant: string,
	columnKey: string,
	from: number,
	to: number,
	now: number,
): Promise<ReadonlyArray<Busy>> {
	const rows = await ctx.db
		.query("visits")
		.withIndex("by_tenant_column_start", (q) =>
			q
				.eq("tenant", tenant)
				.eq("columnKey", columnKey)
				.gte("start", from - MAX_BLOCK_MS)
				.lt("start", to),
		)
		.collect();
	return busyFrom(
		rows.map((v) => ({ status: v.status, start: v.start, blockedUntil: v.end })),
		now,
	);
}

/**
 * What blocks [from, to) at `now`: the practitioner's web appointments (excluding one, the one being
 * rescheduled) AND their staff-made visits, so the public flow can never take a time the team has
 * already given away. Read in the same transaction as the hold, so the two cannot race.
 */
export async function busyAround(
	ctx: QueryCtx,
	practitioner: Id<"practitioners">,
	from: number,
	to: number,
	now: number,
	except?: Id<"appointments">,
): Promise<ReadonlyArray<Busy>> {
	const rows = await appointmentsAround(ctx, practitioner, from, to);
	const person = await ctx.db.get(practitioner);
	const visits =
		person === null
			? []
			: await visitBusyOnColumn(ctx, person.tenant, `practitioner:${practitioner}`, from, to, now);
	return [
		...busyFrom(
			rows
				.filter((row) => row._id !== except)
				.map((row) => ({
					status: row.status,
					start: row.start,
					blockedUntil: row.blockedUntil,
					...(row.holdExpiresAt === undefined ? {} : { holdExpiresAt: row.holdExpiresAt }),
				})),
			now,
		),
		...visits,
	];
}

export async function appointmentByReference(
	ctx: QueryCtx,
	reference: string,
): Promise<Doc<"appointments"> | undefined> {
	const row = await ctx.db
		.query("appointments")
		.withIndex("by_reference", (q) => q.eq("reference", reference))
		.unique();
	return row ?? undefined;
}
