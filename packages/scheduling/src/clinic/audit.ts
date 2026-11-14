import { z } from "zod";
import { auditChangesSchema, changeProblem } from "./audit-changes";

export const AUDIT_ACTIONS = [
	"app.create",
	"key.install",
	"key.rotate",
	"client.create",
	"client.update",
	"client.archive",
	"client.unarchive",
	"client.delete",
	"client.restore",
	"client.erase",
	"client.practitioner_change",
	"visit.create",
	"visit.update",
	"visit.cancel",
	"package.create",
	"package.update",
	"payment.add",
	"payment.refund",
	"roster.set",
	"staff_block.set",
	"form.define",
	"record.write",
	"record.read",
	"file.add",
	"file.remove",
	"file.read",
	"role.change",
	"member.change",
	"override.change",
	"builder.change",
	"import.batch",
	"blacklist.create",
	"blacklist.update",
	"blacklist.delete",
	"blacklist.hit",
	"blacklist.override",
	"feedback.create",
	"feedback.reply",
	"feedback.status",
	"feedback.link",
	"feedback.erase",
	"report.export",
	"note.create",
	"note.update",
	"note.delete",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
	"app",
	"key",
	"client",
	"visit",
	"package",
	"payment",
	"roster",
	"staff_block",
	"form",
	"record",
	"file",
	"role",
	"member",
	"override",
	"builder",
	"import",
	"blacklist",
	"feedback",
	"report",
	"note",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,47}$/;

/**
 * What a caller gives to record an event. There is NO free text: the summary is built from the
 * action, the names of the fields that changed and a count, so a client's name, a diagnosis or a
 * note can never end up in the log.
 */
export const auditInputSchema = z
	.object({
		tenant: z.string().min(1),
		at: z.number().int().nonnegative(),
		/** The staff subject (or `system:<process>`). */
		actor: z.string().min(1).max(200),
		action: z.enum(AUDIT_ACTIONS),
		entity: z.enum(AUDIT_ENTITIES),
		/** The id of the thing (the store's id, an old id for an import, or a member's subject). */
		entityId: z.string().min(1).max(200),
		fields: z.array(z.string().regex(FIELD_NAME)).max(40).optional(),
		count: z.number().int().nonnegative().optional(),
		/** Before and after of a team change, and nothing else (audit-changes.ts). */
		changes: auditChangesSchema.optional(),
	})
	.superRefine((input, issues) => {
		for (const [i, change] of (input.changes ?? []).entries()) {
			const problem = changeProblem(input.entity, change);
			if (problem !== undefined)
				issues.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["changes", i, problem === "field" ? "field" : "from"],
					message: problem === "field" ? "this field keeps no values" : "not a value of this field",
				});
		}
	});
export type AuditInput = z.infer<typeof auditInputSchema>;

export type AuditEvent = AuditInput & { summary: string };

/** An event, or the problems with its input (field paths only). */
export function makeAuditEvent(
	input: unknown,
): { ok: true; event: AuditEvent } | { ok: false; problems: ReadonlyArray<string> } {
	const parsed = auditInputSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, problems: parsed.error.issues.map((i) => i.path.join(".") || "(input)") };
	}
	const { action, fields, count } = parsed.data;
	const parts = [
		action,
		...(fields !== undefined && fields.length > 0 ? [`fields: ${fields.join(", ")}`] : []),
		...(count === undefined ? [] : [`count: ${count}`]),
	];
	return { ok: true, event: { ...parsed.data, summary: parts.join("; ") } };
}
