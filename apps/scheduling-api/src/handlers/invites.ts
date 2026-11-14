import {
	inviteState,
	previewInvite,
	resendInvite,
	revokeInvite,
	sendInvite,
} from "../engagement/invite-flow";
import type { HandlersOf } from "../http/context";

/** The routes under a client that turn them into a registered user. The flows are in `engagement/`; these only hand them over. */
export const inviteHandlers: HandlersOf<
	"invites.get" | "invites.preview" | "invites.send" | "invites.resend" | "invites.revoke"
> = {
	"invites.get": (ctx) => inviteState(ctx, String(ctx.params.id)),
	"invites.preview": (ctx) => previewInvite(ctx, String(ctx.params.id), ctx.query),
	"invites.send": (ctx) => sendInvite(ctx, String(ctx.params.id), ctx.body),
	"invites.resend": (ctx) => resendInvite(ctx, String(ctx.params.id), ctx.body.locale),
	"invites.revoke": (ctx) => revokeInvite(ctx, String(ctx.params.id)),
};
