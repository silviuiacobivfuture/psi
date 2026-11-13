import type { HandlersOf } from "../http/context";
import { capabilitiesOf } from "./capabilities";

/**
 * "Vezi ca…": a roles editor looks at the app as a role or a member. These two routes exist so the start and the stop
 * are AUDITED events of the administrator; what is seen is computed for the target and never widens anything.
 */
export const viewAsHandlers: HandlersOf<"viewAs.start" | "viewAs.stop"> = {
	async "viewAs.start"(ctx) {
		const seen = await capabilitiesOf(ctx, ctx.body.as);
		ctx.auditTarget(ctx.body.as);
		return seen;
	},
	async "viewAs.stop"(ctx) {
		ctx.auditTarget(ctx.app);
		return { ok: true as const };
	},
};
