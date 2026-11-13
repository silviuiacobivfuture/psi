import { PortError } from "../port/port";
import { ACTIONS } from "./registry";
import type { ActionCtx, ActionDef, ActionResult, ListQuery } from "./types";

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);

/** Whether the person holds what an action needs (the service authorizes again when it runs). */
export function permitted(ctx: ActionCtx, a: ActionDef): boolean {
	const { write, read, group } = a.needs;
	if (write !== undefined && !write.some((k) => ctx.can.write(k))) return false;
	if (read !== undefined && !ctx.can.any(...read)) return false;
	return group === undefined || ctx.can.group(group);
}

/** What this person can do here: the actions for a screen (and a placement, and what is shown), gated by capability. */
export function listActions(ctx: ActionCtx, q: ListQuery): ReadonlyArray<ActionDef> {
	return ACTIONS.filter((a) => {
		const where =
			q.placement === undefined ? Object.values(a.placements) : [a.placements[q.placement]];
		if (!where.some((screens) => screens?.includes(q.screen) === true)) return false;
		return permitted(ctx, a) && (a.when === undefined || a.when(ctx, q.entity ?? {}));
	});
}

export interface RunOptions {
	/** The person (or the assistant on their behalf) agreed to the confirmation the action asks for. */
	confirmed?: boolean;
	via?: "ui" | "assistant";
}

/**
 * Does an action by id with the given parameters: the ONE path a button's route and the assistant both take. It
 * refuses what the person may not do, parameters that do not parse and a confirmation not given, writing nothing.
 */
export async function runAction(
	ctx: ActionCtx,
	id: string,
	raw: unknown,
	options: RunOptions = {},
): Promise<ActionResult> {
	const a = actionById(id);
	if (a === undefined || a.run === undefined) return { status: "refused", code: "unknown" };
	if (!permitted(ctx, a)) return { status: "refused", code: "forbidden" };
	const parsed = a.params.safeParse(raw);
	if (!parsed.success) return { status: "refused", code: "invalid" };
	if (a.confirm !== "none" && options.confirmed !== true)
		return { status: "needs-confirmation", policy: a.confirm };
	try {
		// The action parses its own input once more from the raw value: a schema's transforms are not idempotent.
		const result = await a.run(ctx, raw);
		if (options.via === "assistant" && result.status === "ok")
			await ctx.port.appendAudit(ctx.app, {
				actor: ctx.actor.name,
				action: `assistant.${a.id}`,
				target: String(parsed.data.clientId ?? parsed.data.id ?? ""),
			});
		return result;
	} catch (error) {
		if (error instanceof PortError) {
			const code =
				error.code === "not-found" ||
				error.code === "forbidden" ||
				error.code === "invalid" ||
				error.code === "conflict"
					? error.code
					: "unavailable";
			return { status: "refused", code };
		}
		throw error;
	}
}
