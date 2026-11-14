import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { guardMemberChange } from "../handlers/owner-guard";
import { must } from "../handlers/shared";
import type { Ctx } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { need, SIGN_IN_LINK_MS } from "./staff-invite";

type C = Ctx<RouteSpec>;

/**
 * The set-password link of a member who has never signed in, to show the inviter again: the invitation's e-mail never
 * arrived, or its link lapsed. Only for the account the member was added with (found again by their e-mail, the same sign-in), in the
 * staff group, switched on, and never signed in: once someone has signed in, a lost password is theirs to reset. Every
 * refusal is checked before the sign-in is asked for a link. The link goes to the inviter only; the journal says that one
 * was shown, never what it was. The sign-in keeps ONE set-password link per person for 30 minutes and answers that same
 * one while it lasts (seen on dev): a different link comes only once it expired, and an earlier one is never revoked
 * here. The answer says the latest instant it works (30 minutes from now, sooner if made earlier); the service holds
 * none of them.
 */
export async function newSignInLink(
	ctx: C,
	subject: string,
): Promise<{ signInLink: string; expiresBy: number }> {
	const staff = need(ctx);
	if (subject === ctx.subject)
		throw forbidden("nobody changes their own membership", { reason: "self" });
	const member = await must(ctx.deps.store.c.members, ctx.app, subject, "member");
	// An Administrator's or an Owner's set-password link is the Owner's to show.
	await guardMemberChange(ctx, member, member);
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
	ctx.note({ link: "shown" });
	return { signInLink, expiresBy: ctx.now + SIGN_IN_LINK_MS };
}
