import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";

type C = Ctx<RouteSpec>;
type Channel = "web" | "callback" | "assistant";

const SEVERITIES = ["warn", "block_online", "block_all"] as const;

/**
 * Tells the desk that someone on the blacklist tried to book ONLINE: which entry, how hard, and through what. Never the
 * person's name, contact or the staff-only reason. A staff booking the blacklist stops is not announced: the person
 * booking is told on the spot. A failure to tell is logged and swallowed (`ctx.notify`): the visitor's refusal is the
 * same either way.
 */
export async function alertBlacklist(
	ctx: C,
	channel: Channel,
	hit: { entry: string; severity: string } | null | undefined,
): Promise<void> {
	if (hit === null || hit === undefined) return;
	const severity = SEVERITIES.find((s) => s === hit.severity) ?? "warn";
	await ctx.notify(
		"blacklist.attempt",
		{ kind: "team", permission: "blacklist_view" },
		{ entryId: hit.entry, severity, channel },
		`${hit.entry}:${ctx.requestId}`,
	);
}
