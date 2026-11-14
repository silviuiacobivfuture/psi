import { EMPTY_ORG_PROFILE, type OrgPort, OrgProfileSchema, type OrgProfileView } from "./org-port";
import type { ClinicPort } from "./port";
import type { AppSlug } from "./schema";
import type { AppData } from "./seed";

export interface OrgDeps {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** The contact profile in the fake: like the service, a whole profile saved from the revision it was edited from. */
export function createFakeOrg(deps: OrgDeps): OrgPort {
	const { data, guard, log } = deps;
	const held = new Map<AppSlug, OrgProfileView>();
	const viewOf = (app: AppSlug): OrgProfileView =>
		held.get(app) ?? { revision: 0, profile: EMPTY_ORG_PROFILE, updatedAt: null };
	return {
		async orgProfile(app) {
			guard("orgProfile");
			return viewOf(app);
		},
		async saveOrgProfile(app, revision, raw) {
			guard("saveOrgProfile");
			const parsed = OrgProfileSchema.safeParse(raw);
			if (!parsed.success) return { ok: false, reason: "invalid" };
			if (revision !== viewOf(app).revision) return { ok: false, reason: "stale" };
			const view = {
				revision: revision + 1,
				profile: parsed.data,
				updatedAt: new Date().toISOString(),
			};
			held.set(app, view);
			log(data(app), "console", "org.profile", `revision ${view.revision}`);
			return { ok: true, view };
		},
	};
}
