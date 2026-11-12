import { v } from "convex/values";
import { ruleProblem, serviceProblem } from "../src/domain/catalog";
import { ROOM_KINDS } from "../src/domain/rooms";
import { isLocalDate } from "../src/domain/time";
import { mutation, query } from "./_generated/server";
import { serviceSpec, tenantBySlug } from "./calendar";
import { requireServer } from "./guard";
import { cleanName, practitionerOf, sameModes, tenantPractitioners } from "./setupSupport";
import {
	actorValidator,
	audienceValidator,
	modeValidator,
	serverKeyValidator,
	serviceNameValidator,
} from "./validators";

/**
 * The team's view of a tenant's catalog: its practitioners, services, weekly rules and exceptions,
 * inactive rows included (staff see everything; visitors see only `catalog.services`). The app
 * calls these only after OpenFGA allowed the staff member (plan §5); nothing here is clinical.
 */

/** Every practitioner and service of the tenant, active or not. */
export const catalog = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		if (tenant === undefined) return { ok: false as const, reason: "unknown_tenant" as const };
		const [practitioners, services] = await Promise.all([
			ctx.db
				.query("practitioners")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
				.collect(),
			ctx.db
				.query("services")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
				.collect(),
		]);
		return {
			ok: true as const,
			timeZone: tenant.timeZone,
			practitioners: practitioners.map((p) => ({
				id: p._id,
				slug: p.slug,
				displayName: p.displayName,
				active: p.active,
				...(p.updatedBy === undefined ? {} : { updatedBy: p.updatedBy }),
				...(p.updatedAt === undefined ? {} : { updatedAt: p.updatedAt }),
				...(p.external === true ? { external: true } : {}),
				...(p.rooms === undefined || p.rooms.length === 0 ? {} : { rooms: p.rooms }),
				...(p.abAnchor === undefined ? {} : { abAnchor: p.abAnchor }),
			})),
			services: services.map((s) => ({
				id: s._id,
				slug: s.slug,
				durationMinutes: s.durationMinutes,
				bufferMinutes: s.bufferMinutes,
				stepMinutes: s.stepMinutes,
				minNoticeMinutes: s.minNoticeMinutes,
				horizonDays: s.horizonDays,
				holdMinutes: s.holdMinutes,
				modes: s.modes,
				...(s.location === undefined ? {} : { location: s.location }),
				practitioners: s.practitioners,
				active: s.active,
				...(s.name === undefined ? {} : { name: s.name }),
				...(s.roomKind === undefined
					? {}
					: {
							roomKind: s.roomKind,
							roomEquipment: s.roomEquipment ?? [],
							roomAudiences: s.roomAudiences ?? [],
						}),
				...(s.updatedBy === undefined ? {} : { updatedBy: s.updatedBy }),
				...(s.updatedAt === undefined ? {} : { updatedAt: s.updatedAt }),
			})),
		};
	},
});

/** One practitioner's weekly rules, and their exceptions from `fromDate` on, in date order. */
export const availability = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		fromDate: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!isLocalDate(args.fromDate)) return { ok: false as const, reason: "invalid" as const };
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		const [rules, exceptions] = await Promise.all([
			ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
				.collect(),
			ctx.db
				.query("exceptions")
				.withIndex("by_practitioner_date", (q) =>
					q.eq("practitioner", practitioner._id).gte("date", args.fromDate),
				)
				.collect(),
		]);
		return {
			ok: true as const,
			rules: [...rules]
				.sort((a, b) => a.weekday - b.weekday || a.start - b.start)
				.map((r) => ({
					id: r._id,
					weekday: r.weekday,
					start: r.start,
					end: r.end,
					modes: r.modes,
					...(r.validFrom === undefined ? {} : { validFrom: r.validFrom }),
					...(r.validUntil === undefined ? {} : { validUntil: r.validUntil }),
				})),
			exceptions: [...exceptions]
				.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
				.map((e) => ({
					id: e._id,
					date: e.date,
					kind: e.kind,
					...(e.start === undefined ? {} : { start: e.start }),
					...(e.end === undefined ? {} : { end: e.end }),
					...(e.modes === undefined ? {} : { modes: e.modes }),
				})),
		};
	},
});

/**
 * Changes a service: its name, length, grid, buffer, notice, horizon, modes, the practitioners who
 * offer it, or whether it is offered. The changed service must stay within `SERVICE_LIMITS`, the
 * bounds the slot engine and the calendar's overlap reads assume, and every practitioner must be
 * the tenant's. Appointments already made keep their own start, end and block. The slug is the
 * service's key and never changes.
 */
export const updateService = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		service: v.string(),
		patch: v.object({
			name: v.optional(serviceNameValidator),
			durationMinutes: v.optional(v.number()),
			bufferMinutes: v.optional(v.number()),
			stepMinutes: v.optional(v.number()),
			minNoticeMinutes: v.optional(v.number()),
			horizonDays: v.optional(v.number()),
			holdMinutes: v.optional(v.number()),
			modes: v.optional(v.array(modeValidator)),
			practitioners: v.optional(v.array(v.string())),
			/** The room kind an onsite session needs; null: no room needed. */
			roomKind: v.optional(v.union(v.string(), v.null())),
			roomEquipment: v.optional(v.array(v.string())),
			roomAudiences: v.optional(v.array(audienceValidator)),
			active: v.optional(v.boolean()),
		}),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant).eq("slug", args.service))
			.unique();
		if (row === null) return { ok: false as const, reason: "not_found" as const };
		const { patch } = args;
		const name = patch.name === undefined ? row.name : cleanName(patch.name);
		const practitioners =
			patch.practitioners === undefined
				? row.practitioners
				: await tenantPractitioners(ctx, args.tenant, patch.practitioners);
		if (practitioners === undefined || (patch.name !== undefined && name === undefined)) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const next = {
			durationMinutes: patch.durationMinutes ?? row.durationMinutes,
			bufferMinutes: patch.bufferMinutes ?? row.bufferMinutes,
			stepMinutes: patch.stepMinutes ?? row.stepMinutes,
			minNoticeMinutes: patch.minNoticeMinutes ?? row.minNoticeMinutes,
			horizonDays: patch.horizonDays ?? row.horizonDays,
			holdMinutes: patch.holdMinutes ?? row.holdMinutes,
			modes: patch.modes === undefined ? row.modes : [...new Set(patch.modes)],
			active: patch.active ?? row.active,
		};
		if (
			serviceProblem(serviceSpec({ ...row, ...next })) !== undefined ||
			(typeof patch.roomKind === "string" && !ROOM_KINDS.some((k) => k === patch.roomKind))
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		await ctx.db.patch(row._id, {
			...next,
			practitioners,
			...(patch.roomKind === undefined ? {} : { roomKind: patch.roomKind ?? undefined }),
			...(patch.roomEquipment === undefined ? {} : { roomEquipment: patch.roomEquipment }),
			...(patch.roomAudiences === undefined ? {} : { roomAudiences: patch.roomAudiences }),
			...(name === undefined ? {} : { name }),
			updatedBy: args.actor.subject,
			updatedAt: Date.now(),
		});
		return { ok: true as const };
	},
});

/** Adds a weekly opening to one practitioner of the tenant. */
export const addRule = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		practitioner: v.string(),
		weekday: v.number(),
		start: v.number(),
		end: v.number(),
		modes: v.array(modeValidator),
		validFrom: v.optional(v.string()),
		validUntil: v.optional(v.string()),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const practitioner = await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined) return { ok: false as const, reason: "not_found" as const };
		const rule = {
			weekday: args.weekday,
			start: args.start,
			end: args.end,
			modes: [...new Set(args.modes)],
			...(args.validFrom === undefined ? {} : { validFrom: args.validFrom }),
			...(args.validUntil === undefined ? {} : { validUntil: args.validUntil }),
		};
		const datesSound =
			(rule.validFrom === undefined || isLocalDate(rule.validFrom)) &&
			(rule.validUntil === undefined || isLocalDate(rule.validUntil));
		if (!datesSound || ruleProblem(rule) !== undefined) {
			return { ok: false as const, reason: "invalid" as const };
		}
		// The same opening again is the one already there (a double submit adds nothing).
		const same = (
			await ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner._id))
				.collect()
		).find(
			(r) =>
				r.weekday === rule.weekday &&
				r.start === rule.start &&
				r.end === rule.end &&
				r.validFrom === rule.validFrom &&
				r.validUntil === rule.validUntil &&
				sameModes(r.modes, rule.modes),
		);
		if (same !== undefined) return { ok: true as const, id: same._id };
		const id = await ctx.db.insert("rules", {
			practitioner: practitioner._id,
			...rule,
			createdBy: args.actor.subject,
		});
		return { ok: true as const, id };
	},
});

/** Removes one weekly opening, if its practitioner belongs to the tenant. */
export const removeRule = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		rule: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("rules", args.rule);
		const row = id === null ? null : await ctx.db.get(id);
		const owner =
			row === null ? undefined : await practitionerOf(ctx, args.tenant, row.practitioner);
		if (row === null || owner === undefined) {
			return { ok: false as const, reason: "not_found" as const };
		}
		await ctx.db.delete(row._id);
		return { ok: true as const };
	},
});

/** Removes one exception (a closed day or an extra window), if its practitioner is the tenant's. */
export const removeException = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		exception: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("exceptions", args.exception);
		const row = id === null ? null : await ctx.db.get(id);
		const owner =
			row === null ? undefined : await practitionerOf(ctx, args.tenant, row.practitioner);
		if (row === null || owner === undefined) {
			return { ok: false as const, reason: "not_found" as const };
		}
		await ctx.db.delete(row._id);
		return { ok: true as const };
	},
});
