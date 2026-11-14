import { visitorSubject } from "../auth/principal";
import { activateOnSignIn } from "../engagement/invite-flow";
import { loadPrefs, prefsView, savePrefs } from "../engagement/prefs";
import type { HandlersOf } from "../http/context";
import { fail } from "../http/errors";

/** A signed-in person's own notification preferences: the member's on the team side, the visitor's on the site side. */
export const notificationPrefsHandlers: HandlersOf<
	| "me.notifications"
	| "me.notificationsSave"
	| "visitor.notifications"
	| "visitor.notificationsSave"
> = {
	async "me.notifications"(ctx) {
		return prefsView("staff", await loadPrefs(ctx.deps.store.keyed, ctx.app, "staff", ctx.subject));
	},
	async "me.notificationsSave"(ctx) {
		await savePrefs(ctx.deps.store.keyed, ctx.app, "staff", ctx.subject, ctx.body);
		ctx.auditTarget(ctx.subject);
		ctx.note({ kinds: Object.keys(ctx.body.channels).length, quiet: ctx.body.quietHours !== null });
		return prefsView("staff", ctx.body);
	},
	async "visitor.notifications"(ctx) {
		const subject = visitorSubject(ctx.principal);
		if (subject === undefined) throw fail("invalid", "name the visitor");
		await activateOnSignIn(ctx, subject);
		return prefsView("client", await loadPrefs(ctx.deps.store.keyed, ctx.app, "client", subject));
	},
	async "visitor.notificationsSave"(ctx) {
		const subject = visitorSubject(ctx.principal);
		if (subject === undefined) throw fail("invalid", "name the visitor");
		await savePrefs(ctx.deps.store.keyed, ctx.app, "client", subject, ctx.body);
		ctx.auditTarget(ctx.app);
		ctx.note({ kinds: Object.keys(ctx.body.channels).length });
		return prefsView("client", ctx.body);
	},
};
