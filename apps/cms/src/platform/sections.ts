import type { Relation } from "../authz/types";

/**
 * The control plane's sections and the relation each needs, to see it and to act in it. The
 * relations are cms_brand relations from authz.manifest.json; nothing here is a role.
 */
export const SECTIONS = {
	overview: { view: "read", act: null },
	ai: { view: "read", act: "ai_operator" },
	scheduling: { view: "calendar_viewer", act: "calendar_manager" },
	accounts: { view: "privacy_officer", act: "privacy_officer" },
	notifications: { view: "notifications_admin", act: "notifications_admin" },
	siteSettings: { view: "read", act: "site_manager" },
} as const satisfies Record<string, { view: Relation; act: Relation | null }>;
export type Section = keyof typeof SECTIONS;
