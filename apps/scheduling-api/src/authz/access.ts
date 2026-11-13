import type { SchedType } from "@psi/scheduling-sdk/contract";
import { type PermissionDef, permissionOf } from "./catalogue";
import type { AuthzPort } from "./port";
import { idOf, objectOf, userOf } from "./port";

/** How far a person's permission reaches in a list: everything in the app, the named objects, or nothing. */
export type Reach = { kind: "all" } | { kind: "ids"; ids: ReadonlySet<string> } | { kind: "none" };

export const NONE: Reach = { kind: "none" };
export const ALL: Reach = { kind: "all" };

export function reaches(reach: Reach, id: string): boolean {
	return reach.kind === "all" || (reach.kind === "ids" && reach.ids.has(id));
}

export interface Access {
	/** The person is a member of the app (a Check, not a database lookup). */
	isMember(subject: string, app: string): Promise<boolean>;
	/** The estate's platform administrator (creates apps). */
	isPlatformAdmin(subject: string): Promise<boolean>;
	/** The permission on the whole app: the key itself when unscoped, `<key>_all` when scoped. */
	canAll(subject: string, app: string, key: string): Promise<boolean>;
	/** The permission on one object (scoped: `all`, or `own`/`assigned` through the object's links). */
	canOn(subject: string, app: string, key: string, type: SchedType, id: string): Promise<boolean>;
	/** What a list may show. */
	reach(subject: string, app: string, key: string, type: SchedType): Promise<Reach>;
}

export type Denials = (app: string, subject: string) => Promise<ReadonlySet<string>>;

function definition(key: string): PermissionDef {
	const def = permissionOf(key);
	if (def === undefined) throw new Error(`unknown permission key ${key}`);
	return def;
}

/**
 * Turns the catalogue and the tuples into the three questions a route asks. A permission the person was individually
 * denied (a key in their denials) is refused before OpenFGA is asked: the closure model has no exclusion.
 */
export function createAccess(authz: AuthzPort, denials: Denials): Access {
	return {
		isMember: (subject, app) => authz.check(userOf(subject), "member", objectOf("sched_app", app)),
		isPlatformAdmin: (subject) =>
			authz.check(userOf(subject), "role_sched_app_admin", objectOf("platform", "psi")),
		async canAll(subject, app, key) {
			const def = definition(key);
			if ((await denials(app, subject)).has(key)) return false;
			return authz.check(
				userOf(subject),
				def.scopes.length === 0 ? key : `${key}_all`,
				objectOf("sched_app", app),
			);
		},
		async canOn(subject, app, key, type, id) {
			const def = definition(key);
			if ((await denials(app, subject)).has(key)) return false;
			if (def.scopes.length === 0)
				return authz.check(userOf(subject), key, objectOf("sched_app", app));
			return authz.check(userOf(subject), key, objectOf(type, id));
		},
		async reach(subject, app, key, type) {
			const def = definition(key);
			if ((await denials(app, subject)).has(key)) return NONE;
			const user = userOf(subject);
			if (def.scopes.length === 0)
				return (await authz.check(user, key, objectOf("sched_app", app))) ? ALL : NONE;
			if (
				def.scopes.includes("all") &&
				(await authz.check(user, `${key}_all`, objectOf("sched_app", app)))
			)
				return ALL;
			if (!def.scopes.includes("own") && !def.scopes.includes("assigned")) return NONE;
			const ids = new Set((await authz.listObjects(user, key, type)).map(idOf));
			if (ids.size > 0) return { kind: "ids", ids };
			// Holding the permission over no object yet is an empty list; not holding it is a refusal.
			for (const scope of ["own", "assigned"] as const) {
				if (
					def.scopes.includes(scope) &&
					(await authz.check(user, `${key}_${scope}`, objectOf("sched_app", app)))
				)
					return { kind: "ids", ids };
			}
			return NONE;
		},
	};
}
