import type { RoleSummary } from "../port";
import type { AppSlug } from "../schema";
import type { SdkContext } from "./context";

/** The roles every member may compare: the service's own summary (names and keys, no member list). */
export function roleSummaryGroup(sdk: SdkContext): {
	roleSummary: (app: AppSlug) => Promise<RoleSummary>;
} {
	const { api, run } = sdk;
	return { roleSummary: (app) => run(() => api.roles.summary({ app })) };
}
