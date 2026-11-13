import type { Doc, TableNames } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Every table that holds an app's clinic data, with the one place that reads an app's rows of a
 * table (every index starts with the app). Counts (restore drills, tests) and the test-fixture
 * drop use it, so a new table cannot be forgotten in one and remembered in the other: the
 * `never` default makes a table added to the list but not to the switch a type error.
 */
export const CLINIC_TABLES = [
	"practitioners",
	"rooms",
	"devices",
	"groupActivities",
	"staffMembers",
	"clients",
	"clientKeys",
	"treating",
	"coordinatorAssignments",
	"packages",
	"payments",
	"visits",
	"rosterDays",
	"staffBlocks",
	"formDefinitions",
	"formResponses",
	"customFieldDefs",
	"customValues",
	"builderDefs",
	"files",
	"roles",
	"roleMembers",
	"permissionOverrides",
	"appKeys",
	"auditEvents",
	"storageOutbox",
	"changeLog",
	"blacklistEntries",
	"blacklistEvents",
	"feedback",
	"feedbackReplies",
	"feedbackLinks",
] as const satisfies ReadonlyArray<TableNames>;
export type ClinicTable = (typeof CLINIC_TABLES)[number];

const LIMIT = 20_000;

export async function rowsOf(
	ctx: QueryCtx,
	tenant: string,
	table: ClinicTable,
): Promise<ReadonlyArray<Doc<ClinicTable>>> {
	switch (table) {
		case "practitioners":
			return ctx.db
				.query("practitioners")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "rooms":
			return ctx.db
				.query("rooms")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "devices":
			return ctx.db
				.query("devices")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "groupActivities":
			return ctx.db
				.query("groupActivities")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "staffMembers":
			return ctx.db
				.query("staffMembers")
				.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "clients":
			return ctx.db
				.query("clients")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "clientKeys":
			return ctx.db
				.query("clientKeys")
				.withIndex("by_tenant_key", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "treating":
			return ctx.db
				.query("treating")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "coordinatorAssignments":
			return ctx.db
				.query("coordinatorAssignments")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "packages":
			return ctx.db
				.query("packages")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "payments":
			return ctx.db
				.query("payments")
				.withIndex("by_tenant_package", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "visits":
			return ctx.db
				.query("visits")
				.withIndex("by_tenant_start", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "rosterDays":
			return ctx.db
				.query("rosterDays")
				.withIndex("by_tenant_date", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "staffBlocks":
			return ctx.db
				.query("staffBlocks")
				.withIndex("by_tenant_person_start", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "formDefinitions":
			return ctx.db
				.query("formDefinitions")
				.withIndex("by_tenant_key_version", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "formResponses":
			return ctx.db
				.query("formResponses")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "customFieldDefs":
			return ctx.db
				.query("customFieldDefs")
				.withIndex("by_tenant_entity_key", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "customValues":
			return ctx.db
				.query("customValues")
				.withIndex("by_tenant_entity", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "builderDefs":
			return ctx.db
				.query("builderDefs")
				.withIndex("by_tenant_kind_key", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "files":
			return ctx.db
				.query("files")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "roles":
			return ctx.db
				.query("roles")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "roleMembers":
			return ctx.db
				.query("roleMembers")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "permissionOverrides":
			return ctx.db
				.query("permissionOverrides")
				.withIndex("by_tenant_subject", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "appKeys":
			return ctx.db
				.query("appKeys")
				.withIndex("by_tenant_version", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "auditEvents":
			return ctx.db
				.query("auditEvents")
				.withIndex("by_tenant_at", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "storageOutbox":
			return ctx.db
				.query("storageOutbox")
				.withIndex("by_tenant_created", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "changeLog":
			return ctx.db
				.query("changeLog")
				.withIndex("by_tenant", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "blacklistEntries":
			return ctx.db
				.query("blacklistEntries")
				.withIndex("by_tenant_active", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "blacklistEvents":
			return ctx.db
				.query("blacklistEvents")
				.withIndex("by_tenant_at", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "feedback":
			return ctx.db
				.query("feedback")
				.withIndex("by_tenant_created", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "feedbackReplies":
			return ctx.db
				.query("feedbackReplies")
				.withIndex("by_tenant_feedback", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		case "feedbackLinks":
			return ctx.db
				.query("feedbackLinks")
				.withIndex("by_tenant_jti", (q) => q.eq("tenant", tenant))
				.take(LIMIT);
		default: {
			const never: never = table;
			throw new Error(`unlisted table ${String(never)}`);
		}
	}
}
