import { internalMutation } from "./_generated/server";
import { ensureTenantRow } from "./setupSupport";

/** The apps the estate runs (docs/plans/clinic.md section 4): each has its calendar space. */
export const ESTATE_APPS = ["psizone", "hemisync"] as const;

/**
 * Every estate app has its tenant row, idempotently: run by the scheduling-deploy Job after each
 * deploy (admin key only), so a fresh production store never refuses a visitor's request for want
 * of a row the team has not created yet.
 */
export const ensureEstateApps = internalMutation({
	args: {},
	handler: async (ctx) => {
		for (const slug of ESTATE_APPS) await ensureTenantRow(ctx, slug);
		return { ok: true as const, apps: [...ESTATE_APPS] };
	},
});
