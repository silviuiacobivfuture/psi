import { type ComposedRole, inclusionProblem } from "../src/permissions/composed";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { CATALOG_MAX, TOO_MANY_ROWS } from "./bounded";

/**
 * Every role of the app: a catalogue (tens of roles in a real clinic), read within its bound. Past it the composition
 * cannot be computed from part of the roles, so the call fails rather than answer from some of them.
 */
export async function appRoles(ctx: QueryCtx, tenant: string): Promise<Doc<"roles">[]> {
	const rows = await ctx.db
		.query("roles")
		.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
		.take(CATALOG_MAX + 1);
	if (rows.length > CATALOG_MAX) throw new Error(`${TOO_MANY_ROWS}: roles of ${tenant}`);
	return rows;
}

/** Roles as the composition rules read them: own keys and included roles, by id. */
export const composedOf = (rows: ReadonlyArray<Doc<"roles">>): Map<string, ComposedRole> =>
	new Map(
		rows.map((r) => [
			r._id as string,
			{ id: r._id as string, permissions: r.permissions, includes: (r.includes ?? []) as string[] },
		]),
	);

/** The app's roles as the composition rules read them. */
export async function composedRoles(
	ctx: QueryCtx,
	tenant: string,
): Promise<Map<string, ComposedRole>> {
	return composedOf(await appRoles(ctx, tenant));
}

/**
 * The roles `role` may include, as ids of this app, or undefined when the list is refused: an id that is not a role of
 * the app, itself, a cycle, a chain too deep, or the same role twice. `role` is undefined for a role not yet made.
 */
export async function includesOf(
	ctx: QueryCtx,
	tenant: string,
	role: string | undefined,
	includes: ReadonlyArray<string>,
): Promise<Id<"roles">[] | undefined> {
	if (new Set(includes).size !== includes.length) return undefined;
	const roles = await composedRoles(ctx, tenant);
	const ids: Id<"roles">[] = [];
	for (const inc of includes) {
		const id = ctx.db.normalizeId("roles", inc);
		if (id === null || !roles.has(id)) return undefined;
		ids.push(id);
	}
	if (inclusionProblem(role ?? "(new)", ids, roles) !== undefined) return undefined;
	return ids;
}
