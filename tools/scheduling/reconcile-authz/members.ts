import { withActor } from "@psi/scheduling-api/store-actor";
import type { MemberRow, StorePort } from "@psi/scheduling-api/store-types";

/** The subject the store records as the one who bootstrapped a member. */
export const RECONCILE_ACTOR = "system:reconcile";

export interface MemberSpec {
	subject: string;
	roleName: string;
}

const SUBJECT = /^[a-z][a-z0-9-]{1,40}$/;

/** `<subject>=<role name>`, e.g. `owner=Owner`. */
export function parseMemberSpec(text: string): MemberSpec {
	const at = text.indexOf("=");
	const subject = at < 0 ? "" : text.slice(0, at).trim();
	const roleName = at < 0 ? "" : text.slice(at + 1).trim();
	if (!SUBJECT.test(subject) || roleName === "")
		throw new Error(
			`--member is <subject>=<role name> (a subject like ${SUBJECT.source}): got "${text}"`,
		);
	return { subject, roleName };
}

export type MemberOutcome = "created" | "role_added" | "unchanged";

/**
 * Makes `subject` a member of `app` holding the role named `roleName` (found among the app's stored roles, case
 * ignored), through the service's own store, so the row is the one the service would have written. Nothing is written
 * on a dry run. The member's tuples are written with the rest of the app's (`planApp` reads them back).
 */
export async function bootstrapMember(
	store: StorePort,
	app: string,
	spec: MemberSpec,
	write: boolean,
	now: () => number = Date.now,
): Promise<MemberOutcome> {
	const roles = await store.c.roles.list(app);
	const role = roles.find((r) => r.name.toLowerCase() === spec.roleName.toLowerCase());
	if (role === undefined)
		throw new Error(
			`the app ${app} has no role named "${spec.roleName}" (it has: ${roles.map((r) => r.name).join(", ") || "none"})`,
		);
	const held = await store.c.members.get(app, spec.subject);
	if (held?.roles.includes(role.id) === true) return "unchanged";
	if (!write) return held === undefined ? "created" : "role_added";
	return withActor(RECONCILE_ACTOR, async () => {
		if (held !== undefined) {
			await store.c.members.replace({ ...held, roles: [...held.roles, role.id], updatedAt: now() });
			return "role_added" as const;
		}
		const row: MemberRow = {
			id: spec.subject,
			app,
			subject: spec.subject,
			displayName: spec.subject,
			roles: [role.id],
			coordinates: [],
			grants: [],
			denies: [],
			createdAt: now(),
			updatedAt: now(),
		};
		await store.c.members.insert(row);
		return "created" as const;
	});
}
