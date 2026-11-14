import { SEED_ROLES } from "@psi/scheduling/permissions";
import type { RoleRow } from "../store/types";

export interface SeedRole {
	slug: string;
	name: string;
	description: string;
	/** App relation names (catalogue keys). */
	permissions: string[];
}

/** The seed roles of every new app (docs/plans/clinic.md section 4): the package's, editable data from the moment they exist. */
export function seedRoles(): SeedRole[] {
	return SEED_ROLES.map((role) => ({
		slug: role.name.toLowerCase(),
		name: role.name,
		description: role.description,
		permissions: [...role.permissions],
	}));
}

/** The rows an app with no roles is given: one per seed role, `<app>-<slug>`, system, its keys sorted and unique. */
export function seedRoleRows(app: string, now: number): RoleRow[] {
	return seedRoles().map((r) => ({
		id: `${app}-${r.slug}`,
		app,
		name: r.name,
		description: r.description,
		system: true,
		permissions: [...new Set(r.permissions)].sort(),
		createdAt: now,
		updatedAt: now,
	}));
}
