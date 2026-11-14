/**
 * Roles that INCLUDE other roles. A role holds its own keys and, through every role it includes (transitively), theirs:
 * "Administrator" includes "Recepție", so whoever holds Administrator holds everything Recepție does, and a change to
 * Recepție reaches them at once. Inclusion is a DAG: a cycle is refused when it is saved, and so is a chain deeper than
 * `MAX_INCLUDE_DEPTH`. Everything here is pure: the service, the Convex functions and the console's fake read the same.
 */
export interface ComposedRole {
	readonly id: string;
	readonly permissions: ReadonlyArray<string>;
	/** The ids of the roles this one includes. */
	readonly includes: ReadonlyArray<string>;
}

/** How deep a chain of inclusions may go (Owner > Administrator > Terapeut > Voluntar is 3). */
export const MAX_INCLUDE_DEPTH = 6;

export interface Effective {
	/** Every key the role holds in the end: its own and every included role's. */
	readonly keys: ReadonlySet<string>;
	/** For a key held through an included role, the nearest role that holds it as its own; absent for its own keys. */
	readonly from: ReadonlyMap<string, string>;
}

/**
 * What a role holds in the end. The nearest source wins (its own keys first, then the included roles in their order,
 * depth-first), so "din Recepție" names the role a person would change to take the key away. A cycle or a missing
 * role in stored data adds nothing further (the save refuses both; this never loops).
 */
export function effectiveOf(id: string, byId: ReadonlyMap<string, ComposedRole>): Effective {
	const keys = new Set<string>();
	const from = new Map<string, string>();
	const seen = new Set<string>();
	const visit = (roleId: string, depth: number): void => {
		const role = byId.get(roleId);
		if (role === undefined || seen.has(roleId) || depth > MAX_INCLUDE_DEPTH) return;
		seen.add(roleId);
		for (const k of role.permissions)
			if (!keys.has(k)) {
				keys.add(k);
				if (roleId !== id) from.set(k, roleId);
			}
		for (const inc of role.includes) visit(inc, depth + 1);
	};
	visit(id, 0);
	return { keys, from };
}

/** The keys several roles hold together (a member with roles A and B). */
export function effectiveOfMany(
	ids: ReadonlyArray<string>,
	byId: ReadonlyMap<string, ComposedRole>,
): Set<string> {
	const out = new Set<string>();
	for (const id of ids) for (const k of effectiveOf(id, byId).keys) out.add(k);
	return out;
}

export type InclusionProblem =
	| { kind: "self" }
	| { kind: "unknown"; id: string }
	| { kind: "cycle"; through: string }
	| { kind: "too_deep" };

/**
 * Why `id` may not include `includes`, or undefined when it may: an unknown role, itself, a role that (transitively)
 * includes `id` back, or a chain deeper than `MAX_INCLUDE_DEPTH`.
 */
export function inclusionProblem(
	id: string,
	includes: ReadonlyArray<string>,
	byId: ReadonlyMap<string, ComposedRole>,
): InclusionProblem | undefined {
	for (const inc of includes) {
		if (inc === id) return { kind: "self" };
		if (!byId.has(inc)) return { kind: "unknown", id: inc };
	}
	const next = new Map(byId);
	const held = byId.get(id);
	next.set(id, { id, permissions: held?.permissions ?? [], includes });
	const depthOf = (roleId: string, path: ReadonlyArray<string>): number | InclusionProblem => {
		if (path.includes(roleId)) return { kind: "cycle", through: roleId };
		const role = next.get(roleId);
		if (role === undefined) return 0;
		let deepest = 0;
		for (const inc of role.includes) {
			const d = depthOf(inc, [...path, roleId]);
			if (typeof d !== "number") return d;
			deepest = Math.max(deepest, d + 1);
		}
		return deepest;
	};
	const depth = depthOf(id, []);
	if (typeof depth !== "number") return depth;
	// The longest chain anywhere, so one that runs THROUGH this role from above counts too.
	let deepest = depth;
	for (const other of next.keys()) {
		const d = depthOf(other, []);
		if (typeof d === "number") deepest = Math.max(deepest, d);
	}
	return deepest > MAX_INCLUDE_DEPTH ? { kind: "too_deep" } : undefined;
}

const contains = (big: ReadonlySet<string>, small: ReadonlySet<string>): boolean => {
	for (const k of small) if (!big.has(k)) return false;
	return true;
};

/**
 * Among roles held together, those that add nothing: each one whose effective keys are all held by another of them,
 * mapped to the role that contains it ("inclus în Proprietar"). Computed from the permission sets, never from names.
 * Two roles that hold exactly the same keys keep the one first in id order, so the answer never drops both.
 */
export function redundantRoles(
	ids: ReadonlyArray<string>,
	byId: ReadonlyMap<string, ComposedRole>,
): Map<string, string> {
	const unique = [...new Set(ids)].filter((id) => byId.has(id)).sort();
	const sets = new Map(unique.map((id) => [id, effectiveOf(id, byId).keys]));
	const out = new Map<string, string>();
	for (const a of unique) {
		const sa = sets.get(a) ?? new Set<string>();
		for (const b of unique) {
			if (a === b || out.has(b)) continue;
			const sb = sets.get(b) ?? new Set<string>();
			if (!contains(sb, sa)) continue;
			// Equal sets: the one later in id order is the redundant one.
			if (sb.size === sa.size && b > a) continue;
			out.set(a, b);
			break;
		}
	}
	// Name the role that stays: A in B in C is "inclus în C" once B is dropped too.
	for (const [a, b] of out) {
		let keeper = b;
		for (let hops = 0; out.has(keeper) && hops < unique.length; hops += 1)
			keeper = out.get(keeper) ?? keeper;
		out.set(a, keeper);
	}
	return out;
}

/** The ids left once the redundant ones are dropped, in the order given. */
export function withoutRedundant(
	ids: ReadonlyArray<string>,
	byId: ReadonlyMap<string, ComposedRole>,
): string[] {
	const dropped = redundantRoles(ids, byId);
	return [...new Set(ids)].filter((id) => !dropped.has(id));
}
