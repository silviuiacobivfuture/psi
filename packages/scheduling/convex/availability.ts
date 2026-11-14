import { v } from "convex/values";
import type { Mode } from "../src/domain/catalog";
import { generateSlots } from "../src/domain/slots";
import { DAY_MINUTES, MINUTE_MS } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import {
	busyAround,
	exceptionsOf,
	rulesOf,
	serviceBySlug,
	serviceSpec,
	tenantBySlug,
} from "./calendar";
import { requireServer } from "./guard";
import { roomPlan, withRooms } from "./roomPlan";
import { modeValidator, serverKeyValidator } from "./validators";

/** The most slots one call returns, and the longest range it searches. */
export const MAX_SLOTS = 200;
const MAX_RANGE_MS = 62 * DAY_MINUTES * MINUTE_MS;

interface OfferedSlot {
	practitioner: string;
	practitionerName: string;
	start: number;
	end: number;
	modes: Mode[];
}

async function practitionerSlots(
	ctx: QueryCtx,
	practitioner: Doc<"practitioners">,
	service: Doc<"services">,
	tenant: Doc<"tenants">,
	range: { from: number; to: number; now: number; mode?: Mode },
): Promise<ReadonlyArray<OfferedSlot>> {
	const timeZone = tenant.timeZone;
	const [rules, exceptions, busy] = await Promise.all([
		rulesOf(ctx, practitioner._id),
		exceptionsOf(ctx, practitioner._id, range.from, range.to, timeZone),
		busyAround(ctx, practitioner._id, range.from, range.to, range.now),
	]);
	const plan = await roomPlan(ctx, tenant, service, practitioner, range);
	const spec = serviceSpec(service);
	const generated = generateSlots({
		timeZone,
		service: spec,
		rules,
		exceptions,
		busy,
		from: range.from,
		to: range.to,
		now: range.now,
		...(practitioner.abAnchor === undefined ? {} : { abAnchor: practitioner.abAnchor }),
		...(range.mode === undefined ? {} : { mode: range.mode }),
	});
	return withRooms(generated, plan, spec.durationMinutes + spec.bufferMinutes).map((slot) => ({
		practitioner: practitioner._id,
		practitionerName: practitioner.displayName,
		start: slot.start,
		end: slot.end,
		modes: [...slot.modes],
	}));
}

/**
 * The free slots of one service, across its practitioners, in start order. `now` comes from the
 * caller so the result is never a cached answer from an earlier minute; a hold re-checks
 * everything with the server's own clock anyway.
 */
export const slots = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		service: v.string(),
		from: v.number(),
		to: v.number(),
		now: v.number(),
		mode: v.optional(modeValidator),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		const service =
			tenant === undefined ? undefined : await serviceBySlug(ctx, tenant.slug, args.service);
		if (tenant === undefined || service === undefined) {
			return { ok: false as const, reason: "unknown_service" as const };
		}
		const to = Math.min(args.to, args.from + MAX_RANGE_MS);
		const limit = Math.max(1, Math.min(MAX_SLOTS, Math.floor(args.limit ?? MAX_SLOTS)));
		const found: OfferedSlot[] = [];
		for (const id of service.practitioners) {
			const practitioner = await ctx.db.get(id);
			// A person of another tenant is never offered here, whatever the service lists.
			if (practitioner === null || !practitioner.active || practitioner.tenant !== tenant.slug)
				continue;
			const range = {
				from: args.from,
				to,
				now: args.now,
				...(args.mode === undefined ? {} : { mode: args.mode }),
			};
			found.push(...(await practitionerSlots(ctx, practitioner, service, tenant, range)));
		}
		found.sort((a, b) => a.start - b.start || a.practitioner.localeCompare(b.practitioner));
		return {
			ok: true as const,
			timeZone: tenant.timeZone,
			service: {
				slug: service.slug,
				durationMinutes: service.durationMinutes,
				modes: service.modes,
				holdMinutes: service.holdMinutes,
			},
			slots: found.slice(0, limit),
		};
	},
});
