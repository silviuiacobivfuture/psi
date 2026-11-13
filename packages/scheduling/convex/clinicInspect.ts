import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { CLINIC_TABLES, rowsOf } from "./clinicTables";

/**
 * Row counts of an app's clinic tables: what a restore drill compares (before and after) and what
 * the tests assert did not change. Counts only, never content. Internal: admin key. A table is
 * counted up to 20,000 rows (far beyond the clinic's).
 */
export const counts = internalQuery({
	args: { tenant: v.string() },
	returns: v.record(v.string(), v.number()),
	handler: async (ctx, { tenant }) => {
		const out: Record<string, number> = {};
		for (const table of CLINIC_TABLES) out[table] = (await rowsOf(ctx, tenant, table)).length;
		return out;
	},
});
