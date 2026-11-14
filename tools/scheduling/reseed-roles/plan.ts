import {
	type ComposedRole,
	effectiveOf,
	OWNER_ONLY_KEYS,
	SEED_ROLES,
} from "@psi/scheduling/permissions";
import type { RoleRow } from "@psi/scheduling-api/store-types";

export type Step =
	/** Rewritten into its composed form: the same permissions in the end (the Owner also gains the Owner-only keys). */
	| { kind: "rewrite"; role: RoleRow; next: RoleRow }
	/** Already composed as the seed says, and the Owner already holds the Owner-only keys: nothing to do. */
	| { kind: "current"; role: RoleRow }
	/**
	 * A role it should include holds something this one does not (the app's owners changed one of them): including it
	 * would widen this role, so it is left flat. The Owner still gains the Owner-only keys.
	 */
	| { kind: "not_contained"; role: RoleRow; next: RoleRow | undefined; missing: string[] }
	/** A seed role the app does not have (an older or partial app): nothing made here. */
	| { kind: "missing"; name: string };

const OWNER = "Owner";

/** Other names a seed role is stored under: the console has always shown the Admin seed role as "Administrator". */
const ALIASES: Readonly<Record<string, readonly string[]>> = { Admin: ["Administrator"] };

/**
 * Each seed role's stored row, by seed name. A role the app was created with is `system`; but a role written through
 * the store afterwards (reconcile --seed-roles, an import, an early provisioning) is stored unflagged, and the Admin
 * role may carry the name the console shows. So: the system role of that name first; else the one role named so (or
 * by an alias), whatever its flag. Two unflagged candidates for one seed role are ambiguous and adopt neither.
 */
export function seedRolesOf(roles: ReadonlyArray<RoleRow>): Map<string, RoleRow> {
	const out = new Map<string, RoleRow>();
	for (const seed of SEED_ROLES) {
		const names = [seed.name, ...(ALIASES[seed.name] ?? [])].map((n) => n.toLowerCase());
		const named = roles.filter((r) => names.includes(r.name.toLowerCase()));
		const system = named.filter((r) => r.system);
		const pick =
			system.length === 1
				? system[0]
				: system.length === 0 && named.length === 1
					? named[0]
					: undefined;
		if (pick !== undefined) out.set(seed.name, pick);
	}
	return out;
}
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
	sorted(a).join("\n") === sorted(b).join("\n");

/**
 * The re-seed of one app's roles, decided from what the store holds, never from what the seed held once: a stored
 * seed role may be older than today's seed, or changed by the app's owners. Each seed role includes the seed roles it
 * should include when every permission they hold (as stored) is one it holds too; its own permissions become the rest.
 * What every role holds in the end is therefore exactly what it held before, except the Owner, who gains the
 * Owner-only keys. Roles are planned bottom-up, so an included role's composition is known when its includer's is.
 */
export function planReseed(roles: ReadonlyArray<RoleRow>, now: number): Step[] {
	const seeded = seedRolesOf(roles);
	const byId = new Map<string, ComposedRole>(
		roles.map((r) => [r.id, { id: r.id, permissions: r.permissions, includes: r.includes }]),
	);
	const held = (id: string): Set<string> => effectiveOf(id, byId).keys;
	return SEED_ROLES.map((seed): Step => {
		const role = seeded.get(seed.name);
		if (role === undefined) return { kind: "missing", name: seed.name };
		const extra = seed.name === OWNER ? [...OWNER_ONLY_KEYS] : [];
		const mine = held(role.id);
		const included = seed.includes.flatMap((n) => {
			const r = seeded.get(n);
			return r === undefined ? [] : [r.id];
		});
		const through = new Set(included.flatMap((id) => [...held(id)]));
		const missing = sorted([...through].filter((k) => !mine.has(k)));
		const composes = missing.length === 0 && included.length === seed.includes.length;
		const target: RoleRow = composes
			? {
					...role,
					permissions: sorted([...mine, ...extra].filter((k) => !through.has(k))),
					includes: sorted(included),
					updatedAt: now,
				}
			: { ...role, permissions: sorted([...role.permissions, ...extra]), updatedAt: now };
		const unchanged =
			same(target.permissions, role.permissions) && same(target.includes, role.includes);
		if (composes)
			return unchanged ? { kind: "current", role } : { kind: "rewrite", role, next: target };
		return { kind: "not_contained", role, next: unchanged ? undefined : target, missing };
	});
}
