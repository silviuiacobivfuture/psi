import type { Ctx } from "../lib/context";
import { todayIso } from "../lib/dates";
import type { ActionCtx } from "./types";

/** The request's context as an action sees it: the port, the capabilities, who is acting. */
export function actionCtx(ctx: Ctx): ActionCtx {
	return {
		port: ctx.port,
		app: ctx.app,
		can: ctx.can,
		actor: { subject: ctx.caps.subject, name: ctx.person.name },
		locale: ctx.locale,
		today: todayIso(),
	};
}
