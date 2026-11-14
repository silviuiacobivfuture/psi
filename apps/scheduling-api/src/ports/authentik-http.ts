import { z } from "zod";
import { type SsoAccount, SsoUnavailable } from "./sso";

export interface AuthentikHttpOptions {
	/** `https://auth.psizone.ro` */
	url: string;
	/** An API token whose user may create users, read groups and create recovery links. */
	token: string;
	/** Authentik's provider setting for `sub`. */
	subMode: "hashed_user_id" | "user_id" | "user_username" | "user_email";
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

export const AuthentikUser = z.object({
	pk: z.number().int(),
	username: z.string(),
	name: z.string().optional(),
	email: z.string(),
	is_active: z.boolean(),
	uid: z.string(),
	/** `internal`, `external`, or a service account's kind: only people are offered as members. */
	type: z.string().optional(),
	/** With `include_groups=true`: the groups the user is in, by name. */
	groups_obj: z.array(z.object({ pk: z.string(), name: z.string() })).nullish(),
});
export type AuthentikUser = z.infer<typeof AuthentikUser>;
export const AuthentikUsers = z.object({ results: z.array(AuthentikUser) });
export const AuthentikGroups = z.object({
	results: z.array(z.object({ pk: z.string(), name: z.string() })),
});
export const AuthentikRecovery = z.object({ link: z.string().url() });

export type AuthentikCall = <T>(
	method: "GET" | "POST" | "PATCH",
	path: string,
	schema: z.ZodType<T>,
	body?: Record<string, unknown>,
) => Promise<T>;

/**
 * One call to Authentik's admin API (`/api/v3`). Every answer is parsed; any transport or status failure is
 * `SsoUnavailable`, so a flow fails closed and nothing half-made is reported as done.
 */
export function authentikCaller(options: AuthentikHttpOptions): AuthentikCall {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const base = `${options.url.replace(/\/+$/, "")}/api/v3`;
	return async (method, path, schema, body) => {
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
		// An empty answer (204) is read as nothing; the schema decides whether that is acceptable.
		const text = await response.text().catch(() => "");
		let json: unknown;
		try {
			json = text === "" ? undefined : JSON.parse(text);
		} catch {
			json = undefined;
		}
		const parsed = schema.safeParse(json);
		if (!parsed.success) throw new SsoUnavailable("the sign-in answered something unexpected");
		return parsed.data;
	};
}

/** The `sub` a site's token carries for this user: what the provider's subject mode names. */
export function subjectOf(subMode: AuthentikHttpOptions["subMode"], user: AuthentikUser): string {
	switch (subMode) {
		case "hashed_user_id":
			return user.uid;
		case "user_id":
			return String(user.pk);
		case "user_username":
			return user.username;
		case "user_email":
			return user.email;
		default: {
			const never: never = subMode;
			return never;
		}
	}
}

export const accountOf = (
	subMode: AuthentikHttpOptions["subMode"],
	user: AuthentikUser,
): SsoAccount => ({
	userId: String(user.pk),
	subject: subjectOf(subMode, user),
	email: user.email,
	active: user.is_active,
});

/** The group of this exact name, or `SsoUnavailable`: a missing group is the estate's configuration to fix, not ours. */
export async function groupPk(call: AuthentikCall, name: string): Promise<string> {
	const groups = await call(
		"GET",
		`/core/groups/?name=${encodeURIComponent(name)}`,
		AuthentikGroups,
	);
	const group = groups.results.find((g) => g.name === name);
	if (group === undefined) throw new SsoUnavailable(`the group ${name} does not exist`);
	return group.pk;
}
