import type { SchedType } from "@psi/scheduling-sdk/contract";
import { appRelations, parseRelation, permissionOf } from "./catalogue";
import { objectOf, type Tuple, userOf } from "./port";

/** Facts that tie an object to its app and to people. They are the only way a scoped permission finds the object. */
export const appLink = (type: SchedType, id: string, app: string): Tuple => ({
	user: objectOf("sched_app", app),
	relation: "app",
	object: objectOf(type, id),
});
export const parentLink = (
	type: SchedType,
	id: string,
	relation: "calendar" | "client",
	parentType: SchedType,
	parentId: string,
): Tuple => ({ user: objectOf(parentType, parentId), relation, object: objectOf(type, id) });
export const treatingLink = (clientId: string, personId: string): Tuple => ({
	user: objectOf("sched_calendar", personId),
	relation: "treating",
	object: objectOf("sched_client", clientId),
});
export const ownerLink = (personId: string, subject: string): Tuple => ({
	user: userOf(subject),
	relation: "owner",
	object: objectOf("sched_calendar", personId),
});
export const coordinatorLink = (personId: string, subject: string): Tuple => ({
	user: userOf(subject),
	relation: "coordinator",
	object: objectOf("sched_calendar", personId),
});
export const memberLink = (app: string, subject: string): Tuple => ({
	user: userOf(subject),
	relation: "member",
	object: objectOf("sched_app", app),
});
export const roleHolder = (roleId: string, subject: string): Tuple => ({
	user: userOf(subject),
	relation: "member",
	object: objectOf("sched_role", roleId),
});
export const roleAppLink = (roleId: string, app: string): Tuple =>
	appLink("sched_role", roleId, app);

/** A role's permission as a tuple: the role's members hold the relation on the app. */
export const roleGrant = (roleId: string, app: string, relation: string): Tuple => ({
	user: `${objectOf("sched_role", roleId)}#member`,
	relation,
	object: objectOf("sched_app", app),
});
export const personalGrant = (app: string, subject: string, relation: string): Tuple => ({
	user: userOf(subject),
	relation,
	object: objectOf("sched_app", app),
});

/** The relation names a role may hold: every app relation of the catalogue. */
export function isAppRelation(relation: string): boolean {
	return parseRelation(relation) !== undefined;
}

/** `appointments_edit` (all its scopes) or one scoped relation, as the relations to hold. */
export function relationsFor(entry: string): string[] {
	const def = permissionOf(entry);
	return def === undefined ? (isAppRelation(entry) ? [entry] : []) : appRelations(def);
}
