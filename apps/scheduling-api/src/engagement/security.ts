import type { Deps } from "../http/context";

export type SecurityAction = "delete" | "roles" | "members" | "settings";

/**
 * What the owners are told of the moment it happens: data leaving, data deleted, who may do what changed, the app's own
 * settings changed. Keyed by the audit action the service already writes, so nothing can be sensitive without being audited
 * and nothing audited is sensitive by accident: a new action is one line here and a case in the tests.
 */
const SENSITIVE: Readonly<Record<string, SecurityAction>> = {
	"client.delete": "delete",
	"record.delete": "delete",
	"file.delete": "delete",
	"package.delete": "delete",
	"payment.delete": "delete",
	"role.create": "roles",
	"role.update": "roles",
	"role.permissions": "roles",
	"role.delete": "roles",
	"member.put": "members",
	"member.remove": "members",
	"member.overrides": "members",
	"app.update": "settings",
};

export const sensitiveOf = (auditAction: string): SecurityAction | undefined =>
	SENSITIVE[auditAction];

/** Tells the owners (those who read the audit log) what was done and by whom. A failure to tell never fails the action. */
export async function tellOwners(
	deps: Deps,
	input: {
		app: string;
		requestId: string;
		subject: string;
		auditAction: string;
		targetType: string;
	},
): Promise<void> {
	const action = sensitiveOf(input.auditAction);
	if (action === undefined) return;
	try {
		await deps.notifier.notify({
			app: input.app,
			event: "security.action",
			to: { kind: "team", permission: "audit_log_view" },
			payload: { action, actor: input.subject, target: input.targetType },
			idempotencyKey: `${input.app}:security.action:${input.requestId}:${input.auditAction}`,
		});
	} catch {
		deps.log({
			level: "error",
			event: "notify_failed",
			requestId: input.requestId,
			notification: "security.action",
		});
	}
}
