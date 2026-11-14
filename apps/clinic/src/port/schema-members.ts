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

/** A person of the estate's staff group, found by name or e-mail to fill the add-member form. */
export const StaffMatchSchema = z.object({
	subject: z.string().min(1).max(200),
	displayName: z.string().max(200),
	email: z.string().max(200),
	/** Switched off in the sign-in. */
	active: z.boolean(),
	/** Already in this team. */
	member: z.boolean(),
});
export type StaffMatch = z.infer<typeof StaffMatchSchema>;

/** At least two characters, as the service asks; anything shorter is no search. */
export const StaffQuerySchema = z.string().trim().min(2).max(80);

/** Someone invited by e-mail: their account is found or made in the staff group, then they are added with these roles. */
export const InviteInputSchema = z.object({
	email: z.string().trim().max(200).pipe(z.string().email()),
	displayName: z.string().trim().min(1).max(200),
	roles: z.array(z.string().min(1).max(100)).max(20).default([]),
	coordinates: ids,
	locale: z.enum(["ro", "en"]).default("ro"),
});
export type InviteInput = z.input<typeof InviteInputSchema>;

export const InviteOutcomeSchema = z.object({
	subject: z.string(),
	displayName: z.string(),
	account: z.enum(["created", "existing"]),
	/** A new account's one-time set-password link, for the inviter to pass on; null otherwise. Shown once, kept nowhere. */
	signInLink: z.string().url().nullable(),
	/** The latest instant the link works (UTC ms): the sign-in keeps it 30 minutes. */
	signInLinkExpiresBy: z.number().int().nullable(),
});
export type InviteOutcome = z.infer<typeof InviteOutcomeSchema>;

/** A member's set-password link as the sign-in answers it: the same one for 30 minutes, with when it stops at the latest. */
export const SignInLinkSchema = z.object({ link: z.string().url(), expiresBy: z.number().int() });
export type SignInLink = z.infer<typeof SignInLinkSchema>;

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
