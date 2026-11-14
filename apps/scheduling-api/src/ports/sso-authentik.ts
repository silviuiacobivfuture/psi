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
import type { SsoPort } from "./sso";

export interface AuthentikOptions extends AuthentikHttpOptions {
	customersGroup: string;
}

/** What a sign-in left on the user: `last_login` is null until the person has signed in once. */
const Seen = z.object({ last_login: z.string().datetime({ offset: true }).nullable() });

/**
 * Authentik's admin API for the client invitation. The user's `uid` is what a provider in `hashed_user_id` mode
 * (Authentik's default) puts in `sub`; the other modes name another field.
 */
export function createAuthentikSso(options: AuthentikOptions): SsoPort {
	const call = authentikCaller(options);
	const account = (user: AuthentikUser) => accountOf(options.subMode, user);

	return {
		async findByEmail(email) {
			const out = await call(
				"GET",
				`/core/users/?email=${encodeURIComponent(email)}`,
				AuthentikUsers,
			);
			const found = out.results.find((u) => u.email.toLowerCase() === email.toLowerCase());
			return found === undefined ? undefined : account(found);
		},
		async create(input) {
			const group = await groupPk(call, options.customersGroup);
			const user = await call("POST", "/core/users/", AuthentikUser, {
				username: input.email,
				name: input.name,
				email: input.email,
				is_active: true,
				groups: [group],
				path: "customers",
			});
			return account(user);
		},
		async recoveryLink(userId) {
			return (
				await call("POST", `/core/users/${encodeURIComponent(userId)}/recovery/`, AuthentikRecovery)
			).link;
		},
		async lastLogin(userId) {
			const user = await call("GET", `/core/users/${encodeURIComponent(userId)}/`, Seen);
			return user.last_login === null ? undefined : Date.parse(user.last_login);
		},
		async deactivate(userId) {
			await call("PATCH", `/core/users/${encodeURIComponent(userId)}/`, z.unknown(), {
				is_active: false,
			});
		},
	};
}
