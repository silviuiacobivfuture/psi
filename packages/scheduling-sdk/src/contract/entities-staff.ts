import { z } from "zod/v4";
import { Member } from "./entities";
import { Id, Locale, Subject } from "./primitives";

/**
 * Adding a member of the team without knowing their sign-in id: the people of the estate's staff group (found by name or
 * e-mail; never a client's account), or a new account made for someone invited by e-mail.
 */
export const StaffQuery = z.object({ q: z.string().trim().min(2).max(80) });

/** A person of the staff group, as the add-member form fills itself from them. */
export const StaffAccount = z.object({
	subject: Subject,
	displayName: z.string().max(200),
	email: z.string().max(200),
	/** Switched off in the sign-in: they could not sign in even once added. */
	active: z.boolean(),
	/** Already a member of this app. */
	member: z.boolean(),
});
export const StaffSearch = z.object({ items: z.array(StaffAccount).max(20) });

export const StaffInviteBody = z.object({
	email: z.string().trim().max(200).pipe(z.email()),
	displayName: z.string().trim().min(1).max(200),
	roles: z.array(Id).max(20),
	coordinates: z.array(Id).max(100).default([]),
	locale: Locale.default("ro"),
});

/** A new one-time set-password link for a member who never signed in: for the inviter to pass on, shown once. */
export const StaffLinkResult = z.object({ signInLink: z.url() });

export const StaffInviteResult = z.object({
	member: Member,
	/** `created`: a new sign-in account, with no password yet. `existing`: the person already had one. */
	account: z.enum(["created", "existing"]),
	/**
	 * For a new account only: a ONE-TIME link on which the person sets their password, for the inviter to pass on when the
	 * e-mail does not arrive. Short-lived (the sign-in's setting); shown once, never stored, never in the journal. Null
	 * when the person already had an account, or when the sign-in could not make one right now.
	 */
	signInLink: z.url().nullable(),
});
