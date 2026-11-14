import { appRelations, CATALOGUE } from "../authz/catalogue";
import { inheritedOf, rolesById } from "../authz/composition";
import type { HandlersOf } from "../http/context";

/**
 * What the estate's platform administrator holds in every app, from the same flag the authorization model is built
 * from: the app's settings, its team and its roles; no client, record or note.
 */
const PLATFORM_RELATIONS: readonly string[] = CATALOGUE.filter(
	(def) => def.platformAdmin === true,
).flatMap(appRelations);

/**
 * The roles every member may compare: names and permission keys only. Who holds which role stays on the team's list
 * (members_view); the role editor's own routes (roles_view) carry counts and stamps.
 */
export const roleSummaryHandlers: HandlersOf<"roles.summary"> = {
	async "roles.summary"(ctx) {
		const rows = (await ctx.deps.store.c.roles.list(ctx.app)).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		const byId = rolesById(rows);
		return {
			roles: rows.map((r) => ({
				id: r.id,
				name: r.name,
				...(r.description === undefined ? {} : { description: r.description }),
				system: r.system,
				permissions: [...new Set(r.permissions)].sort(),
				includes: [...r.includes].sort(),
				// What it holds through the roles it includes, and from which: the comparison marks those "din X".
				inherited: inheritedOf(r.id, byId),
			})),
			platform: { permissions: [...PLATFORM_RELATIONS].sort() },
		};
	},
};
