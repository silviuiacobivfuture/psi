import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import type { MemberRow } from "../store/types";

type C = Ctx<RouteSpec>;

/**
 * Keeps the notifier's subscriber in step with a member who was added or changed (their name, their address): the inbox and
 * the push devices hang on it. Who a notification reaches is NOT kept here: a team is resolved from the permission each
 * message names at the moment of sending, so a role edited in the console changes who is told with no other step. A failure
 * is logged and never fails the change the person made: the next change of the member puts it right.
 */
export async function syncMember(
	ctx: C,
	app: string,
	subject: string,
	member: MemberRow | undefined,
): Promise<void> {
	if (member === undefined) return;
	try {
		await ctx.deps.notifier.syncPerson(app, {
			subject,
			name: member.displayName,
			...(member.email === undefined ? {} : { email: member.email }),
		});
	} catch {
		ctx.deps.log({ level: "error", event: "notify_directory_failed", requestId: ctx.requestId });
	}
}
