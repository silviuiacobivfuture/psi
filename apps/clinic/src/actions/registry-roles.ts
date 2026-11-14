import { m } from "../paraglide/messages.js";
import { ROLES_MATRIX_PATH } from "../roles-matrix/path";
import { define, label, none } from "./define";
import type { ActionDef } from "./types";

/**
 * The role matrix: every member may open it (membership is all it needs). Run by the assistant, it answers where the
 * matrix is and the roles it compares, by name: the full keys (hundreds per role) stay on the page and on the
 * service's own summary route, which the assistant's API tools also reach.
 */
export const ROLE_MATRIX_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "nav.roles-matrix",
		tier: "me",
		entity: "none",
		label: label((o) => m.rm_title({}, o)),
		icon: "shield",
		placements: { palette: ["global"] },
		mobile: "list",
		needs: {},
		route: { method: "GET", path: ROLES_MATRIX_PATH },
		confirm: "none",
		to: () => ROLES_MATRIX_PATH,
		params: none,
		run: async (ctx) => {
			const summary = await ctx.port.roleSummary(ctx.app);
			return {
				status: "ok",
				to: ROLES_MATRIX_PATH,
				data: {
					roles: summary.roles.map((r) => ({ id: r.id, name: r.name, system: r.system })),
					platform: m.rm_platform({}, { locale: ctx.locale }),
				},
			};
		},
	}),
];
