import { roleKeys, rolesById } from "../authz/composition";
import type { HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { memberOut, writeMember } from "./member-write";
import { OWNERSHIP_KEY } from "./owner-guard";
import { isOwnerRole } from "./roles";
import { must } from "./shared";

/**
 * Handing the organisation over. The new owner takes every role of the giver that holds the ownership; the giver keeps
 * the roles those include, so an Owner who hands over stays an Administrator. An estate administrator who is not a
 * member gives the app's Owner role. Both members are written with their tuples; the organisation never has no Owner.
 */
export const ownershipHandlers: HandlersOf<"ownership.transfer"> = {
	async "ownership.transfer"(ctx) {
		const to = ctx.body.to;
		if (to === ctx.subject)
			throw fail("conflict", "the organisation is already yours", { reason: "self" });
		const target = await must(ctx.deps.store.c.members, ctx.app, to, "member");
		const roles = await ctx.deps.store.c.roles.list(ctx.app);
		const byId = rolesById(roles);
		const giver = await ctx.deps.store.c.members.get(ctx.app, ctx.subject);
		const owning = (giver?.roles ?? []).filter((id) => roleKeys(id, byId).has(OWNERSHIP_KEY));
		let moving = owning;
		if (moving.length === 0) {
			// Not an Owner by a role: the estate's administrator, handing over an organisation whose Owner left.
			if (!(await ctx.deps.access.isPlatformAdmin(ctx.subject)))
				throw forbidden("only an Owner hands the organisation over", { reason: "not_owner" });
			const ownerRole = roles.find(isOwnerRole);
			if (ownerRole === undefined)
				throw fail("conflict", "the app has no Owner role", { reason: "no_owner_role" });
			moving = [ownerRole.id];
		}
		const taken = await writeMember(ctx, to, target, {
			displayName: target.displayName,
			...(target.email === undefined ? {} : { email: target.email }),
			roles: [...target.roles, ...moving],
			coordinates: target.coordinates,
		});
		let kept: Awaited<ReturnType<typeof writeMember>> | undefined;
		if (giver !== undefined && owning.length > 0) {
			const included = owning.flatMap((id) => byId.get(id)?.includes ?? []);
			kept = await writeMember(ctx, giver.subject, giver, {
				displayName: giver.displayName,
				...(giver.email === undefined ? {} : { email: giver.email }),
				roles: [...giver.roles.filter((id) => !owning.includes(id)), ...included],
				coordinates: giver.coordinates,
			});
		}
		ctx.auditTarget(to);
		ctx.note({ roles: moving.length, from: giver === undefined ? "estate" : "member" });
		return {
			from: kept === undefined ? null : memberOut(kept.next),
			to: memberOut(taken.next),
		};
	},
};
