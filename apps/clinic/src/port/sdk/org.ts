import { SchedulingApiError } from "@psi/scheduling-sdk";
import type { OrgProfileDoc } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import {
	EMPTY_ORG_PROFILE,
	type OrgPort,
	type OrgProfile,
	type OrgProfileSave,
	type OrgProfileView,
} from "../org-port";
import type { AppSlug } from "../schema";
import type { SdkContext } from "./context";

const viewOf = (doc: z.output<typeof OrgProfileDoc>): OrgProfileView => ({
	revision: doc.revision,
	profile: doc.profile ?? EMPTY_ORG_PROFILE,
	updatedAt: doc.updatedAt === undefined ? null : new Date(doc.updatedAt).toISOString(),
});

/** The organisation's contact profile over `orgProfile.get` / `orgProfile.put`. */
export function orgGroup(sdk: SdkContext): OrgPort {
	const { api, run } = sdk;
	return {
		orgProfile: (app: AppSlug): Promise<OrgProfileView> =>
			run(async () => viewOf(await api.orgProfile.get({ app }))),
		/** A save from a revision the service moved past, or one it refuses, is an answer, never an error. */
		saveOrgProfile: (
			app: AppSlug,
			revision: number,
			profile: OrgProfile,
		): Promise<OrgProfileSave> =>
			run(async () => {
				try {
					return { ok: true, view: viewOf(await api.orgProfile.put({ app, revision, profile })) };
				} catch (error) {
					if (error instanceof SchedulingApiError) {
						if (error.code === "conflict" && error.detail?.reason === "stale")
							return { ok: false, reason: "stale" };
						if (error.code === "invalid") return { ok: false, reason: "invalid" };
					}
					throw error;
				}
			}),
	};
}
