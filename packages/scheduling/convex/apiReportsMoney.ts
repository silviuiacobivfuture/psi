import { v } from "convex/values";
import { revenueReport } from "../src/clinic/reports";
import type { ReportPackage, ReportPayment, ReportVisitMoney } from "../src/clinic/reports/types";
import { query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { MAX_ROWS, openRange, rangeArgs, visitsIn } from "./reportRows";
import { serverKeyValidator } from "./validators";

/**
 * The one report with money in it: revenue, in whole bani (src/clinic/reports/revenue.ts). The API
 * lets it through only for `reports_view_all_money`. Kept in its own file so no other report can
 * reach a price or an amount by accident.
 */
export const revenue = query({
	args: { key: serverKeyValidator, tenant: v.string(), ...rangeArgs, now: v.optional(v.number()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const opened = await openRange(ctx, args.tenant, args.from, args.to);
		if (!opened.ok) return REFUSED(opened.reason);
		const visits = await visitsIn(ctx, args.tenant, opened.range);
		const payments = await ctx.db
			.query("payments")
			.withIndex("by_tenant_package", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		const packages = await ctx.db
			.query("packages")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		if (visits === null || payments.length > MAX_ROWS || packages.length > MAX_ROWS) {
			return REFUSED("too_many_rows");
		}
		const ledger: ReportPayment[] = payments.map((p) => ({
			id: p._id,
			client: p.client,
			amountMinor: p.amountMinor,
			at: p.at,
			...(p.package === undefined ? {} : { package: p.package }),
			...(p.method === undefined ? {} : { method: p.method }),
		}));
		const sold: ReportPackage[] = packages.map((p) => ({
			id: p._id,
			client: p.client,
			sessionType: p.sessionType,
			totalSessions: p.totalSessions,
			bonusSessions: p.bonusSessions,
			priceMinor: p.priceMinor,
			createdAt: p.createdAt,
		}));
		const money: ReportVisitMoney[] = visits.map((x) => ({
			id: x._id,
			start: x.start,
			status: x.status,
			...(x.package === undefined ? {} : { package: x.package }),
			...(x.priceMinor === undefined ? {} : { priceMinor: x.priceMinor }),
			...(x.amountPaidMinor === undefined ? {} : { amountPaidMinor: x.amountPaidMinor }),
			...(x.paymentMethod === undefined ? {} : { paymentMethod: x.paymentMethod }),
		}));
		return {
			ok: true as const,
			timeZone: opened.range.zone,
			report: revenueReport(
				ledger,
				sold,
				money,
				opened.range,
				args.granularity,
				args.now ?? Date.now(),
			),
		};
	},
});
