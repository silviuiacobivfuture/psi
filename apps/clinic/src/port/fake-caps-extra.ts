import type { Role, ScopeName } from "./schema";

/** The record resources of the service's catalogue besides `report_custom` (the role editor's "clinical" row). */
const TEMPLATE_RECORDS = [
	"report_aba",
	"report_racemeup",
	"report_psychotherapy",
	"questionnaire_parent",
] as const;

/**
 * Permissions the fake derives from a role where the role editor's rows are coarser than the service's catalogue:
 * the clinical row grants every template's records, the blacklist's `create_warn`, and the elevated override belongs
 * to whoever administers roles. A service answers these itself.
 */
export function extraCapabilities(role: Pick<Role, "grants">): Record<string, ScopeName[]> {
	const out: Record<string, ScopeName[]> = {};
	const clinical = role.grants.clinical ?? {};
	for (const [action, scope] of Object.entries(clinical)) {
		const verb = action === "cancel" ? "delete" : action;
		for (const resource of TEMPLATE_RECORDS) out[`${resource}_${verb}`] = [scope];
	}
	const blacklist = role.grants.blacklist ?? {};
	if (blacklist.create !== undefined) out.blacklist_create_warn = [blacklist.create];
	if (blacklist.approve !== undefined && role.grants.roles?.edit !== undefined)
		out.blacklist_override_admin = [blacklist.approve];
	return out;
}
