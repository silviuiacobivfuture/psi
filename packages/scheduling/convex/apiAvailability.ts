import { v } from "convex/values";
import {
	AVAILABILITY_LIMITS,
	entryDates,
	entryRows,
	type OneOffEntry,
	oneOffProblems,
	weeklyPlanProblems,
} from "../src/domain/availability";
import type { DayException, WeeklyRule } from "../src/domain/catalog";
import { isLocalDate } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import { actorValidator, modeValidator, serverKeyValidator } from "./validators";

/**
 * The availability editor's store (the scheduling API's `availability.*` routes): a practitioner's whole set of weekly
 * rules replaced at once, and one-off days added to one or several practitioners at once. Every mutation checks
 * everything (each practitioner is the tenant's, each set passes `weeklyPlanProblems`, each entry `oneOffProblems`
 * against what is there) BEFORE its first write, so a refusal writes nothing; a mutation is one transaction, so a
 * bulk change lands for all of them or for none. The service writes the journal event (`availability.*`).
 */

/** The most practitioners one bulk change names (the contract's `MAX_BULK_PEOPLE`). */
const MAX_BULK = 50;

const ruleValidator = v.object({
	weekday: v.number(),
	start: v.number(),
	end: v.number(),
	modes: v.array(modeValidator),
	validFrom: v.optional(v.string()),
	validUntil: v.optional(v.string()),
	week: v.optional(v.union(v.literal("A"), v.literal("B"))),
	override: v.optional(v.boolean()),
});
const entryValidator = v.object({
	from: v.string(),
	until: v.optional(v.string()),
	kind: v.union(v.literal("closed"), v.literal("open")),
	start: v.optional(v.number()),
	end: v.optional(v.number()),
	modes: v.optional(v.array(modeValidator)),
});

const ruleOut = (r: Doc<"rules">): WeeklyRule => ({
	weekday: r.weekday,
	start: r.start,
	end: r.end,
	modes: r.modes,
	...(r.validFrom === undefined ? {} : { validFrom: r.validFrom }),
	...(r.validUntil === undefined ? {} : { validUntil: r.validUntil }),
	...(r.week === undefined ? {} : { week: r.week }),
	...(r.override === true ? { override: true } : {}),
});

const exceptionOut = (e: Doc<"exceptions">) => ({
	id: e._id,
	date: e.date,
	kind: e.kind,
	...(e.start === undefined ? {} : { start: e.start }),
	...(e.end === undefined ? {} : { end: e.end }),
	...(e.modes === undefined ? {} : { modes: e.modes }),
});

function rulesOfPractitioner(ctx: QueryCtx, practitioner: Id<"practitioners">) {
	return ctx.db
		.query("rules")
		.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner))
		.collect();
}

/** The practitioners named, each the tenant's, once each; undefined when one is not (nothing is written then). */
async function practitionersOf(
	ctx: QueryCtx,
	tenant: string,
	ids: ReadonlyArray<string>,
): Promise<Doc<"practitioners">[] | undefined> {
	if (ids.length === 0 || ids.length > MAX_BULK || new Set(ids).size !== ids.length)
		return undefined;
	const found: Doc<"practitioners">[] = [];
	for (const id of ids) {
		const row = await practitionerOf(ctx, tenant, id);
		if (row === undefined) return undefined;
		found.push(row);
	}
	return found;
}

/** A practitioner's weekly rules (in weekday and start order), alternating-week anchor, and one-off days from a date on. */
export const get = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		fromDate: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.fromDate)) return REFUSED("invalid");
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return REFUSED("not_found");
		const rules = await rulesOfPractitioner(ctx, practitioner._id);
		const exceptions = await ctx.db
			.query("exceptions")
			.withIndex("by_practitioner_date", (q) =>
				q.eq("practitioner", practitioner._id).gte("date", args.fromDate),
			)
			.collect();
		return {
			ok: true as const,
			...(practitioner.abAnchor === undefined ? {} : { abAnchor: practitioner.abAnchor }),
			rules: rules
				.map(ruleOut)
				.sort((a, b) => a.weekday - b.weekday || a.start - b.start || a.end - b.end),
			exceptions: exceptions
				.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
				.map(exceptionOut),
		};
	},
});

async function replaceOne(
	ctx: MutationCtx,
	practitioner: Doc<"practitioners">,
	rules: ReadonlyArray<WeeklyRule>,
	subject: string,
): Promise<void> {
	for (const old of await rulesOfPractitioner(ctx, practitioner._id)) await ctx.db.delete(old._id);
	for (const rule of rules) {
		await ctx.db.insert("rules", {
			practitioner: practitioner._id,
			...rule,
			modes: [...new Set(rule.modes)],
			createdBy: subject,
		});
	}
}

/**
 * Replaces the weekly rules of each practitioner named with its set: all of them, or none (`not_found` when one is not
 * the tenant's, `invalid` when a set has a problem).
 */
export const replaceRules = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		sets: v.array(v.object({ practitioner: v.string(), rules: v.array(ruleValidator) })),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const people = await practitionersOf(
			ctx,
			args.tenant,
			args.sets.map((s) => s.practitioner),
		);
		if (people === undefined) return REFUSED("not_found");
		if (args.sets.some((s) => weeklyPlanProblems(s.rules).length > 0)) return REFUSED("invalid");
		for (const [i, set] of args.sets.entries()) {
			const person = people[i];
			if (person !== undefined) await replaceOne(ctx, person, set.rules, args.actor.subject);
		}
		return { ok: true as const, counts: args.sets.map((s) => s.rules.length) };
	},
});

async function dayRows(
	ctx: QueryCtx,
	practitioner: Id<"practitioners">,
	entry: OneOffEntry,
): Promise<DayException[]> {
	const dates = entryDates(entry);
	const first = dates[0] ?? entry.from;
	const last = dates[dates.length - 1] ?? entry.from;
	const rows = await ctx.db
		.query("exceptions")
		.withIndex("by_practitioner_date", (q) =>
			q.eq("practitioner", practitioner).gte("date", first).lte("date", last),
		)
		.collect();
	return rows.map((r) => ({
		date: r.date,
		kind: r.kind,
		...(r.start === undefined ? {} : { start: r.start }),
		...(r.end === undefined ? {} : { end: r.end }),
	}));
}

/** How many one-off days a practitioner keeps, up to the limit and one past it. */
async function keptCount(ctx: QueryCtx, practitioner: Id<"practitioners">): Promise<number> {
	const rows = await ctx.db
		.query("exceptions")
		.withIndex("by_practitioner_date", (q) => q.eq("practitioner", practitioner))
		.take(AVAILABILITY_LIMITS.exceptions + 1);
	return rows.length;
}

/**
 * Adds a one-off entry (one row per date) to each practitioner named: to all of them, or to none (`not_found` for a
 * practitioner that is not the tenant's, `invalid` for an entry with a problem on any of them).
 */
export const addOneOff = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		practitioners: v.array(v.string()),
		entry: entryValidator,
		timeZone: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const people = await practitionersOf(ctx, args.tenant, args.practitioners);
		if (people === undefined) return REFUSED("not_found");
		const rows = entryRows(args.entry);
		for (const person of people) {
			const existing = await dayRows(ctx, person._id, args.entry);
			const kept = await keptCount(ctx, person._id);
			if (kept + rows.length > AVAILABILITY_LIMITS.exceptions) return REFUSED("invalid");
			if (oneOffProblems(args.entry, existing, args.timeZone).length > 0) return REFUSED("invalid");
		}
		for (const person of people) {
			for (const row of rows) {
				const { modes, ...rest } = row;
				await ctx.db.insert("exceptions", {
					practitioner: person._id,
					...rest,
					...(modes === undefined ? {} : { modes: [...modes] }),
					createdBy: args.actor.subject,
				});
			}
		}
		return { ok: true as const, added: rows.length };
	},
});

/** Removes one one-off day of a practitioner of the tenant. */
export const removeOneOff = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		practitioner: v.string(),
		exception: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		const id = ctx.db.normalizeId("exceptions", args.exception);
		const row = id === null ? null : await ctx.db.get(id);
		if (practitioner === undefined || row === null || row.practitioner !== practitioner._id)
			return REFUSED("not_found");
		await ctx.db.delete(row._id);
		return { ok: true as const };
	},
});

/** One room's closed days and hours from a date on (the room must be the tenant's). */
export const roomClosures = query({
	args: { key: serverKeyValidator, tenant: v.string(), room: v.string(), fromDate: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.fromDate)) return REFUSED("invalid");
		const id = ctx.db.normalizeId("rooms", args.room);
		const room = id === null ? null : await ctx.db.get(id);
		if (room === null || room.tenant !== args.tenant) return REFUSED("not_found");
		const rows = await ctx.db
			.query("roomClosures")
			.withIndex("by_room_date", (q) => q.eq("room", room._id).gte("date", args.fromDate))
			.collect();
		return {
			ok: true as const,
			closures: rows
				.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
				.map((c) => ({
					id: c._id,
					date: c.date,
					...(c.start === undefined ? {} : { start: c.start }),
					...(c.end === undefined ? {} : { end: c.end }),
				})),
		};
	},
});
