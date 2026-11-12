// GENERATED FROM apps/psizone-web/authz.manifest.json — DO NOT EDIT.
// Run `python3 authz/tools/generate.py` after changing the manifest.
//
// Every permission key the application checks comes from here. A hardcoded
// "orders:view" anywhere else is a key nothing keeps in step with the model.

export const PERMISSIONS = {
	account: {
		view: "account:view",
		manage: "account:manage",
		erase: "account:erase",
	},
	bookings: {
		view: "bookings:view",
		manage: "bookings:manage",
	},
	guide_memory: {
		view: "guide_memory:view",
		forget: "guide_memory:forget",
	},
} as const;

/** Every permission key this application declares, sorted. */
export const ALL_PERMISSIONS = [
	"account:erase",
	"account:manage",
	"account:view",
	"bookings:manage",
	"bookings:view",
	"guide_memory:forget",
	"guide_memory:view",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** The roles this application declares, with the relations each grants. */
export const ROLES = {
	"psizone:reception": ["psizone_booking_request#viewer", "psizone_booking_request#editor"],
	"psizone:privacy_officer": ["psizone_account#viewer", "psizone_account#eraser"],
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
	"psizone:reception": { scopeType: "platform", relation: "role_psizone_reception" },
	"psizone:privacy_officer": { scopeType: "platform", relation: "role_psizone_privacy_officer" },
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
	"account:view": ["psizone:privacy_officer"],
	"account:manage": [],
	"account:erase": ["psizone:privacy_officer"],
	"bookings:view": ["psizone:reception"],
	"bookings:manage": ["psizone:reception"],
	"guide_memory:view": [],
	"guide_memory:forget": [],
};

/**
 * Which DIRECT tuples on a scope confer each permission.
 *
 * A subject holds the permission in a scope exactly when a tuple
 * `user:<subject> <relation> <scopeType>:<id>` exists for ANY listed relation.
 * Computed at build time by walking the model's rewrites
 * (authz/tools/gen/closure.py) and PROVEN against the real engine by the
 * generated authz/tests/psizone.closure.fga.yaml, in both directions.
 * The mirror answers from this with exact lookups and walks nothing.
 */
export const PERMISSION_CLOSURE = {
	"account:view": { scopeType: "platform", relations: ["administrator", "perm_psizone_account_erase", "perm_psizone_account_manage", "perm_psizone_account_view", "role_psizone_privacy_officer"], viaSet: [] },
	"account:manage": { scopeType: "platform", relations: ["administrator", "perm_psizone_account_manage"], viaSet: [] },
	"account:erase": { scopeType: "platform", relations: ["administrator", "perm_psizone_account_erase", "role_psizone_privacy_officer"], viaSet: [] },
	"bookings:view": { scopeType: "platform", relations: ["administrator", "perm_psizone_bookings_manage", "perm_psizone_bookings_view", "role_psizone_reception"], viaSet: [] },
	"bookings:manage": { scopeType: "platform", relations: ["administrator", "perm_psizone_bookings_manage", "role_psizone_reception"], viaSet: [] },
	"guide_memory:view": { scopeType: "platform", relations: ["administrator", "perm_psizone_guide_memory_forget", "perm_psizone_guide_memory_view"], viaSet: [] },
	"guide_memory:forget": { scopeType: "platform", relations: ["administrator", "perm_psizone_guide_memory_forget"], viaSet: [] },
} as const satisfies Record<Permission, { scopeType: string; relations: readonly string[]; viaSet: readonly string[] }>;

/** The object type of an organisation's own permission sets. */
export const PERMISSION_SET_TYPE = "psizone_permission_set";
