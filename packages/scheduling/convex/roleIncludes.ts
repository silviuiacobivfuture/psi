import { type ComposedRole, inclusionProblem } from "../src/permissions/composed";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** The app's roles as the composition rules read them: own keys and included roles, by id. */
export async function composedRoles(
	ctx: QueryCtx,
	tenant: string,
): Promise<Map<string, ComposedRole>> {
	const rows = await ctx.db
		.query("roles")
		.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
		.collect();
	return new Map(
		rows.map((r) => [
			r._id as string,
			{ id: r._id as string, permissions: r.permissions, includes: (r.includes ?? []) as string[] },
		]),
	);
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
