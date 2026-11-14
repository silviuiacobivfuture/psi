import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { checkRefs, type MemberInput, memberOut, writeMember } from "../handlers/member-write";
import type { Ctx } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { StaffAccount, StaffDirectory } from "../ports/staff-directory";

type C = Ctx<RouteSpec>;

/** The most people one search answers: the form shows a short list to pick from, never the directory. */
const SEARCH_LIMIT = 20;

/** The staff directory, or 503 `not_configured`: asked before anything else. */
export function need(ctx: C): StaffDirectory {
	if (ctx.deps.staff === undefined)
		throw fail("unavailable", "the team's sign-in group is not configured", {
			reason: "not_configured",
		});
	return ctx.deps.staff;
}

/** People of the staff group matching a name or an e-mail, each said to be a member of this app already or not. */
export async function searchStaff(ctx: C, query: string) {
	const staff = need(ctx);
	const [found, members] = await Promise.all([
		staff.search(query, SEARCH_LIMIT),
		ctx.deps.store.c.members.list(ctx.app),
	]);
	const held = new Set(members.map((m) => m.subject));
	return {
		items: found
			.filter((a) => a.staff)
			.map((a) => ({
				subject: a.subject,
				displayName: a.name.slice(0, 200),
				email: a.email.slice(0, 200),
				active: a.active,
				member: held.has(a.subject),
			})),
	};
}

/** Who the address is in the sign-in, and what may be done with it: every refusal comes before anything is written. */
async function accountFor(ctx: C, staff: StaffDirectory, email: string) {
	const found = await staff.find(email);
	if (found === undefined) return undefined;
	if (found.customer && !found.staff)
		throw fail("conflict", "that address is a client's account", { reason: "customer_account" });
	if (!found.active)
		throw fail("conflict", "that account is switched off", { reason: "account_disabled" });
	if (found.subject === ctx.subject)
		throw forbidden("nobody changes their own membership", { reason: "self" });
	if ((await ctx.deps.store.c.members.get(ctx.app, found.subject)) !== undefined)
		throw fail("conflict", "already a member of the team", { reason: "already_member" });
	return found;
}

/**
 * Invites someone by e-mail. The account is the one the address already has in the staff group (or, neither staff nor a
 * client's, it is put in the group), else a new one made there: active with no password, so nobody signs in on it until
 * the person sets one. The member is added with the roles chosen, then told by e-mail (the console's address and how
 * to set a password; never a link that is a credential). A new account also answers a one-time set-password link for the
 * inviter, in case the e-mail does not arrive; it is in no log, no journal and no queued message.
 */
export async function inviteStaff(
	ctx: C,
	input: MemberInput & { email: string; locale: "ro" | "en" },
) {
	const staff = need(ctx);
	await checkRefs(ctx, input.roles, input.coordinates);
	const email = input.email.trim().toLowerCase();
	const found = await accountFor(ctx, staff, email);
	let account: StaffAccount;
	let made = false;
	const joined = found !== undefined && !found.staff;
	if (found === undefined) {
		account = await staff.create({ email, name: input.displayName });
		made = true;
	} else {
		account = found;
		if (joined) await staff.join(found.userId);
	}
	let written: Awaited<ReturnType<typeof writeMember>>;
	try {
		written = await writeMember(ctx, account.subject, undefined, { ...input, email });
	} catch (error) {
		// What the sign-in was asked to do is undone: an account we made is switched off, a group we added leaves it.
		const undo = made
			? staff.deactivate(account.userId)
			: joined
				? staff.leave(account.userId)
				: undefined;
		await undo?.catch(() =>
			ctx.deps.log({ level: "error", event: "staff_rollback_failed", requestId: ctx.requestId }),
		);
		throw error;
	}
	let signInLink: string | null = null;
	if (made)
		try {
			signInLink = await staff.recoveryLink(account.userId);
		} catch {
			// The member exists and the e-mail tells them how to set a password: the inviter is shown no link.
			ctx.deps.log({ level: "error", event: "staff_link_failed", requestId: ctx.requestId });
		}
	await ctx.notify(
		"team.invite",
		{ kind: "person", subject: account.subject },
		{ subject: account.subject, locale: input.locale },
		`${account.subject}:${ctx.now}`,
	);
	// The team change itself is journalled as an addition, the same event on every store; this route's own event says how.
	await ctx.auditNow("member.put", { type: "members", id: account.subject }, written.detail);
	ctx.auditTarget(account.subject);
	ctx.note({ account: made ? "created" : "existing", joined });
	return {
		member: memberOut(written.next),
		account: made ? ("created" as const) : ("existing" as const),
		signInLink,
	};
}
