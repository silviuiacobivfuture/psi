import { inviteStaff, searchStaff } from "../engagement/staff-invite";
import type { HandlersOf } from "../http/context";

/** Adding a member by who they are: the flows are in `engagement/`; these only hand them over. */
export const staffHandlers: HandlersOf<"staff.search" | "staff.invite"> = {
	"staff.search": (ctx) => searchStaff(ctx, ctx.query.q),
	"staff.invite": (ctx) => inviteStaff(ctx, ctx.body),
};
