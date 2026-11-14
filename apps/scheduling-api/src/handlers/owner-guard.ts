import { OWNER_ONLY_KEYS } from "@psi/scheduling/permissions";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { memberKeys, roleKeys, rolesById } from "../authz/composition";
import type { Ctx } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { MemberRow, RoleRow } from "../store/types";

type C = Ctx<RouteSpec>;

/** Whoever holds this manages the people who manage the team: the Owner (and the estate's administrators). */
export const MANAGE_ADMINS = "members_manage_admins";
/** Holding the organisation: whoever holds this is one of its Owners. */
export const OWNERSHIP_KEY = "organisation_transfer_all";

/**
 * A relation that changes who may do what in the team, or one of the Owner's own: managing members or roles (reading
 * them is not), and every Owner-only key. A member who holds one is an Administrator or an Owner, in the words of the
 * owner's rule; so is a role that grants one. Decided from the keys, never from a role's name.
 */
export function isProtectedKey(relation: string): boolean {
	if (OWNER_ONLY_KEYS.includes(relation)) return true;
	if (relation.startsWith("members_")) return relation !== "members_view_all";
	if (relation.startsWith("roles_")) return relation !== "roles_view_all";
	return false;
}

const anyProtected = (keys: ReadonlySet<string>): boolean => [...keys].some(isProtectedKey);

type Holding = Pick<MemberRow, "subject" | "roles" | "grants" | "denies">;

async function requireManageAdmins(ctx: C): Promise<void> {
	if (!(await ctx.canAll(MANAGE_ADMINS)))
		throw forbidden("only an Owner manages Administrators and Owners", {
			permission: MANAGE_ADMINS,
			reason: "manages_admins",
		});
}

const owners = (members: ReadonlyArray<Holding>, roles: ReadonlyArray<RoleRow>): number => {
	const byId = rolesById(roles);
	return members.filter((m) => memberKeys(m, byId).has(OWNERSHIP_KEY)).length;
};

/** The last Owner stays one: refused when the change takes the organisation from at least one Owner to none. */
function keepAnOwner(before: number, after: number): void {
	if (before > 0 && after === 0)
		throw fail("conflict", "the organisation keeps at least one Owner: hand it over first", {
			reason: "last_owner",
		});
}

/**
 * Every change to what one member holds (added, changed, overridden, removed) passes here before anything is written.
 * Someone who holds a protected key before or after is an Administrator or an Owner: only those who may manage them
 * (`members_manage_admins`) change them, or make someone one. And the organisation never loses its last Owner.
 */
export async function guardMemberChange(
	ctx: C,
	before: Holding | undefined,
	after: Holding | undefined,
): Promise<void> {
	const [roles, members] = await Promise.all([
		ctx.deps.store.c.roles.list(ctx.app),
		ctx.deps.store.c.members.list(ctx.app),
	]);
	const byId = rolesById(roles);
	const was = before === undefined ? false : anyProtected(memberKeys(before, byId));
	const will = after === undefined ? false : anyProtected(memberKeys(after, byId));
	if (was || will) await requireManageAdmins(ctx);
	const subject = before?.subject ?? after?.subject;
	const others = members.filter((m) => m.subject !== subject);
	keepAnOwner(
		owners([...others, ...(before === undefined ? [] : [before])], roles),
		owners([...others, ...(after === undefined ? [] : [after])], roles),
	);
}

/**
 * A change to a role (its permissions or the roles it includes, or its deletion) passes here before anything is
 * written: a role that holds a protected key afterwards, and whose keys change, is changed only by someone who may
 * manage Administrators and Owners; and no edit leaves the organisation without an Owner.
 */
export async function guardRoleChange(
	ctx: C,
	before: RoleRow,
	after: RoleRow | undefined,
): Promise<void> {
	const [roles, members] = await Promise.all([
		ctx.deps.store.c.roles.list(ctx.app),
		ctx.deps.store.c.members.list(ctx.app),
	]);
	const next = roles.flatMap((r) =>
		r.id !== before.id ? [r] : after === undefined ? [] : [after],
	);
	const was = roleKeys(before.id, rolesById(roles));
	const will = after === undefined ? new Set<string>() : roleKeys(after.id, rolesById(next));
	const changed = was.size !== will.size || [...will].some((k) => !was.has(k));
	if (changed && (anyProtected(will) || anyProtected(was))) await requireManageAdmins(ctx);
	keepAnOwner(owners(members, roles), owners(members, next));
}
