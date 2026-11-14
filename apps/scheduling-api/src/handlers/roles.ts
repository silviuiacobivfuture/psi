import { inclusionProblem } from "@psi/scheduling/permissions";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { allAppRelations, appRelation, permissionOf } from "../authz/catalogue";
import { inheritedOf, roleKeys, rolesById } from "../authz/composition";
import { roleGrant } from "../authz/links";
import { roleTuples } from "../authz/tuples";
import type { Ctx, HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { RoleRow } from "../store/types";
import { catalogueMatrix } from "./matrix";
import { guardRoleChange } from "./owner-guard";
import {
	diff,
	must,
	newId,
	paginate,
	removeTuplesThenRow,
	replaced,
	stamps,
	writeRowThenTuples,
} from "./shared";

/** What the Owner role always keeps (its own or through what it includes), so an app cannot lock itself out. */
const GUARDED = [
	"roles_view",
	"roles_create",
	"roles_edit",
	"roles_delete",
	"members_view",
	"members_edit",
].map((key) => {
	const def = permissionOf(key);
	if (def === undefined) throw new Error(`${key} is not in the catalogue`);
	return appRelation(def, "all");
});

export const OWNER_ROLE = "Owner";
export const isOwnerRole = (role: RoleRow): boolean => role.system && role.name === OWNER_ROLE;

/** The roles as they would be with `next` in place of its stored self. */
const withRole = (roles: ReadonlyArray<RoleRow>, next: RoleRow): RoleRow[] =>
	roles.map((r) => (r.id === next.id ? next : r));

function keepsOwnerPowers(roles: ReadonlyArray<RoleRow>, next: RoleRow): void {
	if (!isOwnerRole(next)) return;
	const keys = roleKeys(next.id, rolesById(withRole(roles, next)));
	if (!GUARDED.every((r) => keys.has(r)))
		throw fail("conflict", "the Owner role keeps the permissions that manage roles and members", {
			reason: "owner_lockout",
		});
}

/** A role as the wire carries it: its own permissions and the roles it includes. */
export function roleOut(r: RoleRow) {
	return {
		id: r.id,
		name: r.name,
		...(r.description === undefined ? {} : { description: r.description }),
		system: r.system,
		permissions: r.permissions,
		includes: r.includes,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	};
}

/** Writes the row, then the difference of its tuples (undone together on a failure). */
async function saveRole(
	ctx: Ctx<RouteSpec>,
	held: RoleRow,
	next: RoleRow,
): Promise<{ writes: number; deletes: number }> {
	const change = diff(roleTuples(held), roleTuples(next));
	await writeRowThenTuples(ctx, {
		write: async () => replaced(ctx.deps.store.c.roles, next),
		undo: async () => {
			await ctx.deps.store.c.roles.replace(held);
		},
		tuples: () => change,
	});
	return { writes: change.writes.length, deletes: change.deletes.length };
}

export const roleHandlers: HandlersOf<
	| "roles.list"
	| "roles.create"
	| "roles.get"
	| "roles.update"
	| "roles.setPermissions"
	| "roles.setIncludes"
	| "roles.remove"
> = {
	async "roles.list"(ctx) {
		const rows = (await ctx.deps.store.c.roles.list(ctx.app)).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return { ...page, items: page.items.map(roleOut) };
	},

	async "roles.create"(ctx) {
		const source =
			ctx.body.copyFrom === undefined
				? undefined
				: await must(ctx.deps.store.c.roles, ctx.app, ctx.body.copyFrom, "role");
		const role: RoleRow = {
			id: newId("r"),
			app: ctx.app,
			name: ctx.body.name,
			...(ctx.body.description === undefined ? {} : { description: ctx.body.description }),
			system: false,
			permissions: source?.permissions ?? [],
			// A copy holds what the copied role holds: its own permissions and the roles it includes.
			includes: source?.includes ?? [],
			...stamps(ctx.now),
		};
		if (source !== undefined)
			await guardRoleChange(ctx, { ...role, permissions: [], includes: [] }, role);
		const saved = await writeRowThenTuples(ctx, {
			write: () => ctx.deps.store.c.roles.insert(role),
			undo: async (r) => {
				await ctx.deps.store.c.roles.remove(ctx.app, r.id);
			},
			tuples: (r) => ({ writes: roleTuples(r), deletes: [] }),
		});
		return roleOut(saved);
	},

	async "roles.get"(ctx) {
		const roles = await ctx.deps.store.c.roles.list(ctx.app);
		const held =
			roles.find((r) => r.id === String(ctx.params.id)) ??
			(await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role"));
		const byId = rolesById(roles);
		const keys = roleKeys(held.id, byId);
		return {
			role: roleOut(held),
			// What it holds in the end; `inherited` says which of those come from an included role.
			matrix: catalogueMatrix((def) => def.scopes.filter((s) => keys.has(appRelation(def, s)))),
			inherited: inheritedOf(held.id, byId),
		};
	},

	async "roles.update"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		const next: RoleRow = {
			...role,
			...(ctx.body.name === undefined ? {} : { name: ctx.body.name }),
			...(ctx.body.description === undefined ? {} : { description: ctx.body.description }),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.roles.replace(next);
		return roleOut(next);
	},

	async "roles.setPermissions"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		const valid = new Set(allAppRelations());
		const wanted = [...new Set(ctx.body.permissions)].sort();
		for (const p of wanted)
			if (!valid.has(p)) throw fail("invalid", "not a permission relation", { relation: p });
		const next: RoleRow = { ...role, permissions: wanted, updatedAt: ctx.now };
		keepsOwnerPowers(await ctx.deps.store.c.roles.list(ctx.app), next);
		await guardRoleChange(ctx, role, next);
		const change = diff(
			role.permissions.map((p) => roleGrant(role.id, role.app, p)),
			wanted.map((p) => roleGrant(role.id, role.app, p)),
		);
		await writeRowThenTuples(ctx, {
			write: async () => replaced(ctx.deps.store.c.roles, next),
			undo: async () => {
				await ctx.deps.store.c.roles.replace(role);
			},
			tuples: () => change,
		});
		ctx.note({ added: change.writes.length, removed: change.deletes.length });
		return roleOut(next);
	},

	async "roles.setIncludes"(ctx) {
		const roles = await ctx.deps.store.c.roles.list(ctx.app);
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		const wanted = [...new Set(ctx.body.includes)].sort();
		const problem = inclusionProblem(role.id, wanted, rolesById(roles));
		if (problem !== undefined)
			throw fail("invalid", "a role cannot include that", {
				reason: problem.kind === "unknown" ? "unknown_role" : problem.kind,
				...(problem.kind === "unknown" ? { role: problem.id } : {}),
			});
		const next: RoleRow = { ...role, includes: wanted, updatedAt: ctx.now };
		keepsOwnerPowers(roles, next);
		await guardRoleChange(ctx, role, next);
		const { writes, deletes } = await saveRole(ctx, role, next);
		ctx.note({ added: writes, removed: deletes, includes: wanted.length });
		return roleOut(next);
	},

	async "roles.remove"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		if (isOwnerRole(role))
			throw fail("conflict", "the Owner role cannot be deleted", { reason: "owner_lockout" });
		const holders = (await ctx.deps.store.c.members.list(ctx.app)).filter((m) =>
			m.roles.includes(role.id),
		);
		if (holders.length > 0)
			throw fail("conflict", "people still hold this role", { holders: holders.length });
		const includers = (await ctx.deps.store.c.roles.list(ctx.app)).filter((r) =>
			r.includes.includes(role.id),
		);
		if (includers.length > 0)
			throw fail("conflict", "other roles include this role", {
				reason: "included",
				roles: includers.length,
			});
		await guardRoleChange(ctx, role, undefined);
		await removeTuplesThenRow(ctx, {
			tuples: roleTuples(role),
			remove: async () => {
				await ctx.deps.store.c.roles.remove(ctx.app, role.id);
			},
		});
		return { ok: true as const };
	},
};
