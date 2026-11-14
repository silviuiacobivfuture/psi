import { z } from "zod";
import {
	type AuthentikHttpOptions,
	AuthentikRecovery,
	AuthentikUser,
	AuthentikUsers,
	accountOf,
	authentikCaller,
	groupPk,
} from "./authentik-http";
import type { StaffAccount, StaffDirectory } from "./staff-directory";

export interface AuthentikStaffOptions extends AuthentikHttpOptions {
	/** The group whose members reach the console: `app-clinic-member` (dev), `app-clinic-prod-member` (production). */
	staffGroup: string;
	/** The clients' group, so that a client's account is recognised and never made staff. */
	customersGroup: string;
}

/** What a sign-in left on the user: `last_login` is null until the person has signed in once. */
const Seen = z.object({ last_login: z.string().datetime({ offset: true }).nullable() });

/** People, not service accounts. */
const PEOPLE = new Set(["internal", "external"]);

/**
 * The staff group through Authentik's admin API. The search asks Authentik for the group's members (`groups_by_name`)
 * AND checks the group on every answer, so a provider that ignored the filter still offers no one outside it.
 */
export function createAuthentikStaff(options: AuthentikStaffOptions): StaffDirectory {
	const call = authentikCaller(options);
	const inGroup = (user: AuthentikUser, name: string): boolean =>
		(user.groups_obj ?? []).some((g) => g.name === name);
	const staffOf = (user: AuthentikUser): StaffAccount => ({
		...accountOf(options.subMode, user),
		name: user.name ?? user.username,
		staff: inGroup(user, options.staffGroup),
		customer: inGroup(user, options.customersGroup),
	});
	const person = (user: AuthentikUser): boolean => user.type === undefined || PEOPLE.has(user.type);

	return {
		async search(query, limit) {
			const params = new URLSearchParams({
				search: query,
				groups_by_name: options.staffGroup,
				include_groups: "true",
				page_size: String(Math.min(50, Math.max(1, limit))),
				ordering: "name",
			});
			const out = await call("GET", `/core/users/?${params.toString()}`, AuthentikUsers);
			return out.results
				.filter((u) => person(u) && inGroup(u, options.staffGroup))
				.map(staffOf)
				.slice(0, limit);
		},
		async find(email) {
			const params = new URLSearchParams({ email, include_groups: "true" });
			const out = await call("GET", `/core/users/?${params.toString()}`, AuthentikUsers);
			const found = out.results.find((u) => u.email.toLowerCase() === email.toLowerCase());
			return found === undefined ? undefined : staffOf(found);
		},
		async create(input) {
			const group = await groupPk(call, options.staffGroup);
			// Active, with no password: the account signs in only once the person set one (and their second factor).
			const user = await call("POST", "/core/users/", AuthentikUser, {
				username: input.email,
				name: input.name,
				email: input.email,
				is_active: true,
				groups: [group],
				path: "staff",
			});
			return { ...staffOf(user), staff: true };
		},
		async join(userId) {
			const group = await groupPk(call, options.staffGroup);
			await call("POST", `/core/groups/${encodeURIComponent(group)}/add_user/`, z.unknown(), {
				pk: Number(userId),
			});
		},
		async leave(userId) {
			const group = await groupPk(call, options.staffGroup);
			await call("POST", `/core/groups/${encodeURIComponent(group)}/remove_user/`, z.unknown(), {
				pk: Number(userId),
			});
		},
		async lastLogin(userId) {
			const user = await call("GET", `/core/users/${encodeURIComponent(userId)}/`, Seen);
			return user.last_login === null ? undefined : Date.parse(user.last_login);
		},
		async recoveryLink(userId) {
			return (
				await call("POST", `/core/users/${encodeURIComponent(userId)}/recovery/`, AuthentikRecovery)
			).link;
		},
		async deactivate(userId) {
			await call("PATCH", `/core/users/${encodeURIComponent(userId)}/`, z.unknown(), {
				is_active: false,
			});
		},
	};
}
