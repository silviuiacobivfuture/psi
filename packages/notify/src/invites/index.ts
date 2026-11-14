import type { AppKey } from "../apps";
import { signToken } from "../reminders/token";

export {
	createInviteRoutes,
	type InviteLinkActions,
	type InviteLinkState,
	type InviteRoutesOptions,
} from "./routes";

export interface InviteLinkInput {
	secret: string;
	app: AppKey;
	clientId: string;
	/** Recorded on the invitation: a later link replaces this one by having another id. */
	tokenId: string;
	locale: "ro" | "en";
	/** Epoch milliseconds the link stops working. */
	expiresAt: number;
}

/** The signed token an invitation e-mail's link carries (`<origin>/v1/public/invites/<token>`). */
export function signInviteToken(input: InviteLinkInput): string {
	return signToken({
		secret: input.secret,
		app: input.app,
		appointmentId: input.clientId,
		action: "invite",
		locale: input.locale,
		expiresAt: input.expiresAt,
		tokenId: input.tokenId,
	});
}
