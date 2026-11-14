import { seedRoleRows } from "@psi/scheduling-api/roles-seed";
import { withActor } from "@psi/scheduling-api/store-actor";
import type { StorePort } from "@psi/scheduling-api/store-types";
import { RECONCILE_ACTOR } from "./members";

export type SeedOutcome = "seeded" | "held" | "would_seed";

/**
 * Gives an app that holds no role at all the service's seed roles, the rows the service itself writes when it creates
 * an app (`seedRoleRows`): how an app the deployment made (its tenant row only) or an import made becomes one people
 * can be members of. An app with any role is left as it is; a dry run writes nothing. The tuples follow with the
 * rest of the app's.
 */
export async function seedRolesIfNone(
	store: StorePort,
	app: string,
	write: boolean,
	now: () => number = Date.now,
): Promise<SeedOutcome> {
	if ((await store.c.roles.list(app)).length > 0) return "held";
	if (!write) return "would_seed";
	await withActor(RECONCILE_ACTOR, async () => {
		for (const row of seedRoleRows(app, now())) await store.c.roles.insert(row);
	});
	return "seeded";
}
