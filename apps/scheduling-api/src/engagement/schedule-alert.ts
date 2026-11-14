import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import { localDate } from "./digest-data";

type C = Ctx<RouteSpec>;

/**
 * Tells a therapist that their working day changed: a day off, other hours, leave, or time blocked. The person who made the
 * change is named by the translator (and a therapist who changed their own day is not told of it).
 */
export async function tellScheduleChanged(
	ctx: C,
	personId: string,
	date: string,
	what: "day_off" | "hours" | "leave" | "block",
): Promise<void> {
	await ctx.notify(
		"schedule.changed",
		{ kind: "team", permission: "roster_view" },
		{ personId, date, what, actor: ctx.subject },
		`${personId}:${date}:${what}:${ctx.requestId}`,
	);
}

/** The local day an instant falls on in this app's zone, for the notices that name a day. */
export async function dayOf(ctx: C, instant: number): Promise<string> {
	const app = await ctx.deps.store.c.apps.get(ctx.app, ctx.app);
	return localDate(instant, app?.timeZone ?? "Europe/Bucharest");
}
