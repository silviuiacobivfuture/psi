import { SEED_ROLES } from "@psi/scheduling/permissions";

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
