import { type ComposedRole, effectiveOf, effectiveOfMany } from "@psi/scheduling/permissions";
import type { MemberRow, RoleRow } from "../store/types";

/**
 * The app's roles as the composition rules read them. What a role or a member holds IN THE END is computed here once,
 * for every reader that does not ask OpenFGA (the capabilities of a role seen "as", the role matrix, the comparison,
 * the owner-only guard); OpenFGA itself resolves the same through the inclusion tuples.
 */
export const rolesById = (roles: ReadonlyArray<RoleRow>): Map<string, ComposedRole> =>
	new Map(roles.map((r) => [r.id, { id: r.id, permissions: r.permissions, includes: r.includes }]));

/** A role's every relation: its own and every included role's. */
export function roleKeys(id: string, byId: ReadonlyMap<string, ComposedRole>): Set<string> {
	return new Set(effectiveOf(id, byId).keys);
}

/** For a role, each relation held through an included role and the nearest role that holds it as its own. */
export function inheritedOf(
	id: string,
	byId: ReadonlyMap<string, ComposedRole>,
): Record<string, string> {
	return Object.fromEntries(effectiveOf(id, byId).from);
}

/** What a member holds in the end, as far as roles and personal overrides say: roles and grants, less every denial. */
export function memberKeys(
	m: Pick<MemberRow, "roles" | "grants" | "denies">,
	byId: ReadonlyMap<string, ComposedRole>,
): Set<string> {
	const keys = effectiveOfMany(m.roles, byId);
	for (const g of m.grants) keys.add(g);
	for (const d of m.denies) keys.delete(d);
	return keys;
}
