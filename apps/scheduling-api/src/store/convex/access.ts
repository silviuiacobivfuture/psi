import { appsCollection } from "./apps";
import { auditCollection } from "./audit";
import { caller } from "./call";
import type { PartialCollections } from "./collections";
import { membersCollection } from "./members";
import { rolesCollection } from "./roles";
import type { Rpc } from "./rpc";

/** The app, its team and its log: `apps`, `members`, `roles`, `audit`. (`appsOf` is `members.ts`, wired by the assembly.) */
export function accessCollections(rpc: Rpc): PartialCollections {
	const call = caller(rpc);
	return {
		apps: appsCollection(call),
		members: membersCollection(call),
		roles: rolesCollection(call),
		audit: auditCollection(call),
	};
}
