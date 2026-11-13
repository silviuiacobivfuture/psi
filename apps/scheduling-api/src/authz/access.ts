import type { SchedType } from "@psi/scheduling-sdk/contract";
import {
	appRelation,
	appRelations,
	checkedOn,
	type PermissionDef,
	permissionOf,
} from "./catalogue";
import { REACH_ASSIGNED, REACH_OWN } from "./model";
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
	/** The permission on the whole app: its `_all` relation. `key` is the catalogue key without a scope (`clients_view`). */
	canAll(subject: string, app: string, key: string): Promise<boolean>;
	/** The permission on one object (`all`, or `own`/`assigned` through the object's links). */
	canOn(subject: string, app: string, key: string, type: SchedType, id: string): Promise<boolean>;
	/** What a list may show. */
	reach(subject: string, app: string, key: string, type: SchedType): Promise<Reach>;
	/** The scopes at which the person holds the permission on the app (denied ones excluded). */
	scopesHeld(subject: string, app: string, key: string): Promise<("all" | "assigned" | "own")[]>;
	/** `scopesHeld` for many permissions in ONE round trip (a console asks for all ~140 at once). */
	scopesHeldMany(
		subject: string,
		app: string,
		keys: readonly string[],
	): Promise<Map<string, ("all" | "assigned" | "own")[]>>;
}

/** The catalogue keys (with their scope) a person was individually denied in an app. */
export type Denials = (app: string, subject: string) => Promise<ReadonlySet<string>>;

function definition(key: string): PermissionDef {
	const def = permissionOf(key);
	if (def === undefined) throw new Error(`unknown permission key ${key}`);
	return def;
}

const REACH_RELATION = { own: REACH_OWN, assigned: REACH_ASSIGNED } as const;

/**
 * Turns the catalogue and the tuples into the questions a route asks. A permission the person was individually denied
 * is refused before OpenFGA is asked when it is the only way in (the closure model has no exclusion); when the denial
 * removes one scope of several, the scopes are evaluated one by one against the object's reach.
 */
export function createAccess(authz: AuthzPort, denials: Denials): Access {
	async function scopesHeld(
		subject: string,
		app: string,
		def: PermissionDef,
	): Promise<("all" | "assigned" | "own")[]> {
		const denied = await denials(app, subject);
		const user = userOf(subject);
		const held: ("all" | "assigned" | "own")[] = [];
		for (const scope of def.scopes) {
			const relation = appRelation(def, scope);
			if (denied.has(relation)) continue;
			if (await authz.check(user, relation, objectOf("sched_app", app))) held.push(scope);
		}
		return held;
	}
	const denies = async (app: string, subject: string, def: PermissionDef): Promise<boolean> => {
		const denied = await denials(app, subject);
		return appRelations(def).some((relation) => denied.has(relation));
	};
	return {
		isMember: (subject, app) => authz.check(userOf(subject), "member", objectOf("sched_app", app)),
		isPlatformAdmin: (subject) =>
			authz.check(userOf(subject), "role_sched_app_admin", objectOf("platform", "psi")),
		scopesHeld: (subject, app, key) => scopesHeld(subject, app, definition(key)),
		async scopesHeldMany(subject, app, keys) {
			const denied = await denials(app, subject);
			const asked: { key: string; scope: "all" | "assigned" | "own"; relation: string }[] = [];
			for (const key of keys) {
				const def = definition(key);
				for (const scope of def.scopes) {
					const relation = appRelation(def, scope);
					if (!denied.has(relation)) asked.push({ key, scope, relation });
				}
			}
			const answers = await authz.checkMany(
				asked.map((q) => ({
					user: userOf(subject),
					relation: q.relation,
					object: objectOf("sched_app", app),
				})),
			);
			const held = new Map<string, ("all" | "assigned" | "own")[]>(keys.map((k) => [k, []]));
			asked.forEach((q, i) => {
				if (answers[i] === true) held.get(q.key)?.push(q.scope);
			});
			return held;
		},
		async canAll(subject, app, key) {
			const def = definition(key);
			if ((await denials(app, subject)).has(appRelation(def, "all"))) return false;
			return authz.check(userOf(subject), appRelation(def, "all"), objectOf("sched_app", app));
		},
		async canOn(subject, app, key, type, id) {
			const def = definition(key);
			if (!checkedOn(def, type)) {
				if (!checkedOn(def, "sched_app")) throw new Error(`${key} is not checked on ${type}`);
				return (await scopesHeld(subject, app, def)).includes("all");
			}
			const user = userOf(subject);
			if (!(await denies(app, subject, def))) return authz.check(user, key, objectOf(type, id));
			// A denied scope removes that way in only: evaluate each remaining scope against the object's reach.
			for (const scope of await scopesHeld(subject, app, def)) {
				if (scope === "all") return true;
				if (await authz.check(user, REACH_RELATION[scope], objectOf(type, id))) return true;
			}
			return false;
		},
		async reach(subject, app, key, type) {
			const def = definition(key);
			const held = await scopesHeld(subject, app, def);
			if (held.includes("all")) return ALL;
			if (held.length === 0) return NONE;
			if (!checkedOn(def, type)) return NONE;
			// Holding the permission over no object yet is an empty list, not a refusal.
			const user = userOf(subject);
			const ids = new Set<string>();
			for (const scope of held)
				if (scope !== "all")
					for (const o of await authz.listObjects(user, REACH_RELATION[scope], type))
						ids.add(idOf(o));
			return { kind: "ids", ids };
		},
	};
}
