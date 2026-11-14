import { type ComposedRole, effectiveOf } from "@psi/scheduling/permissions";
import { relationsOf, storedOf } from "./fake-roles";
import type { ClinicPort } from "./port";
import { ENTRIES } from "./role-map";
import type { AppSlug } from "./schema";
import type { AppData } from "./seed";

/** The role editor's rows the platform administrator holds in the fake: the app's settings, its team and its roles. */
const PLATFORM_RESOURCES = new Set(["settings", "members", "roles"]);

/**
 * The roles to compare, in the fake: each role's stored keys as the role editor would save them (plus the keys the
 * fake derives where the editor's rows are coarser). A service answers this from its own store and model.
 */
export function createFakeRoleSummary(deps: {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
}): Pick<ClinicPort, "roleSummary"> {
	return {
		async roleSummary(app) {
			deps.guard("roleSummary");
			const d = deps.data(app);
			const stored = storedOf(d.roles);
			const byId = new Map<string, ComposedRole>(
				stored.map((s) => [s.id, { id: s.id, permissions: s.relations, includes: s.includes }]),
			);
			return {
				roles: d.roles.map((r) => ({
					id: r.id,
					name: r.name,
					...(r.description === "" ? {} : { description: r.description }),
					// A role made in the fake is `role<n>`; the seed roles keep their slugs.
					system: !/^role\d+$/.test(r.id),
					permissions: relationsOf(r),
					includes: [...(r.includes ?? [])].sort(),
					inherited: Object.fromEntries(effectiveOf(r.id, byId).from),
				})),
				platform: {
					permissions: ENTRIES.filter((e) => PLATFORM_RESOURCES.has(e.resource.key))
						.map((e) => `${e.key}_all`)
						.sort(),
				},
			};
		},
	};
}
