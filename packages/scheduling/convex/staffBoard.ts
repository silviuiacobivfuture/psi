import { v } from "convex/values";
import { isBlocking } from "../src/domain/conflicts";
import { windowsOn } from "../src/domain/slots";
import { addDays, DAY_MINUTES, isLocalDate, MINUTE_MS, toLocal } from "../src/domain/time";
import { query } from "./_generated/server";
import { exceptionsOf, rulesOf, tenantBySlug } from "./calendar";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/**
 * The staff calendar's data for a stretch of days (at most 14): who works when (the real hours,
 * with periods, alternating weeks and days off applied), what is booked (requests, confirmed
 * appointments, live holds) with its practitioner and room, and the rooms' closures. Staff only:
 * the contact is a name, nothing else.
 */
const MAX_DAYS = 14;

export const board = query({
	args: { key: serverKeyValidator, tenant: v.string(), fromDate: v.string(), days: v.number() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		if (tenant === undefined) return { ok: false as const, reason: "unknown_tenant" as const };
		if (
			!isLocalDate(args.fromDate) ||
			!Number.isInteger(args.days) ||
			args.days < 1 ||
			args.days > MAX_DAYS
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const dates = Array.from({ length: args.days }, (_, i) => addDays(args.fromDate, i));
		const lastDate = dates[dates.length - 1] ?? args.fromDate;
		const first = Date.parse(`${args.fromDate}T00:00:00Z`) - 14 * 60 * MINUTE_MS;
		const to = Date.parse(`${addDays(lastDate, 1)}T00:00:00Z`) + 14 * 60 * MINUTE_MS;
		const now = Date.now();
		const practitioners = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
			.collect();
		const rooms = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
			.collect();
		const services = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant.slug))
			.collect();
		const slugOf = new Map(services.map((s) => [s._id, s.slug]));

		const hours = [];
		const off = [];
		for (const p of practitioners.filter((x) => x.active)) {
			const [rules, exceptions] = await Promise.all([
				rulesOf(ctx, p._id),
				exceptionsOf(ctx, p._id, first, to, tenant.timeZone),
			]);
			for (const date of dates) {
				for (const w of windowsOn(date, rules, exceptions, ["onsite", "online"], p.abAnchor)) {
					hours.push({
						practitionerId: p._id,
						date,
						start: w.start,
						end: Math.min(w.end, DAY_MINUTES),
					});
				}
				if (
					exceptions.some((e) => e.date === date && e.kind === "closed" && e.start === undefined)
				) {
					off.push({ practitionerId: p._id, date });
				}
			}
		}
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) =>
				q.eq("tenant", tenant.slug).gte("start", first).lt("start", to),
			)
			.collect();
		const appointments = rows
			.filter((a) =>
				isBlocking(
					{
						status: a.status,
						start: a.start,
						blockedUntil: a.blockedUntil,
						...(a.holdExpiresAt === undefined ? {} : { holdExpiresAt: a.holdExpiresAt }),
					},
					now,
				),
			)
			.map((a) => ({
				reference: a.reference,
				status: a.status,
				start: a.start,
				end: a.end,
				blockedUntil: a.blockedUntil,
				mode: a.mode,
				practitionerId: a.practitioner,
				serviceSlug: slugOf.get(a.service) ?? "",
				...(a.room === undefined ? {} : { roomId: a.room }),
				...(a.contact === undefined ? {} : { contactName: a.contact.name }),
			}));
		const closures = [];
		for (const r of rooms) {
			const list = await ctx.db
				.query("roomClosures")
				.withIndex("by_room_date", (q) =>
					q.eq("room", r._id).gte("date", args.fromDate).lte("date", lastDate),
				)
				.collect();
			for (const c of list) {
				closures.push({
					id: c._id,
					roomId: r._id,
					date: c.date,
					...(c.start === undefined ? {} : { start: c.start }),
					...(c.end === undefined ? {} : { end: c.end }),
				});
			}
		}
		return {
			ok: true as const,
			timeZone: tenant.timeZone,
			today: toLocal(now, tenant.timeZone).date,
			hours,
			off,
			appointments,
			closures,
		};
	},
});
