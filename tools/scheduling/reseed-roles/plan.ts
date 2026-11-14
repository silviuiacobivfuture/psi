import { SEED_ROLES } from "@psi/scheduling/permissions";
import type { RoleRow } from "@psi/scheduling-api/store-types";

/** What the seed roles held before roles could include others: the shape a stored seed role still has if untouched. */
export type Baseline = Readonly<Record<string, ReadonlyArray<string>>>;

export type Step =
	/** An untouched seed role: rewritten to its own keys and the roles it includes. */
	| { kind: "rewrite"; role: RoleRow; next: RoleRow }
	/** Already the new seed: nothing to do. */
	| { kind: "current"; role: RoleRow }
	/** Changed by the app's owners since it was seeded: left as it is, for them to decide. */
	| { kind: "customised"; role: RoleRow }
	/** A seed role the app does not have (an older or partial app): nothing made here. */
	| { kind: "missing"; name: string };

const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
	a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/**
 * The re-seed of one app's roles, decided from what the store holds. A stored seed role is rewritten only when it still
 * holds exactly its old flat set (and includes nothing), so nobody's permissions change but the Owner's, who gains the
 * Owner-only keys; a role its owners changed is reported and left alone. Inclusions name the app's own stored seed
 * roles; a seed role whose included roles are not all there is left alone too.
 */
export function planReseed(roles: ReadonlyArray<RoleRow>, baseline: Baseline, now: number): Step[] {
	const seeded = new Map(roles.filter((r) => r.system).map((r) => [r.name, r]));
	return SEED_ROLES.map((seed): Step => {
		const role = seeded.get(seed.name);
		if (role === undefined) return { kind: "missing", name: seed.name };
		const includes = seed.includes.map((n) => seeded.get(n)?.id);
		const ids = includes.filter((id): id is string => id !== undefined);
		if (same(role.permissions, seed.permissions) && same(role.includes, ids))
			return { kind: "current", role };
		const before = baseline[seed.name];
		if (
			before === undefined ||
			role.includes.length > 0 ||
			!same(role.permissions, before) ||
			ids.length !== seed.includes.length
		)
			return { kind: "customised", role };
		return {
			kind: "rewrite",
			role,
			next: {
				...role,
				permissions: [...seed.permissions].sort(),
				includes: ids.sort(),
				updatedAt: now,
			},
		};
	});
}
