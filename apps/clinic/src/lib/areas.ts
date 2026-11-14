import type { AdminIcon } from "@psi/ui/admin";
import type { Can } from "./can";

/** The permission key that stands for "the estate's platform administrator" in a gate. */
export const PLATFORM_KEY = "@platform";

export const AREA_GROUPS = [
	"team",
	"services",
	"scheduling",
	"clients",
	"builder",
	"data",
] as const;
export type AreaGroup = (typeof AREA_GROUPS)[number];

export interface OrgArea {
	id: string;
	group: AreaGroup;
	href: string;
	/** Any one of these opens it. */
	keys: ReadonlyArray<string>;
	icon: AdminIcon;
	/** False: the screen says "în curând" until the service has what it needs. */
	built: boolean;
}

const area = <I extends string>(
	id: I,
	group: AreaGroup,
	keys: string[],
	icon: AdminIcon,
	built: boolean,
): OrgArea & { id: I } => ({ id, group, href: `/settings/${id}`, keys, icon, built });

/**
 * ORGANISATION settings: everything that configures THIS app (tenant), each gated by its own permission. Per-person
 * settings live at /me/settings, the platform's own administration at /platform.
 */
export const ORG_AREAS = [
	area("profile", "team", ["app_settings_view"], "settings", true),
	area("people", "team", ["people_view"], "users", true),
	area("roles", "team", ["roles_view"], "shield", true),
	area("services", "services", ["services_view"], "list", true),
	area("rooms", "services", ["rooms_view"], "sidebar", true),
	area("devices", "services", ["devices_view"], "settings", true),
	area("plan", "services", ["app_settings_edit"], "sidebar", true),
	area("hours", "scheduling", ["roster_edit"], "clock", false),
	area("online", "scheduling", ["app_settings_edit"], "calendar", false),
	area("templates", "scheduling", ["app_settings_edit"], "chat", false),
	area("blacklist", "clients", ["blacklist_view"], "alert", true),
	area("feedback", "clients", ["feedback_view"], "chat", false),
	area("reports", "clients", ["app_settings_edit"], "list", false),
	area("builder", "builder", ["builder_view"], "edit", false),
	area("privacy", "data", ["app_settings_edit"], "shield", false),
	area("audit", "data", ["audit_log_view"], "list", true),
	area("import", "data", ["imports_exports_imports_view"], "archive", false),
] as const satisfies ReadonlyArray<OrgArea>;
export type OrgAreaDef = (typeof ORG_AREAS)[number];
export type OrgAreaId = OrgAreaDef["id"];

export const areaOpen = (a: OrgAreaDef, can: Can): boolean => can.any(...a.keys);
export const openAreas = (can: Can): ReadonlyArray<OrgAreaDef> =>
	ORG_AREAS.filter((a) => areaOpen(a, can));
export const orgSettingsOpen = (can: Can): boolean => openAreas(can).length > 0;
