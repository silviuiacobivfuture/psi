import { createHash } from "node:crypto";
import { str, type Translate } from "./novu-env";

/**
 * "You have been added to the team": to the address the member was invited with, read from the member NOW (a member
 * removed meanwhile gets nothing). The message carries the console's address and how to set a first password, never a
 * set-password link: that link is a credential, and a queued payload is stored.
 */
export const teamInvite: Translate = async (n, app, env) => {
	const subject = str(n.payload, "subject");
	if (subject === undefined) return;
	const member = await env.store.c.members.get(n.app, subject);
	if (member?.email === undefined) return;
	const locale = str(n.payload, "locale") === "en" ? "en" : "ro";
	return env.send(
		app,
		"team.invite",
		{
			inviteId: createHash("sha256").update(n.idempotencyKey).digest("hex").slice(0, 16),
			name: member.displayName,
		},
		[{ audience: "invitee", subject, email: member.email, name: member.displayName, locale }],
		n.idempotencyKey,
	);
};
