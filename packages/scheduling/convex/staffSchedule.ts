import { v } from "convex/values";
import { ruleProblem } from "../src/domain/catalog";
import { isLocalDate, weekdayOf } from "../src/domain/time";
import { mutation } from "./_generated/server";
import { requireServer } from "./guard";
import { practitionerOf, sameModes } from "./setupSupport";
import { actorValidator, modeValidator, serverKeyValidator } from "./validators";

/**
 * Schedules that change: alternating weeks A and B, and period schedules (hours that replace the
 * regular week between two dates: a school holiday, a summer rota). Dates and weeks are wall
 * time in the tenant's zone, so a daylight-saving change never moves them (the slot logic in
 * `src/domain/slots.ts` does the counting). One-off extra hours on a date and days off stay what
 * they were (`staff.addException`, `staffSetup.addDaysOff`).
 */

const MAX_WINDOWS = 8;
const windowValidator = v.object({
	start: v.number(),
	end: v.number(),
	modes: v.array(modeValidator),
});

/**
 * Turns alternating weeks on (`anchor`, a Monday: its week is A) or off (`null`). Turning on makes
 * every regular opening part of both weeks, so nothing changes until the team edits one of them;
 * turning off keeps week A's openings as the every-week pattern and drops week B's. Moving the
 * anchor swaps which calendar weeks are A and B.
 */
export const setAlternating = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		anchor: v.union(v.string(), v.null()),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		if (args.anchor !== null && (!isLocalDate(args.anchor) || weekdayOf(args.anchor) !== 1)) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const rules = await ctx.db
			.query("rules")
			.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
			.collect();
		const was = practitioner.abAnchor !== undefined;
		if (args.anchor !== null && !was) {
			for (const r of rules.filter(
				(x) =>
					x.week === undefined &&
					x.override !== true &&
					x.validFrom === undefined &&
					x.validUntil === undefined,
			)) {
				const { _id, _creationTime, ...rest } = r;
				await ctx.db.patch(_id, { week: "A" });
				await ctx.db.insert("rules", { ...rest, week: "B", createdBy: args.actor.subject });
			}
		}
		if (args.anchor === null && was) {
			for (const r of rules) {
				if (r.week === "B") await ctx.db.delete(r._id);
				else if (r.week === "A") await ctx.db.patch(r._id, { week: undefined });
			}
		}
		await ctx.db.patch(practitioner._id, {
			abAnchor: args.anchor ?? undefined,
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		return { ok: true as const };
	},
});

/**
 * Sets a period schedule: from `from` to `until` (open-ended without it) the practitioner's hours
 * are exactly these days and windows; a weekday not listed is closed. The same `from` again
 * replaces the period, so repeating a call changes nothing. Alternating weeks apply inside a
 * period when `week` is given.
 */
export const setPeriod = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		from: v.string(),
		until: v.optional(v.string()),
		days: v.array(v.object({ weekday: v.number(), windows: v.array(windowValidator) })),
		week: v.optional(v.union(v.literal("A"), v.literal("B"))),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		const rows = args.days.flatMap((d) =>
			d.windows.map((w) => ({
				weekday: d.weekday,
				start: w.start,
				end: w.end,
				modes: [...new Set(w.modes)],
			})),
		);
		const perDay = new Map<number, typeof rows>();
		for (const r of rows) perDay.set(r.weekday, [...(perDay.get(r.weekday) ?? []), r]);
		const sound =
			isLocalDate(args.from) &&
			(args.until === undefined || (isLocalDate(args.until) && args.until >= args.from)) &&
			(args.week === undefined || practitioner.abAnchor !== undefined) &&
			rows.length > 0 &&
			rows.length <= MAX_WINDOWS * 7 &&
			rows.every(
				(r) =>
					ruleProblem({
						...r,
						validFrom: args.from,
						...(args.until === undefined ? {} : { validUntil: args.until }),
						override: true,
					}) === undefined,
			) &&
			[...perDay.values()].every((list) => {
				const sorted = [...list].sort((a, b) => a.start - b.start);
				return sorted.every((w, i) => i === 0 || (sorted[i - 1]?.end ?? 0) <= w.start);
			});
		if (!sound) return { ok: false as const, reason: "invalid" as const };
		const existing = (
			await ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
				.collect()
		).filter((r) => r.override === true && r.validFrom === args.from && r.week === args.week);
		const kept = new Set<string>();
		let added = 0;
		for (const r of rows) {
			const same = existing.find(
				(e) =>
					e.weekday === r.weekday &&
					e.start === r.start &&
					e.end === r.end &&
					e.validUntil === args.until &&
					sameModes(e.modes, r.modes) &&
					!kept.has(e._id),
			);
			if (same !== undefined) {
				kept.add(same._id);
				continue;
			}
			await ctx.db.insert("rules", {
				practitioner: practitioner._id,
				...r,
				validFrom: args.from,
				...(args.until === undefined ? {} : { validUntil: args.until }),
				override: true,
				...(args.week === undefined ? {} : { week: args.week }),
				createdBy: args.actor.subject,
			});
			added += 1;
		}
		let removed = 0;
		for (const e of existing) {
			if (kept.has(e._id)) continue;
			await ctx.db.delete(e._id);
			removed += 1;
		}
		return { ok: true as const, added, removed };
	},
});

/** Removes a period schedule by its start date (every week variant of it). */
export const removePeriod = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		from: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		const rows = (
			await ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
				.collect()
		).filter((r) => r.override === true && r.validFrom === args.from);
		if (rows.length === 0) return { ok: false as const, reason: "not_found" as const };
		for (const r of rows) await ctx.db.delete(r._id);
		return { ok: true as const, removed: rows.length };
	},
});
