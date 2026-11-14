import { z } from "zod/v4";
import { Id, Locale, Ms, Subject } from "./primitives";

/**
 * Turning a client into a registered user of the online account (docs/plans/clinic.md section 4, "Single sign-on").
 * `expired` is never stored: it is what `invited` becomes once `expiresAt` has passed, so no job has to run for it.
 */
export const INVITE_STATUSES = ["invited", "active", "expired", "revoked"] as const;
export const InviteStatus = z.enum(INVITE_STATUSES);

/** Which of the client's contacts receives the invitation: the client's own e-mail, or their guardian's. */
export const InviteContact = z.enum(["client", "guardian"]);

export const Invite = z.object({
	clientId: Id,
	status: InviteStatus,
	contact: InviteContact,
	/** Where it went, with the middle hidden (`a***@gmail.com`): reading the status needs no contact permission. */
	sentTo: z.string().max(200),
	locale: Locale,
	invitedAt: Ms,
	invitedBy: Subject,
	expiresAt: Ms,
	/** How many times the invitation was sent, the first included. */
	sends: z.number().int().min(1).max(1000),
	activatedAt: Ms.optional(),
	revokedAt: Ms.optional(),
	/** The address already had an online account: the e-mail points at the sign-in, no password was set. */
	existingAccount: z.boolean(),
});

export const InviteState = z.object({ invite: Invite.nullable() });

/** Who to invite and in which language the e-mail is written. */
export const InvitePick = z.object({ contact: InviteContact, locale: Locale.default("ro") });
export const InviteResend = z.object({ locale: Locale.optional() });

/** The e-mail exactly as it would go, with a placeholder where the one-time link will be. */
export const InvitePreview = z.object({
	to: z.string().max(200),
	subject: z.string().max(300),
	html: z.string().max(100_000),
	text: z.string().max(20_000),
	expiresAt: Ms,
	existingAccount: z.boolean(),
});
