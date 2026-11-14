import { type ComposedRole, effectiveOf, redundantRoles } from "@psi/scheduling/permissions";
import { entryOf, splitRelation } from "./role-map";
import type { Role, ScopeName } from "./schema";

/** A role as stored: its own relations and the roles it includes. */
export interface StoredRole {
	id: string;
	relations: ReadonlyArray<string>;
	includes: ReadonlyArray<string>;
}

const WIDTH: Readonly<Record<ScopeName, number>> = { all: 3, assigned: 2, own: 1 };

const byIdOf = (roles: ReadonlyArray<StoredRole>): Map<string, ComposedRole> =>
	new Map(roles.map((r) => [r.id, { id: r.id, permissions: r.relations, includes: r.includes }]));

/**
 * What a role holds through the roles it includes, as the role editor's cells: for each resource and action, the widest
 * scope inherited and the nearest role it comes from ("din Recepție"). A cell the role holds itself as wide or wider is
 * still listed: the editor shows its own choice beside it.
 */
function inheritedCells(id: string, byId: ReadonlyMap<string, ComposedRole>): Role["inherited"] {
	const out: Record<string, Record<string, { scope: ScopeName; from: string }>> = {};
	for (const [relation, from] of effectiveOf(id, byId).from) {
		const { key, scope, group } = splitRelation(relation);
		if (group !== null || scope === null) continue;
		const entry = entryOf(key);
		if (entry === undefined) continue;
		const row = out[entry.resource.key] ?? {};
		const had = row[entry.action];
		if (had === undefined || WIDTH[scope] > WIDTH[had.scope]) row[entry.action] = { scope, from };
		out[entry.resource.key] = row;
	}
	return out;
}

/** Each role with what it includes, what it inherits and everything it holds in the end. */
export function composed<R extends Role>(
	roles: ReadonlyArray<R>,
	stored: ReadonlyArray<StoredRole>,
): R[] {
	const byId = byIdOf(stored);
	const of = new Map(stored.map((s) => [s.id, s]));
	return roles.map((r) => ({
		...r,
		includes: [...(of.get(r.id)?.includes ?? [])],
		inherited: inheritedCells(r.id, byId),
		effective: [...effectiveOf(r.id, byId).keys].sort(),
	}));
}

/**
 * For the member editor: each role, and the other roles that hold everything it holds (by permissions, never by name).
 * A role picked beside one of those is "inclus în …" and is not kept.
 */
export function containersOf(roles: ReadonlyArray<Role>): Map<string, string[]> {
	const byId = new Map<string, ComposedRole>(
		roles.map((r) => [r.id, { id: r.id, permissions: r.effective ?? [], includes: [] }]),
	);
	const out = new Map<string, string[]>();
	for (const r of roles)
		for (const other of roles) {
			if (other.id === r.id) continue;
			const dropped = redundantRoles([r.id, other.id], byId);
			if (dropped.get(r.id) === other.id) out.set(r.id, [...(out.get(r.id) ?? []), other.id]);
		}
	return out;
}
