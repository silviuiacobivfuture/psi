import { z } from "zod/v4";
import { Id } from "./primitives";

const Name = z.string().trim().min(1).max(200);
/** A stored permission relation: `<resource>_<action>_<scope>[_<group>]` (`clients_view_all_contact`). */
const Relation = z.string().min(1).max(120);

/** One role of the app, as every member may read it: what it is called and the permissions it grants, nothing else. */
export const RoleSummaryItem = z.object({
	id: Id,
	name: Name,
	description: z.string().max(500).optional(),
	/** A seed role of the app (Owner, Reception…); a custom role is false. */
	system: z.boolean(),
	/** Its own permissions; with the inherited ones, everything it holds in the end. */
	permissions: z.array(Relation),
	/** The roles it includes. */
	includes: z.array(Id),
	/** Each permission held through an included role, and the nearest role that holds it as its own. */
	inherited: z.record(Relation, Id),
});

/**
 * Every role of the app and the platform role, for the role comparison every member may open. Carries no member,
 * no count of members and no stamp: who holds a role is the team's list, which needs `members_view`.
 */
export const RoleSummary = z.object({
	roles: z.array(RoleSummaryItem),
	/**
	 * The estate's platform administrator, as the authorization model defines it: what they hold in every app. They
	 * manage the system (settings, team, roles) and read no clinical content.
	 */
	platform: z.object({ permissions: z.array(Relation) }),
});
