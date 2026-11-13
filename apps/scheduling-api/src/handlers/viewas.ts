import type { HandlersOf } from "../http/context";
import { viewAsCapabilities } from "./capabilities";

/**
 * "Vezi ca…": a roles administrator looks at the app as a role or a member. These two routes exist so the start and the
 * stop are AUDITED events of the administrator; what is seen is computed from stored grants and never widens anything.
 */
export const viewAsHandlers: HandlersOf<"viewAs.start" | "viewAs.stop"> = {
	async "viewAs.start"(ctx) {
		const seen = await viewAsCapabilities(ctx, ctx.body.as);
		ctx.auditTarget(ctx.body.as);
		return seen;
	},
	async "viewAs.stop"(ctx) {
		ctx.auditTarget(ctx.app);
		return { ok: true as const };
	},
};
