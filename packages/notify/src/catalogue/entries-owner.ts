import type { Entry } from "./entry";

/** The owner and the administrators: the clinic's numbers, what went wrong, and what was done that cannot be undone. */
export const OWNER_ENTRIES: ReadonlyArray<Entry> = [
	{
		event: "leave.requested",
		audience: "owners",
		channels: ["in_app", "push"],
		kind: "leave",
		push: "requests",
		needs: "leave_approve",
		path: () => "/roster/leave",
	},
	{
		event: "digest.owner_daily",
		audience: "owners",
		channels: ["in_app", "email"],
		defaults: ["email"],
		kind: "digests",
		needs: "reports_view",
		path: () => "/admin",
	},
	{
		event: "digest.owner_weekly",
		audience: "owners",
		channels: ["in_app", "email"],
		defaults: ["email"],
		kind: "digests",
		needs: "reports_view",
		path: () => "/admin",
	},
	{
		event: "feedback.negative",
		audience: "owners",
		channels: ["in_app", "email"],
		kind: "feedback",
		needs: "feedback_view",
		path: () => "/more",
	},
	{
		event: "delivery.failed",
		audience: "owners",
		channels: ["in_app", "email"],
		defaults: ["in_app"],
		kind: "alerts",
		needs: "app_settings_edit",
		path: () => "/admin",
	},
	{
		event: "security.action",
		audience: "owners",
		channels: ["in_app", "email"],
		locked: ["in_app"],
		kind: "security",
		needs: "audit_log_view",
		path: () => "/audit",
	},
];
