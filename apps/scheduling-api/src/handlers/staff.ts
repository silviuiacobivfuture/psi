import { inviteStaff, searchStaff } from "../engagement/staff-invite";
import { newSignInLink } from "../engagement/staff-link";
import type { HandlersOf } from "../http/context";

/** Adding a member by who they are: the flows are in `engagement/`; these only hand them over. */
export const staffHandlers: HandlersOf<"staff.search" | "staff.invite" | "staff.link"> = {
	"staff.search": (ctx) => searchStaff(ctx, ctx.query.q),
	"staff.invite": (ctx) => inviteStaff(ctx, ctx.body),
	"staff.link": (ctx) => newSignInLink(ctx, String(ctx.params.subject)),
};
