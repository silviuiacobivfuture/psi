import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { must } from "../handlers/shared";
import type { Ctx } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { need } from "./staff-invite";

type C = Ctx<RouteSpec>;

/**
 * A fresh one-time set-password link for a member who has never signed in: the invitation's link lapsed, or the e-mail
 * never arrived. Only for the account the member was added with (found again by their e-mail, the same sign-in), in the
 * staff group, switched on, and never signed in: once someone has signed in, a lost password is theirs to reset. Every
 * refusal is checked before the sign-in is asked for a link. The link goes to the inviter only; the journal says that one
 * was made, never what it was. Authentik keeps one set-password token per user and replaces it on a new request, so the
 * earlier link stops working where its version does so; the service holds none of them.
 */
export async function newSignInLink(ctx: C, subject: string): Promise<{ signInLink: string }> {
	const staff = need(ctx);
	if (subject === ctx.subject)
		throw forbidden("nobody changes their own membership", { reason: "self" });
	const member = await must(ctx.deps.store.c.members, ctx.app, subject, "member");
	if (member.email === undefined)
		throw fail("conflict", "the member has no e-mail address", { reason: "no_email" });
	const account = await staff.find(member.email);
	if (account === undefined || account.subject !== subject)
		throw fail("conflict", "no sign-in account of this member at that address", {
			reason: "no_account",
		});
	if (!account.staff)
		throw fail("conflict", "the account is not in the team's group", { reason: "not_staff" });
	if (!account.active)
		throw fail("conflict", "that account is switched off", { reason: "account_disabled" });
	if ((await staff.lastLogin(account.userId)) !== undefined)
		throw fail("conflict", "the member has already signed in", { reason: "already_signed_in" });
	const signInLink = await staff.recoveryLink(account.userId);
	ctx.auditTarget(subject);
	ctx.note({ link: "issued" });
	return { signInLink };
}
