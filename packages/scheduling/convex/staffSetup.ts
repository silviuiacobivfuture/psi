import { v } from "convex/values";
import { ruleProblem, serviceProblem } from "../src/domain/catalog";
import { ROOM_KINDS } from "../src/domain/rooms";
import { addDays, isLocalDate } from "../src/domain/time";
import { mutation } from "./_generated/server";
import { requireServer } from "./guard";
import {
	cleanName,
	cleanText,
	ensureTenantRow,
	practitionerOf,
	SLUG,
	sameModes,
	tenantPractitioners,
} from "./setupSupport";
import {
	actorValidator,
	audienceValidator,
	modeValidator,
	serverKeyValidator,
	serviceNameValidator,
} from "./validators";

/**
 * The team's setup of a tenant's catalog: practitioners, services, the regular week and days off.
 * Production starts empty (nothing is seeded there), so the first create here also brings the
 * tenant's row into being. Nothing is ever deleted that an appointment may point to: a
 * practitioner or a service is taken offline, not removed. Every change records the staff subject
 * the app gave (the app calls these only after OpenFGA allowed them, plan §5). Each answer is a
 * result (`ok` or a reason); a refused call writes nothing.
 */

const MAX_WINDOWS_PER_DAY = 8;
const MAX_DAYS_OFF = 62;
const MAX_TEAM = 20;

/** Adds a practitioner. The same slug and name again is the one already there. */
export const createPractitioner = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		slug: v.string(),
		displayName: v.string(),
		/** A contractor rather than an employee. */
		external: v.optional(v.boolean()),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const displayName = cleanText(args.displayName);
		if (!SLUG.test(args.tenant) || !SLUG.test(args.slug) || displayName === undefined) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const found = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.slug))
			.unique();
		if (found !== null) {
			return found.displayName === displayName &&
				(found.external ?? false) === (args.external ?? false)
				? { ok: true as const, id: found._id, created: false }
				: { ok: false as const, reason: "exists" as const };
		}
		await ensureTenantRow(ctx, args.tenant);
		const id = await ctx.db.insert("practitioners", {
			tenant: args.tenant,
			slug: args.slug,
			displayName,
			active: true,
			...(args.external === true ? { external: true } : {}),
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		return { ok: true as const, id, created: true };
	},
});

/**
 * Renames a practitioner or takes them offline (or back). `upcoming` is how many requests and
 * confirmed appointments still lie ahead of them: taking someone offline hides their free times
 * but leaves those untouched, and the team should know.
 */
export const updatePractitioner = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		patch: v.object({
			displayName: v.optional(v.string()),
			active: v.optional(v.boolean()),
			external: v.optional(v.boolean()),
			/** The rooms this person may use; empty means any suitable room. */
			rooms: v.optional(v.array(v.string())),
		}),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (row === undefined) return { ok: false as const, reason: "not_found" as const };
		const displayName =
			args.patch.displayName === undefined ? row.displayName : cleanText(args.patch.displayName);
		if (displayName === undefined) return { ok: false as const, reason: "invalid" as const };
		let rooms = row.rooms;
		if (args.patch.rooms !== undefined) {
			const ids = [];
			for (const r of new Set(args.patch.rooms)) {
				const id = ctx.db.normalizeId("rooms", r);
				const room = id === null ? null : await ctx.db.get(id);
				if (id === null || room === null || room.tenant !== args.tenant) {
					return { ok: false as const, reason: "invalid" as const };
				}
				ids.push(id);
			}
			rooms = ids;
		}
		const now = Date.now();
		await ctx.db.patch(row._id, {
			displayName,
			active: args.patch.active ?? row.active,
			...(args.patch.external === undefined ? {} : { external: args.patch.external }),
			...(rooms === undefined ? {} : { rooms }),
			updatedBy: args.actor.subject,
			updatedAt: now,
		});
		const ahead = await ctx.db
			.query("appointments")
			.withIndex("by_practitioner_start", (q) => q.eq("practitioner", row._id).gte("start", now))
			.take(500);
		const upcoming = ahead.filter((a) => a.status === "requested" || a.status === "confirmed");
		return { ok: true as const, upcoming: upcoming.length };
	},
});

/**
 * Adds a service. The slug is its key for good (the sites name it); the name is shown in both
 * languages. The same slug with the same settings is the one already there.
 */
export const createService = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		slug: v.string(),
		name: serviceNameValidator,
		durationMinutes: v.number(),
		bufferMinutes: v.number(),
		stepMinutes: v.number(),
		minNoticeMinutes: v.number(),
		horizonDays: v.number(),
		holdMinutes: v.number(),
		modes: v.array(modeValidator),
		location: v.optional(v.string()),
		practitioners: v.array(v.string()),
		/** An onsite session needs a room of this kind; absent: no room. */
		roomKind: v.optional(v.string()),
		roomEquipment: v.optional(v.array(v.string())),
		roomAudiences: v.optional(v.array(audienceValidator)),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const name = cleanName(args.name);
		const modes = [...new Set(args.modes)];
		const location = args.location?.trim();
		const spec = { ...args, modes };
		if (
			!SLUG.test(args.tenant) ||
			!SLUG.test(args.slug) ||
			name === undefined ||
			serviceProblem(spec) !== undefined ||
			(location !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(location)) ||
			(args.roomKind !== undefined && !ROOM_KINDS.some((k) => k === args.roomKind))
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const practitioners = await tenantPractitioners(ctx, args.tenant, args.practitioners);
		if (practitioners === undefined) return { ok: false as const, reason: "invalid" as const };
		const found = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.slug))
			.unique();
		if (found !== null) {
			const same =
				found.name?.ro === name.ro &&
				found.name.en === name.en &&
				found.durationMinutes === args.durationMinutes &&
				found.bufferMinutes === args.bufferMinutes &&
				found.stepMinutes === args.stepMinutes &&
				found.minNoticeMinutes === args.minNoticeMinutes &&
				found.horizonDays === args.horizonDays &&
				found.holdMinutes === args.holdMinutes &&
				found.location === location &&
				sameModes(found.modes, modes) &&
				found.practitioners.length === practitioners.length &&
				found.practitioners.every((p) => practitioners.includes(p));
			return same
				? { ok: true as const, id: found._id, created: false }
				: { ok: false as const, reason: "exists" as const };
		}
		await ensureTenantRow(ctx, args.tenant);
		const id = await ctx.db.insert("services", {
			tenant: args.tenant,
			slug: args.slug,
			name,
			durationMinutes: args.durationMinutes,
			bufferMinutes: args.bufferMinutes,
			stepMinutes: args.stepMinutes,
			minNoticeMinutes: args.minNoticeMinutes,
			horizonDays: args.horizonDays,
			holdMinutes: args.holdMinutes,
			modes,
			...(location === undefined || location === "" ? {} : { location }),
			practitioners,
			active: true,
			...(args.roomKind === undefined
				? {}
				: {
						roomKind: args.roomKind,
						roomEquipment: args.roomEquipment ?? [],
						roomAudiences: args.roomAudiences ?? [],
					}),
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		return { ok: true as const, id, created: true };
	},
});

/**
 * Sets the regular hours of one or several weekdays at once: the windows given replace the
 * practitioner's regular openings on those days (no windows closes them). Openings that apply
 * only between two dates are not touched. Windows must not overlap (touching is fine).
 */
export const setDayRules = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		weekdays: v.array(v.number()),
		windows: v.array(
			v.object({ start: v.number(), end: v.number(), modes: v.array(modeValidator) }),
		),
		/** Only the alternating week A or B (see `setAlternating`); absent: the every-week pattern. */
		week: v.optional(v.union(v.literal("A"), v.literal("B"))),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		if (args.week !== undefined && practitioner.abAnchor === undefined) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const weekdays = [...new Set(args.weekdays)];
		const windows = args.windows
			.map((w) => ({ start: w.start, end: w.end, modes: [...new Set(w.modes)] }))
			.sort((a, b) => a.start - b.start);
		const sound =
			weekdays.length > 0 &&
			weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
			windows.length <= MAX_WINDOWS_PER_DAY &&
			weekdays.every((weekday) =>
				windows.every((w) => ruleProblem({ weekday, ...w }) === undefined),
			) &&
			windows.every((w, i) => i === 0 || (windows[i - 1]?.end ?? 0) <= w.start);
		if (!sound) return { ok: false as const, reason: "invalid" as const };
		const existing = await ctx.db
			.query("rules")
			.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
			.collect();
		const regular = existing.filter(
			(r) =>
				weekdays.includes(r.weekday) &&
				r.validFrom === undefined &&
				r.validUntil === undefined &&
				r.override !== true &&
				r.week === args.week,
		);
		// Keep a regular opening that is already exactly one of the windows: nothing to rewrite.
		const kept = new Set<string>();
		let added = 0;
		for (const weekday of weekdays) {
			for (const w of windows) {
				const same = regular.find(
					(r) =>
						r.weekday === weekday &&
						r.start === w.start &&
						r.end === w.end &&
						sameModes(r.modes, w.modes) &&
						!kept.has(r._id),
				);
				if (same !== undefined) {
					kept.add(same._id);
					continue;
				}
				await ctx.db.insert("rules", {
					practitioner: practitioner._id,
					weekday,
					...w,
					...(args.week === undefined ? {} : { week: args.week }),
					createdBy: args.actor.subject,
				});
				added += 1;
			}
		}
		let removed = 0;
		for (const r of regular) {
			if (kept.has(r._id)) continue;
			await ctx.db.delete(r._id);
			removed += 1;
		}
		return { ok: true as const, added, removed };
	},
});

/**
 * Closes whole days, `from` to `to` inclusive (at most 62), for the practitioners named: a
 * holiday, a day off, a leave. A day already closed for someone is left as it is, so sending the
 * same range again adds nothing.
 */
export const addDaysOff = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioners: v.array(v.string()),
		from: v.string(),
		to: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.from) || !isLocalDate(args.to) || args.from > args.to) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const days: string[] = [];
		for (let d = args.from; d <= args.to && days.length <= MAX_DAYS_OFF; d = addDays(d, 1)) {
			days.push(d);
		}
		if (days.length > MAX_DAYS_OFF || args.practitioners.length > MAX_TEAM) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const ids = await tenantPractitioners(ctx, args.tenant, args.practitioners);
		if (ids === undefined || ids.length === 0) {
			return { ok: false as const, reason: "not_found" as const };
		}
		let added = 0;
		for (const practitioner of ids) {
			const existing = await ctx.db
				.query("exceptions")
				.withIndex("by_practitioner_date", (q) =>
					q.eq("practitioner", practitioner).gte("date", args.from).lte("date", args.to),
				)
				.collect();
			const closed = new Set(
				existing.filter((e) => e.kind === "closed" && e.start === undefined).map((e) => e.date),
			);
			for (const date of days) {
				if (closed.has(date)) continue;
				await ctx.db.insert("exceptions", {
					practitioner,
					date,
					kind: "closed",
					createdBy: args.actor.subject,
				});
				added += 1;
			}
		}
		return { ok: true as const, added };
	},
});
