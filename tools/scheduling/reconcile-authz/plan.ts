import type { Tuple } from "@psi/scheduling-api/authz-port";
import type { StorePort } from "@psi/scheduling-api/store-types";
import { memberTuples, objectLinks, platformLink, roleTuples } from "@psi/scheduling-api/tuples";

/** What one app's authorization should hold, by kind: the tuples the service itself would have written. */
export interface AppPlan {
	app: string;
	platform: Tuple[];
	roles: Tuple[];
	members: Tuple[];
	links: Tuple[];
}

export const tuplesOf = (plan: AppPlan): Tuple[] => [
	...plan.platform,
	...plan.roles,
	...plan.members,
	...plan.links,
];

const APP_TYPE = "sched_app:";

/**
 * The estate's apps may be told apart in OpenFGA by a prefix on the app's id (`sched_app:<prefix><app>`); only the app
 * object carries it (every other object's id is the store's own and unique already).
 */
export function withPrefix(tuple: Tuple, prefix: string): Tuple {
	if (prefix === "") return tuple;
	const mark = (s: string): string =>
		s.startsWith(APP_TYPE) ? `${APP_TYPE}${prefix}${s.slice(APP_TYPE.length)}` : s;
	return { user: mark(tuple.user), relation: tuple.relation, object: mark(tuple.object) };
}

/** Reads the store and builds the plan with the service's own tuple builders. Throws for an app the store does not hold. */
export async function planApp(store: StorePort, app: string, prefix: string): Promise<AppPlan> {
	if ((await store.c.apps.get(app, app)) === undefined)
		throw new Error(`the app ${app} is not in the store`);
	const [roles, members, links] = await Promise.all([
		store.c.roles.list(app),
		store.c.members.list(app),
		objectLinks(store, app),
	]);
	const mapped = (tuples: Tuple[]): Tuple[] => tuples.map((t) => withPrefix(t, prefix));
	return {
		app,
		platform: mapped([platformLink(app)]),
		roles: mapped(roles.flatMap(roleTuples)),
		members: mapped(members.flatMap(memberTuples)),
		links: mapped(links),
	};
}
