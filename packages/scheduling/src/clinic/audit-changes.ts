import { z } from "zod";

/**
 * The one place the closed audit log keeps VALUES: what a change to the team was, so the journal can say it in a sentence
 * ("A schimbat rolurile lui …: Recepție + Coordonator"). Only the fields listed per entity may carry a before and an
 * after; every other entity (a client, a visit, a record, a note, …) keeps field names alone, so nothing clinical, no
 * contact and no secret can reach the log through here. The values are ids, permission keys and a team member's own
 * name; an e-mail address is never one of them.
 */
export const AUDIT_CHANGE_FIELDS = {
	member: ["displayName", "roles", "coordinates"],
	override: ["grants", "denies"],
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>;

/** A list of ids or permission keys, as the log keeps it: sorted, comma-separated, empty for none. */
const LIST = /^(?:[A-Za-z0-9_:.-]{1,120}(?:,[A-Za-z0-9_:.-]{1,120})*)?$/;
/** A person's name: at most 200 characters, none of them a control character. */
const NAME = /^[^\p{Cc}]{0,200}$/u;
/** Up to 300 permission keys of 120 characters each (the contract's bound on a person's grants). */
const MAX_LIST = 40_000;

/** A name as the journal keeps it: a control character (a pasted line break) becomes a space, never a refused write. */
export const journalName = (name: string): string => name.replace(/\p{Cc}/gu, " ").slice(0, 200);

export const auditChangeSchema = z.object({
	field: z.string().min(1).max(48),
	from: z.string().max(MAX_LIST),
	to: z.string().max(MAX_LIST),
});
export type AuditChange = z.infer<typeof auditChangeSchema>;

export const auditChangesSchema = z.array(auditChangeSchema).max(8);

/** Whether `entity` may keep this field's values, and whether the values are what that field holds. */
export function changeProblem(entity: string, change: AuditChange): "field" | "value" | undefined {
	const allowed: ReadonlyArray<string> | undefined =
		entity === "member" || entity === "override" ? AUDIT_CHANGE_FIELDS[entity] : undefined;
	if (allowed === undefined || !allowed.includes(change.field)) return "field";
	const shape = change.field === "displayName" ? NAME : LIST;
	return shape.test(change.from) && shape.test(change.to) ? undefined : "value";
}

/** A list as the log keeps it: one text, sorted, comma-separated (empty for none). */
export const listed = (ids: ReadonlyArray<string>): string => [...ids].sort().join(",");

/** Only the pairs that moved. */
export const moved = (changes: ReadonlyArray<AuditChange>): AuditChange[] =>
	changes.filter((c) => c.from !== c.to);
