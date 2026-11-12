// GENERATED FROM apps/eqsync-web/authz.manifest.json — DO NOT EDIT.
// Run `python3 authz/tools/generate.py` after changing the manifest.
//
// Every permission key the application checks comes from here. A hardcoded
// "orders:view" anywhere else is a key nothing keeps in step with the model.

export const PERMISSIONS = {
	programme: {
		view: "programme:view",
		manage: "programme:manage",
	},
	protocols: {
		listen: "protocols:listen",
	},
} as const;

/** Every permission key this application declares, sorted. */
export const ALL_PERMISSIONS = [
	"programme:manage",
	"programme:view",
	"protocols:listen",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** The roles this application declares, with the relations each grants. */
export const ROLES = {
	"eqsync:programme_support": ["eqsync_programme_enrollment#viewer"],
} as const;

/**
 * The standing relation a person HOLDS to be each role.
 *
 * This is what a directory membership writes and what the local mirror
 * carries — `org:<tenant>#administrator`. A guard asks about THIS, not
 * about the relations below it: the mirror holds tuples and does no graph
 * evaluation, so the one question it can answer exactly is whether somebody
 * holds a role in a tenant.
 *
 * A role that is not scope-grantable is absent, not empty-stringed: a guard
 * must not be able to ask a question no tuple could ever answer.
 */
export const ROLE_RELATIONS = {
	"eqsync:programme_support": { scopeType: "platform", relation: "role_eqsync_programme_support" },
} as const;

/**
 * Which roles confer each permission.
 *
 * DERIVED by intersecting every permission's `grants` with every role's.
 * A permission no declared role confers maps to an EMPTY list, which a guard
 * must treat as a refusal rather than as a missing entry — the two are
 * indistinguishable to a lookup and only one of them is safe.
 */

export const PERMISSION_ROLES: Record<string, readonly string[]> = {
	"programme:view": ["eqsync:programme_support"],
	"programme:manage": [],
	"protocols:listen": [],
};

/**
 * Which DIRECT tuples on a scope confer each permission.
 *
 * A subject holds the permission in a scope exactly when a tuple
 * `user:<subject> <relation> <scopeType>:<id>` exists for ANY listed relation.
 * Computed at build time by walking the model's rewrites
 * (authz/tools/gen/closure.py) and PROVEN against the real engine by the
 * generated authz/tests/eqsync.closure.fga.yaml, in both directions.
 * The mirror answers from this with exact lookups and walks nothing.
 */
export const PERMISSION_CLOSURE = {
	"programme:view": { scopeType: "platform", relations: ["administrator", "perm_eqsync_programme_manage", "perm_eqsync_programme_view", "role_eqsync_programme_support"], viaSet: [] },
	"programme:manage": { scopeType: "platform", relations: ["administrator", "perm_eqsync_programme_manage"], viaSet: [] },
	"protocols:listen": { scopeType: "platform", relations: ["administrator", "perm_eqsync_protocols_listen"], viaSet: [] },
} as const satisfies Record<Permission, { scopeType: string; relations: readonly string[]; viaSet: readonly string[] }>;

/** The object type of an organisation's own permission sets. */
export const PERMISSION_SET_TYPE = "eqsync_permission_set";
