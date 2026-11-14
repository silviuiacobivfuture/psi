import { z } from "zod";
import { SCOPES } from "./schema";

/**
 * The team's members: who signs in, which organisation roles they hold (several at once), and what they may do in
 * the end. One schema per shape, the same one the form, the action and the port use.
 */

/** A sign-in account's id, as the sign-in service gives it (a hashed id of up to 200 characters). */
export const SubjectSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._@:-]{0,199}$/);

const ids = z.array(z.string().min(1).max(100)).max(100).default([]);

export const MemberInputSchema = z.object({
	displayName: z.string().trim().min(1).max(200),
	email: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v === undefined || v === "" ? undefined : v))
		.pipe(z.string().email().optional()),
	/** Every role held; their permissions add up. None: a member who may do nothing yet. */
	roles: z.array(z.string().min(1).max(100)).max(20).default([]),
	/** The practitioners whose calendars this member coordinates (the `assigned` reach). */
	coordinates: ids,
});
export type MemberInput = z.input<typeof MemberInputSchema>;

/** A stored permission relation (`clients_view_all`), as a grant or a denial names it. */
const Relation = z
	.string()
	.min(1)
	.max(120)
	.regex(/^[a-z0-9_]+$/);
export const OverridesInputSchema = z.object({
	grant: z.array(Relation).max(300).default([]),
	deny: z.array(Relation).max(300).default([]),
});
export type OverridesInput = z.input<typeof OverridesInputSchema>;

const Scope = z.enum(SCOPES);

/** One permission of the catalogue, with the scopes it offers and the ones the member holds in the end. */
export const PermissionRowSchema = z.object({
	key: z.string(),
	resource: z.string(),
	action: z.string(),
	fieldGroup: z.string().optional(),
	scopes: z.array(Scope),
	held: z.array(Scope),
});
export type PermissionRow = z.infer<typeof PermissionRowSchema>;

export const MemberDetailSchema = z.object({
	subject: z.string(),
	displayName: z.string(),
	email: z.string().optional(),
	roles: z.array(z.string()),
	coordinates: z.array(z.string()),
	grant: z.array(z.string()),
	deny: z.array(z.string()),
	/** The calendar columns (people) bound to this member's sign-in. */
	calendars: z.array(z.string()),
	/** The calendar columns bound to someone else: not offered, binding one would take it from them. */
	taken: z.array(z.string()),
	/** What they may do in the end: every role, grant and denial counted. */
	matrix: z.array(PermissionRowSchema),
});
export type MemberDetail = z.infer<typeof MemberDetailSchema>;

/** The stored relation of one row at one scope: `clients_view_all`, or `clients_view_all_contact` for a field group. */
export const relationOf = (
	row: Pick<PermissionRow, "key" | "resource" | "action" | "fieldGroup">,
	scope: string,
): string =>
	row.fieldGroup === undefined
		? `${row.key}_${scope}`
		: `${row.resource}_${row.action}_${scope}_${row.fieldGroup}`;
