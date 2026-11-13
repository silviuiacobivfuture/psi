import { z } from "zod";
import { type SsoAccount, type SsoPort, SsoUnavailable } from "./sso";

export interface AuthentikOptions {
	/** `https://auth.psizone.ro` */
	url: string;
	/** An API token whose user may create users, read groups and create recovery links. */
	token: string;
	customersGroup: string;
	/** Authentik's provider setting for `sub`. */
	subMode: "hashed_user_id" | "user_id" | "user_username" | "user_email";
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

const User = z.object({
	pk: z.number().int(),
	username: z.string(),
	email: z.string(),
	is_active: z.boolean(),
	uid: z.string(),
});
const Users = z.object({ results: z.array(User) });
const Groups = z.object({ results: z.array(z.object({ pk: z.string(), name: z.string() })) });
const Recovery = z.object({ link: z.string().url() });

/**
 * Authentik's admin API (`/api/v3`). Every answer is parsed; any transport or status failure is `SsoUnavailable`, so the
 * invitation fails closed and nothing half-made is reported as done. The user's `uid` is what a provider in
 * `hashed_user_id` mode (Authentik's default) puts in `sub`; the other modes name another field.
 */
export function createAuthentikSso(options: AuthentikOptions): SsoPort {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const base = `${options.url.replace(/\/+$/, "")}/api/v3`;

	async function call<T>(
		method: "GET" | "POST" | "PATCH",
		path: string,
		schema: z.ZodType<T>,
		body?: Record<string, unknown>,
	): Promise<T> {
		let response: Response;
		try {
			response = await doFetch(`${base}${path}`, {
				method,
				headers: {
					authorization: `Bearer ${options.token}`,
					accept: "application/json",
					...(body === undefined ? {} : { "content-type": "application/json" }),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
			});
		} catch {
			throw new SsoUnavailable("the sign-in did not answer");
		}
		if (!response.ok) throw new SsoUnavailable(`the sign-in refused (${response.status})`);
		const parsed = schema.safeParse(await response.json().catch(() => undefined));
		if (!parsed.success) throw new SsoUnavailable("the sign-in answered something unexpected");
		return parsed.data;
	}

	const subjectOf = (user: z.infer<typeof User>): string => {
		switch (options.subMode) {
			case "hashed_user_id":
				return user.uid;
			case "user_id":
				return String(user.pk);
			case "user_username":
				return user.username;
			case "user_email":
				return user.email;
			default: {
				const never: never = options.subMode;
				return never;
			}
		}
	};
	const account = (user: z.infer<typeof User>): SsoAccount => ({
		userId: String(user.pk),
		subject: subjectOf(user),
		email: user.email,
		active: user.is_active,
	});

	return {
		async findByEmail(email) {
			const out = await call("GET", `/core/users/?email=${encodeURIComponent(email)}`, Users);
			const found = out.results.find((u) => u.email.toLowerCase() === email.toLowerCase());
			return found === undefined ? undefined : account(found);
		},
		async create(input) {
			const groups = await call(
				"GET",
				`/core/groups/?name=${encodeURIComponent(options.customersGroup)}`,
				Groups,
			);
			const group = groups.results.find((g) => g.name === options.customersGroup);
			if (group === undefined) throw new SsoUnavailable("the customers group does not exist");
			const user = await call("POST", "/core/users/", User, {
				username: input.email,
				name: input.name,
				email: input.email,
				is_active: true,
				groups: [group.pk],
				path: "customers",
			});
			return account(user);
		},
		async recoveryLink(userId) {
			return (await call("POST", `/core/users/${encodeURIComponent(userId)}/recovery/`, Recovery))
				.link;
		},
		async deactivate(userId) {
			await call("PATCH", `/core/users/${encodeURIComponent(userId)}/`, z.unknown(), {
				is_active: false,
			});
		},
	};
}
