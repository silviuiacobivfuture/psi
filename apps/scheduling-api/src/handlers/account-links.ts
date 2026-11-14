import { confirmSuggestion, dismissSuggestion, suggestions } from "../engagement/account-links";
import type { HandlersOf } from "../http/context";
import { paginate } from "./shared";

/** The team's side of linking online accounts to clients: what waits for them, and their answer. */
export const accountLinkHandlers: HandlersOf<
	"accountLinks.list" | "accountLinks.confirm" | "accountLinks.dismiss"
> = {
	async "accountLinks.list"(ctx) {
		return paginate(await suggestions(ctx), ctx.query.limit, ctx.query.cursor);
	},
	async "accountLinks.confirm"(ctx) {
		await confirmSuggestion(ctx, String(ctx.params.id), ctx.body.clientId);
		return { ok: true as const };
	},
	async "accountLinks.dismiss"(ctx) {
		await dismissSuggestion(ctx, String(ctx.params.id));
		return { ok: true as const };
	},
};
