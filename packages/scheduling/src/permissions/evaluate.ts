import {
	type Action,
	CATALOGUE,
	type FieldGroup,
	isFieldGroup,
	isPermissionKey,
	permissionKey,
	type Resource,
	type Scope,
} from "./catalogue";

/** A role as the evaluation needs it: the catalogue keys it holds. */
export interface RoleGrants {
	readonly name: string;
	readonly permissions: ReadonlyArray<string>;
}

/** A per-person override on top of roles. Deny wins over every grant. */
export interface Override {
	readonly permission: string;
	readonly effect: "grant" | "deny";
}

export interface EffectivePermissions {
	readonly granted: ReadonlySet<string>;
	readonly denied: ReadonlySet<string>;
	/** Keys found in roles or overrides that the catalogue does not define; they grant nothing. */
	readonly unknown: ReadonlyArray<string>;
}

/** What a person can do: the union of their roles and personal grants, with denies kept apart. */
export function effectivePermissions(
	roles: ReadonlyArray<RoleGrants>,
	overrides: ReadonlyArray<Override> = [],
): EffectivePermissions {
	const granted = new Set<string>();
	const denied = new Set<string>();
	const unknown = new Set<string>();
	const take = (key: string, into: Set<string>): void => {
		if (isPermissionKey(key)) into.add(key);
		else unknown.add(key);
	};
	for (const role of roles) for (const key of role.permissions) take(key, granted);
	for (const o of overrides) take(o.permission, o.effect === "grant" ? granted : denied);
	return { granted, denied, unknown: [...unknown].sort() };
}

/**
 * The relations of the person to the thing, computed from data (`scopeFactsFor`), never from
 * code: `own` (their own calendar, a client they treat, their own leave) and `assigned` (what
 * belongs to a practitioner they coordinate). `fieldGroup` is the group of fields being touched.
 */
export interface ScopeFacts {
	readonly own: boolean;
	readonly assigned: boolean;
	readonly fieldGroup?: FieldGroup;
}

export type Refusal =
	| "unknown_permission"
	| "not_granted"
	| "denied_by_override"
	| "scope_not_met"
	| "field_group_not_granted";

export type Decision =
	| { readonly allowed: true; readonly scope: Scope }
	| { readonly allowed: false; readonly reason: Refusal };

const WIDEST_FIRST: ReadonlyArray<Scope> = ["all", "assigned", "own"];

/**
 * May the person do `action` on `resource`, given how the thing relates to them? The answer says
 * why not, with one reason per case:
 * - `unknown_permission`: the catalogue has no such action on that resource, or no such field group.
 * - `not_granted`: nothing grants the action at any scope.
 * - `denied_by_override`: it was granted but a personal deny removed every grant that applies.
 * - `field_group_not_granted`: the action is granted, but not for the field group asked.
 * - `scope_not_met`: granted for `assigned` or `own` only, and the thing is neither.
 * A key without a field group grants identity only (name, status, ids); each field group needs its
 * own key, and a deny of a key denies exactly that key.
 */
export function can(
	perms: EffectivePermissions,
	resource: Resource,
	action: Action,
	facts: ScopeFacts,
): Decision {
	const def = CATALOGUE[resource];
	const group = facts.fieldGroup;
	const groupOk =
		group === undefined
			? true
			: def.fieldGroups !== undefined &&
				isFieldGroup(group) &&
				(group.startsWith("custom-") || def.fieldGroups.some((g) => g === group));
	if (!def.actions.includes(action) || !groupOk) {
		return { allowed: false, reason: "unknown_permission" };
	}
	// A field group is granted only by its own key; the key without a group is identity alone.
	const hit = (set: ReadonlySet<string>, scope: Scope): boolean =>
		set.has(
			permissionKey({
				resource,
				action,
				scope,
				...(group === undefined ? {} : { fieldGroup: group }),
			}),
		);
	const standing: Scope[] = [];
	let deniedAny = false;
	for (const scope of WIDEST_FIRST) {
		if (!def.scopes.includes(scope) || !hit(perms.granted, scope)) continue;
		if (hit(perms.denied, scope)) deniedAny = true;
		else standing.push(scope);
	}
	if (standing.length === 0) {
		if (deniedAny) return { allowed: false, reason: "denied_by_override" };
		const anyGrant = [...perms.granted].some((key) => key.startsWith(`${resource}_${action}_`));
		return { allowed: false, reason: anyGrant ? "field_group_not_granted" : "not_granted" };
	}
	const met = standing.find(
		(scope) => scope === "all" || (scope === "assigned" ? facts.assigned : facts.own),
	);
	return met === undefined
		? { allowed: false, reason: "scope_not_met" }
		: { allowed: true, scope: met };
}
