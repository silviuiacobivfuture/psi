import type { MemberRow, RoleRow } from "../store/types";
import {
	coordinatorLink,
	memberLink,
	personalGrant,
	roleAppLink,
	roleGrant,
	roleHolder,
	roleInclusion,
} from "./links";
import type { Tuple } from "./port";

/**
 * The authorization tuples of what the store holds, in ONE place: the handlers write them as rows are made and changed,
 * and the reconcile tool writes them again for a store that came in through an import. Nothing else builds them.
 */
export { objectLinks } from "./rehydrate";

/** The app belongs to the estate's platform: what makes the platform's administrators the app's administrators. */
export const platformLink = (app: string): Tuple => ({
	user: "platform:psi",
	relation: "parent_platform",
	object: `sched_app:${app}`,
});

/** A role: its link to the app, each permission it grants itself, and each role it includes. */
export const roleTuples = (role: RoleRow): Tuple[] => [
	roleAppLink(role.id, role.app),
	...role.permissions.map((p) => roleGrant(role.id, role.app, p)),
	...role.includes.map((inc) => roleInclusion(role.id, inc)),
];

/** A member: the app membership, the roles held, the practitioners coordinated and the personal grants. */
export const memberTuples = (m: MemberRow): Tuple[] => [
	memberLink(m.app, m.subject),
	...m.roles.map((r) => roleHolder(r, m.subject)),
	...m.coordinates.map((p) => coordinatorLink(p, m.subject)),
	...m.grants.map((g) => personalGrant(m.app, m.subject, g)),
];
