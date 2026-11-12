import { v } from "convex/values";
import { DAY_MINUTES, MINUTE_MS } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { tenantBySlug } from "./calendar";
import { requireServer } from "./guard";
import { serverKeyValidator, statusValidator } from "./validators";

/**
 * A tenant's requests and appointments in [from, to), across its practitioners, for the staff
 * console. Contact included (staff only); the account hash never leaves the store here, only
 * whether the request is linked to an account.
 */

const MAX_REQUESTS_MS = 62 * DAY_MINUTES * MINUTE_MS;
/** What the list shows unless asked: held and expired rows never left the booking form. */
const HIDDEN: ReadonlySet<Doc<"appointments">["status"]> = new Set([
	"held",
	"expired",
]);

export const requests = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		from: v.number(),
		to: v.number(),
		statuses: v.optional(v.array(statusValidator)),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		if (tenant === undefined)
			return { ok: false as const, reason: "unknown_tenant" as const };
		const to = Math.min(args.to, args.from + MAX_REQUESTS_MS);
		const rows = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) =>
				q.eq("tenant", tenant.slug).gte("start", args.from).lt("start", to),
			)
			.collect();
		const wanted =
			args.statuses === undefined ? undefined : new Set(args.statuses);
		const shown = rows.filter((row) =>
			wanted === undefined ? !HIDDEN.has(row.status) : wanted.has(row.status),
		);
		const practitioners = new Map<Id<"practitioners">, string>();
		const services = new Map<Id<"services">, string>();
		const out = [];
		for (const row of shown) {
			let practitionerName = practitioners.get(row.practitioner);
			if (practitionerName === undefined) {
				practitionerName =
					(await ctx.db.get(row.practitioner))?.displayName ?? "";
				practitioners.set(row.practitioner, practitionerName);
			}
			let serviceSlug = services.get(row.service);
			if (serviceSlug === undefined) {
				serviceSlug = (await ctx.db.get(row.service))?.slug ?? "";
				services.set(row.service, serviceSlug);
			}
			out.push({
				reference: row.reference,
				status: row.status,
				start: row.start,
				end: row.end,
				mode: row.mode,
				serviceSlug,
				practitionerId: row.practitioner,
				practitionerName,
				channel: row.channel,
				...(row.submittedAt === undefined
					? {}
					: { submittedAt: row.submittedAt }),
				...(row.contact === undefined ? {} : { contact: row.contact }),
				...(row.audience === undefined ? {} : { audience: row.audience }),
				...(row.decidedBy === undefined ? {} : { decidedBy: row.decidedBy }),
				...(row.decisionReason === undefined
					? {}
					: { decisionReason: row.decisionReason }),
				linkedAccount: row.accountHash !== undefined,
			});
		}
		return { ok: true as const, timeZone: tenant.timeZone, requests: out };
	},
});
