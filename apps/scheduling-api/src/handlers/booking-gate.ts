import type { OverrideAuthority } from "@psi/scheduling/clinic";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import { withOverride } from "../store/actor";

/**
 * What the caller may do about a blacklist hit when booking: the strongest of what their own permissions give. A warning
 * is acknowledged by anyone who may book (with a reason); `blacklist_override` lets a `block_online` entry through and
 * `blacklist_override_admin` a `block_all` one. It is never read from the request.
 */
export async function authorityOf(ctx: Ctx<RouteSpec>): Promise<OverrideAuthority> {
	if (await ctx.canAll("blacklist_override_admin")) return "admin";
	if (await ctx.canAll("blacklist_override")) return "staff";
	return "ack";
}

/**
 * Runs a booking or a move with the caller's override in force: the store's gate stops a hit (409 `conflict`, detail
 * `reason: "warning" | "blocked"` and the entry) unless the reason is given and the authority is enough.
 */
export async function booking<T>(
	ctx: Ctx<RouteSpec>,
	override: { reason: string } | undefined,
	run: () => Promise<T>,
): Promise<T> {
	if (override === undefined) return run();
	const authority = await authorityOf(ctx);
	return withOverride({ reason: override.reason, authority }, async () => {
		const out = await run();
		ctx.note({ overridden: authority });
		return out;
	});
}
