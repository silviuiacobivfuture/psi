// GENERATED FROM apps/cms/authz.manifest.json — DO NOT EDIT.
// Run `python3 authz/tools/generate.py` after changing the manifest.
//
// Every permission key the application checks comes from here. A hardcoded
// "orders:view" anywhere else is a key nothing keeps in step with the model.

export const PERMISSIONS = {
	content: {
		read: "content:read",
		write: "content:write",
		publish: "content:publish",
	},
	review: {
		clinical_review: "review:clinical_review",
	},
	media: {
		manage_media: "media:manage_media",
	},
	admin: {
		admin: "admin:admin",
	},
	ai: {
		ai_admin: "ai:ai_admin",
	},
	platform: {
		ai_operator: "platform:ai_operator",
		calendar_viewer: "platform:calendar_viewer",
		calendar_manager: "platform:calendar_manager",
		privacy_officer: "platform:privacy_officer",
		notifications_admin: "platform:notifications_admin",
		site_manager: "platform:site_manager",
	},
} as const;

/** Every permission key this application declares, sorted. */
export const ALL_PERMISSIONS = [
	"admin:admin",
	"ai:ai_admin",
	"content:publish",
	"content:read",
	"content:write",
	"media:manage_media",
	"platform:ai_operator",
	"platform:calendar_manager",
	"platform:calendar_viewer",
	"platform:notifications_admin",
	"platform:privacy_officer",
	"platform:site_manager",
	"review:clinical_review",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** The roles this application declares, with the relations each grants. */
export const ROLES = {
	"cms:admin": ["cms_brand#read", "cms_brand#write", "cms_brand#publish", "cms_brand#clinical_review", "cms_brand#manage_media", "cms_brand#admin", "cms_brand#ai_admin", "cms_brand#ai_operator", "cms_brand#calendar_viewer", "cms_brand#calendar_manager", "cms_brand#privacy_officer", "cms_brand#notifications_admin", "cms_brand#site_manager"],
	"cms:editor": ["cms_brand#read", "cms_brand#write", "cms_brand#manage_media"],
	"cms:publisher": ["cms_brand#read", "cms_brand#write", "cms_brand#publish", "cms_brand#manage_media"],
	"cms:clinical_reviewer": ["cms_brand#read", "cms_brand#clinical_review"],
	"cms:reader": ["cms_brand#read"],
	"cms:ai_admin": ["cms_brand#read", "cms_brand#ai_admin", "cms_brand#ai_operator"],
	"cms:ai_operator": ["cms_brand#read", "cms_brand#ai_operator"],
	"cms:calendar_viewer": ["cms_brand#read", "cms_brand#calendar_viewer"],
	"cms:calendar_manager": ["cms_brand#read", "cms_brand#calendar_viewer", "cms_brand#calendar_manager"],
	"cms:privacy_officer": ["cms_brand#read", "cms_brand#privacy_officer"],
	"cms:notifications_admin": ["cms_brand#read", "cms_brand#notifications_admin"],
	"cms:site_manager": ["cms_brand#read", "cms_brand#site_manager"],
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
	"cms:admin": { scopeType: "platform", relation: "role_cms_admin" },
	"cms:editor": { scopeType: "platform", relation: "role_cms_editor" },
	"cms:publisher": { scopeType: "platform", relation: "role_cms_publisher" },
	"cms:clinical_reviewer": { scopeType: "platform", relation: "role_cms_clinical_reviewer" },
	"cms:reader": { scopeType: "platform", relation: "role_cms_reader" },
	"cms:ai_admin": { scopeType: "platform", relation: "role_cms_ai_admin" },
	"cms:ai_operator": { scopeType: "platform", relation: "role_cms_ai_operator" },
	"cms:calendar_viewer": { scopeType: "platform", relation: "role_cms_calendar_viewer" },
	"cms:calendar_manager": { scopeType: "platform", relation: "role_cms_calendar_manager" },
	"cms:privacy_officer": { scopeType: "platform", relation: "role_cms_privacy_officer" },
	"cms:notifications_admin": { scopeType: "platform", relation: "role_cms_notifications_admin" },
	"cms:site_manager": { scopeType: "platform", relation: "role_cms_site_manager" },
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
	"content:read": ["cms:admin", "cms:editor", "cms:publisher", "cms:clinical_reviewer", "cms:reader", "cms:ai_admin", "cms:ai_operator", "cms:calendar_viewer", "cms:calendar_manager", "cms:privacy_officer", "cms:notifications_admin", "cms:site_manager"],
	"content:write": ["cms:admin", "cms:editor", "cms:publisher"],
	"content:publish": ["cms:admin", "cms:publisher"],
	"review:clinical_review": ["cms:admin", "cms:clinical_reviewer"],
	"media:manage_media": ["cms:admin", "cms:editor", "cms:publisher"],
	"admin:admin": ["cms:admin"],
	"ai:ai_admin": ["cms:admin", "cms:ai_admin"],
	"platform:ai_operator": ["cms:admin", "cms:ai_admin", "cms:ai_operator"],
	"platform:calendar_viewer": ["cms:admin", "cms:calendar_viewer", "cms:calendar_manager"],
	"platform:calendar_manager": ["cms:admin", "cms:calendar_manager"],
	"platform:privacy_officer": ["cms:admin", "cms:privacy_officer"],
	"platform:notifications_admin": ["cms:admin", "cms:notifications_admin"],
	"platform:site_manager": ["cms:admin", "cms:site_manager"],
};

/**
 * Which DIRECT tuples on a scope confer each permission.
 *
 * A subject holds the permission in a scope exactly when a tuple
 * `user:<subject> <relation> <scopeType>:<id>` exists for ANY listed relation.
 * Computed at build time by walking the model's rewrites
 * (authz/tools/gen/closure.py) and PROVEN against the real engine by the
 * generated authz/tests/cms.closure.fga.yaml, in both directions.
 * The mirror answers from this with exact lookups and walks nothing.
 */
export const PERMISSION_CLOSURE = {
	"content:read": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_ai_admin", "role_cms_ai_operator", "role_cms_calendar_manager", "role_cms_calendar_viewer", "role_cms_clinical_reviewer", "role_cms_editor", "role_cms_notifications_admin", "role_cms_privacy_officer", "role_cms_publisher", "role_cms_reader", "role_cms_site_manager"], viaSet: [] },
	"content:write": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_editor", "role_cms_publisher"], viaSet: [] },
	"content:publish": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_publisher"], viaSet: [] },
	"review:clinical_review": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_clinical_reviewer"], viaSet: [] },
	"media:manage_media": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_editor", "role_cms_publisher"], viaSet: [] },
	"admin:admin": { scopeType: "platform", relations: ["administrator", "role_cms_admin"], viaSet: [] },
	"ai:ai_admin": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_ai_admin"], viaSet: [] },
	"platform:ai_operator": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_ai_admin", "role_cms_ai_operator"], viaSet: [] },
	"platform:calendar_viewer": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_calendar_manager", "role_cms_calendar_viewer"], viaSet: [] },
	"platform:calendar_manager": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_calendar_manager"], viaSet: [] },
	"platform:privacy_officer": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_privacy_officer"], viaSet: [] },
	"platform:notifications_admin": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_notifications_admin"], viaSet: [] },
	"platform:site_manager": { scopeType: "platform", relations: ["administrator", "role_cms_admin", "role_cms_site_manager"], viaSet: [] },
} as const satisfies Record<Permission, { scopeType: string; relations: readonly string[]; viaSet: readonly string[] }>;

/** The object type of an organisation's own permission sets. */
export const PERMISSION_SET_TYPE = "cms_permission_set";
