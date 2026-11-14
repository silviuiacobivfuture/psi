import { withActor } from "@psi/scheduling-api/store-actor";
import type { MemberRow, StorePort } from "@psi/scheduling-api/store-types";

/** The subject the store records as the one who bootstrapped a member. */
export const RECONCILE_ACTOR = "system:reconcile";

export interface MemberSpec {
	subject: string;
	roleName: string;
	/** The name people see in the console; without it the subject (a hashed id) is shown. */
	displayName?: string;
}

// The service takes the token's `sub` as the subject (auth/tokens.ts: 1–200 characters). Authentik's hashed user
// id is 64 hex characters and may start with a digit, so the short-id pattern refused real people.
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,199}$/;

/** `<subject>=<role name>[=<display name>]`, e.g. `owner=Owner=Ana Pop`. */
export function parseMemberSpec(text: string): MemberSpec {
	const [rawSubject = "", rawRole = "", ...rest] = text.split("=");
	const subject = rawSubject.trim();
	const roleName = rawRole.trim();
	const displayName = rest.join("=").trim();
	if (!text.includes("=") || !SUBJECT.test(subject) || roleName === "")
		throw new Error(
			`--member is <subject>=<role name>[=<display name>] (a subject like ${SUBJECT.source}): got "${text}"`,
		);
	return displayName === "" ? { subject, roleName } : { subject, roleName, displayName };
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
	const renamed =
		held !== undefined && spec.displayName !== undefined && held.displayName !== spec.displayName;
	if (held?.roles.includes(role.id) === true && !renamed) return "unchanged";
	if (!write) return held === undefined ? "created" : "role_added";
	return withActor(RECONCILE_ACTOR, async () => {
		if (held !== undefined) {
			const roles = held.roles.includes(role.id) ? held.roles : [...held.roles, role.id];
			const displayName = spec.displayName ?? held.displayName;
			await store.c.members.replace({ ...held, roles, displayName, updatedAt: now() });
			return "role_added" as const;
		}
		const row: MemberRow = {
			id: spec.subject,
			app,
			subject: spec.subject,
			displayName: spec.displayName ?? spec.subject,
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
